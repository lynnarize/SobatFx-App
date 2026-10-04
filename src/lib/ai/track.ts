// Market feedback for the advisor (after FinGPT's "labels from the market" idea).
// FinGPT labels each piece of news by the price move that followed it and trains on that.
// We can't fine-tune hosted models, so instead every trade plan the AI draws is recorded,
// scored later against real candles (TP first / SL first / expired), and the running record
// for the instrument goes back into the AI's context so it can calibrate itself.
// Resolved plans double as a labelled dataset (scripts/export-plans.ts) if we ever LoRA-tune
// an open model for the Free/Pro tiers.
//
// Server-only: uses the KV store and server candle fetching.

import { createHash } from "node:crypto";
import { extractDrawings } from "../drawings";
import { getCandles } from "../market/data";
import { regimeOf } from "../market/indicators";
import { type Candle, type Interval, INTERVALS, getInstrument, intervalSec } from "../market/symbols";
import { kv } from "../store";
import type { Tier } from "../tiers";
import { guardPlans } from "./plan-guard";
import type { ChatContext } from "./prompt";

/** Bars a plan gets to hit TP or SL before it's scored at market. */
export const HORIZON_BARS = 60;
const KEEP = 150; // plans remembered per instrument
const TTL = 90 * 86_400;

export type PlanStatus = "tp" | "sl" | "expired" | "nofill" | "void";

export interface PlanRecord {
  id: string;
  symbol: string;
  interval: Interval;
  tier: Tier;
  side: "long" | "short";
  entry: number;
  sl: number;
  tp: number;
  /** Open time (unix s) of the candle that was forming when the plan was made. */
  t: number;
  price: number;
  /** Candle source the plan was made on (e.g. "Binance Futures"). Venues price gold a few dollars apart,
   *  so a plan is only scored against candles from the same source. */
  source?: string;
  /** Market state when the plan was made. */
  feat: { rsi?: number | null; adx?: number | null; turbPct?: number | null; trend?: 1 | -1 | 0 };
  /** The AI's reply (drawing block removed), kept for the dataset export. */
  reply?: string;
  outcome?: { status: PlanStatus; r: number; at: number };
}

const planKey = (id: string) => `plan:${id}`;
const listKey = (symbol: string) => `plans:${symbol}`;

/**
 * Scores one plan against candles of its own timeframe. Pure; returns undefined while it's still live.
 * Conventions match the demo-trading engine: the candle the plan was made in is ignored (its range
 * happened before the plan), and when SL and TP fall in the same candle the SL counts.
 */
export function resolvePlan(p: Pick<PlanRecord, "side" | "entry" | "sl" | "tp" | "t" | "price">, candles: Candle[], barSec: number, horizon = HORIZON_BARS, now = Date.now() / 1000): PlanRecord["outcome"] | undefined {
  const long = p.side === "long";
  const risk = Math.abs(p.entry - p.sl);
  if (!risk) return { status: "void", r: 0, at: p.t };
  if (!candles.length || candles[0].time > p.t) {
    // History no longer reaches back to the plan: can't score it honestly.
    return now > p.t + barSec * (horizon + 1) ? { status: "void", r: 0, at: p.t } : undefined;
  }
  const after = candles.filter((c) => c.time > p.t).slice(0, horizon);
  // Entry within 10% of the risk from the price at the time = a market order, filled right away.
  let filled = Math.abs(p.price - p.entry) <= risk * 0.1;
  const below = p.entry < p.price;
  for (const c of after) {
    if (!filled) {
      filled = below ? c.low <= p.entry : c.high >= p.entry;
      // Price ran to the target without ever giving the entry: missed, not a win.
      if (!filled && (long ? c.high >= p.tp : c.low <= p.tp)) return { status: "nofill", r: 0, at: c.time };
      if (!filled) continue;
    }
    const hitSl = long ? c.low <= p.sl : c.high >= p.sl;
    const hitTp = long ? c.high >= p.tp : c.low <= p.tp;
    if (hitSl) return { status: "sl", r: -1, at: c.time };
    if (hitTp) return { status: "tp", r: +(Math.abs(p.tp - p.entry) / risk).toFixed(2), at: c.time };
  }
  // Only final once the horizon's last candle has closed.
  const done = after.length >= horizon && now >= after[horizon - 1].time + barSec;
  if (!done) return undefined;
  const last = after[horizon - 1];
  if (!filled) return { status: "nofill", r: 0, at: last.time };
  return { status: "expired", r: +((((long ? 1 : -1) * (last.close - p.entry)) / risk)).toFixed(2), at: last.time };
}

/**
 * Trade plans in an AI reply that make geometric sense (SL and TP on the correct sides of entry). With the chart's
 * candles they get the same structural corrections the chat applies (plan-guard), so the plan scored is the one drawn.
 */
export function plansFromReply(reply: string, candles?: Candle[], digits?: number) {
  // Any time/price range: the plan's time comes from the candles, and bad geometry is filtered below.
  const drawn = extractDrawings(reply, { tMin: 0, tMax: 2 ** 31, pMin: 0, pMax: 1e12, barSec: 3600 }).drawings;
  return (candles && digits != null ? guardPlans(drawn, candles, digits).drawings : drawn)
    .filter((d) => d.type === "position")
    .map((d) => ({ side: d.side === "short" ? ("short" as const) : ("long" as const), entry: d.price, sl: d.stopPrice!, tp: d.targetPrice! }))
    .filter((p) => (p.side === "long" ? p.sl < p.entry && p.entry < p.tp : p.tp < p.entry && p.entry < p.sl))
    .slice(0, 2);
}

/** Stores the trade plans from a finished reply. Never throws — feedback must not break chat. */
export async function recordPlans(reply: string, ctx: ChatContext | undefined, tier: Tier) {
  try {
    if (!ctx?.candles?.length || !ctx.lastPrice || !INTERVALS.some((i) => i.id === ctx.interval)) return;
    const candles = ctx.candles
      .filter((c) => c.every((v) => v != null))
      .map(([time, open, high, low, close]) => ({ time, open: open!, high: high!, low: low!, close: close! }));
    const plans = plansFromReply(reply, candles, getInstrument(ctx.symbol)?.digits);
    if (!plans.length) return;
    const t = ctx.candles.at(-1)![0];
    const ind = ctx.indicators ?? {};
    const e20 = ind.EMA20, e50 = ind.EMA50;
    const trend = e20 != null && e50 != null ? (e20 > e50 && ctx.lastPrice > e50 ? 1 : e20 < e50 && ctx.lastPrice < e50 ? -1 : 0) : 0;
    const text = extractDrawings(reply).text.slice(0, 2000);
    for (const p of plans) {
      // The same plan re-asked within a few hours counts once, or one busy user would dominate the record.
      const sig = createHash("sha256").update(`${ctx.symbol}|${ctx.interval}|${p.side}|${p.entry}|${p.sl}|${p.tp}`).digest("hex").slice(0, 24);
      if (await kv.get(`plan-seen:${sig}`)) continue;
      await kv.set(`plan-seen:${sig}`, 1, { ex: 6 * 3600 });
      const rec: PlanRecord = {
        id: `p_${sig}`,
        symbol: ctx.symbol,
        interval: ctx.interval as Interval,
        tier,
        ...p,
        t,
        price: ctx.lastPrice,
        source: ctx.source,
        feat: { rsi: ind.RSI14, adx: ind.ADX14, turbPct: ind.TurbulencePct, trend },
        reply: text,
      };
      await kv.set(planKey(rec.id), rec, { ex: TTL });
      await kv.lpushCapped(listKey(ctx.symbol), rec.id, KEEP);
    }
  } catch (e) {
    console.warn("[track] record failed", (e as Error).message);
  }
}

/**
 * Untagged gold plans predate source tags (Oct 2026). They were made and scored on Kraken XAUT — thin, gappy
 * bars a few dollars off the gold perps used since — so they say nothing about the current feed.
 */
const legacyGold = (p: PlanRecord) => p.symbol === "XAUUSD" && !p.source;

/** Loads an instrument's recent plans and scores any that have run their course. */
export async function loadTrack(symbol: string, limit = 60) {
  const ids = await kv.lrange(listKey(symbol), 0, limit - 1);
  const plans = (await kv.mget<PlanRecord>(ids.map(planKey))).filter((p): p is PlanRecord => Boolean(p) && !legacyGold(p!));
  const now = Date.now() / 1000;
  const open = plans.filter((p) => !p.outcome && now > p.t + intervalSec(p.interval));
  for (const iv of new Set(open.map((p) => p.interval))) {
    const res = await getCandles(symbol, iv).catch(() => null);
    if (!res) continue;
    for (const p of open.filter((x) => x.interval === iv)) {
      // Made on another venue (the server fell back, or the feed changed): its levels don't line up with
      // these candles. Wait for the source to return; past the horizon it can't be scored honestly.
      const sameSource = !p.source || p.source === res.source;
      const outcome = sameSource
        ? resolvePlan(p, res.candles, intervalSec(iv), HORIZON_BARS, now)
        : now > p.t + intervalSec(iv) * (HORIZON_BARS + 1)
          ? { status: "void" as const, r: 0, at: p.t }
          : undefined;
      if (!outcome) continue;
      p.outcome = outcome;
      await kv.set(planKey(p.id), p, { ex: TTL });
    }
  }
  return plans;
}

const pctStr = (w: number, n: number) => `${w}/${n} (${Math.round((100 * w) / n)}%)`;
const fmtDate = (t: number) => new Date(t * 1000).toISOString().slice(0, 16).replace("T", " ");

/** Compact track-record text for <app_context>. Pure. */
export function summarizeTrack(symbol: string, plans: PlanRecord[]) {
  const scored = plans.filter((p) => p.outcome && (p.outcome.status === "tp" || p.outcome.status === "sl" || p.outcome.status === "expired"));
  const pending = plans.filter((p) => !p.outcome).length;
  const missed = plans.filter((p) => p.outcome?.status === "nofill").length;
  if (!scored.length) return pending ? `Track record ${symbol}: ${pending} earlier plan(s) still running, none scored yet.` : "";
  const wins = (xs: PlanRecord[]) => xs.filter((p) => p.outcome!.r > 0).length;
  const avgR = (xs: PlanRecord[]) => (xs.reduce((a, p) => a + p.outcome!.r, 0) / xs.length).toFixed(2);
  const group = (label: string, key: (p: PlanRecord) => string | null) => {
    const m = new Map<string, PlanRecord[]>();
    for (const p of scored) {
      const k = key(p);
      if (k) m.set(k, [...(m.get(k) ?? []), p]);
    }
    return m.size > 1 || (m.size === 1 && label === "timeframe") ? `By ${label}: ${[...m].map(([k, xs]) => `${k} ${pctStr(wins(xs), xs.length)} avg ${avgR(xs)}R`).join("; ")}` : "";
  };
  const tp = scored.filter((p) => p.outcome!.status === "tp").length;
  const sl = scored.filter((p) => p.outcome!.status === "sl").length;
  const recent = scored
    .slice(0, 5)
    .map((p) => `- ${fmtDate(p.t)} UTC ${p.interval} ${p.side} entry ${p.entry} SL ${p.sl} TP ${p.tp}` +
      ` [RSI ${p.feat.rsi ?? "?"}, ADX ${p.feat.adx ?? "?"}, regime ${regimeOf(p.feat.turbPct) ?? "?"}, trend ${p.feat.trend === 1 ? "up" : p.feat.trend === -1 ? "down" : "flat"}]` +
      ` → ${p.outcome!.status === "expired" ? "expired" : p.outcome!.status.toUpperCase() + " hit"} (${p.outcome!.r > 0 ? "+" : ""}${p.outcome!.r}R)`);
  return [
    `Track record — your own earlier ${symbol} trade plans, scored against the prices that followed (TP first, SL first, or ${HORIZON_BARS} bars then marked at market):`,
    `Scored ${scored.length}${scored.length < 10 ? " (small sample — anecdotal)" : ""}: ${tp} TP, ${sl} SL, ${scored.length - tp - sl} expired · win rate ${Math.round((100 * wins(scored)) / scored.length)}% · avg ${avgR(scored)}R per plan${missed ? ` · ${missed} never filled` : ""}${pending ? ` · ${pending} still running` : ""}`,
    group("side", (p) => p.side),
    group("timeframe", (p) => p.interval),
    group("regime", (p) => regimeOf(p.feat.turbPct)),
    group("trend alignment", (p) => (!p.feat.trend ? "flat trend" : (p.feat.trend === 1) === (p.side === "long") ? "with trend" : "counter-trend")),
    "Most recent:",
    ...recent,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Track-record block for the chat context; empty on any failure. */
export async function trackRecord(symbol: string) {
  try {
    return summarizeTrack(symbol, await loadTrack(symbol));
  } catch (e) {
    console.warn("[track] load failed", (e as Error).message);
    return "";
  }
}
