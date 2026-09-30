/**
 * Trade-analysis research eval for the Pro tier: which model gives correct, useful trade plans,
 * and does a prompt/context change help? Complements eval-ai.ts (behaviour) with measured quality.
 *
 *   npm run eval:trade                       build fresh scenarios, run all models × arms
 *   npm run eval:trade -- --reuse            rerun on the saved scenarios (same inputs → comparable)
 *   npm run eval:trade -- --models a,b --arms pipvalue
 *
 * Design
 *  - Scenarios are frozen app contexts (built exactly like AIPanel.buildContext + the chat route: candles,
 *    indicators, swings, higher-timeframe block, news) saved to scripts/eval-trade/scenarios.json.
 *      live:     5 realistic questions on current data (graded blind by a person: live-blind.md / live-key.json)
 *      backtest: historical cut-offs; the 60 candles that followed are stored and each plan is scored
 *                with the app's own resolvePlan (TP first / SL first / expired / not filled).
 *  - Arms (a paired ablation: only the risk/lot-sizing line of the context differs):
 *      baseline  the original line: "balance, risk % per trade"
 *      pipvalue  v1: + risk money + pip value per 1.00 lot + shortcut formula
 *      worked    v2 (current src/lib/ai/prompt.ts): step-by-step recipe with a worked example in the
 *                instrument's own prices
 *    "<arm>#2" samples an arm again, to measure run-to-run noise (models are sampled, not deterministic).
 *    --rescore makes no calls: it re-measures every saved answer and rebuilds the report.
 *    --reuse keeps earlier answers for arms not being run (re-scored with the current metrics), so a new
 *    arm can be added without re-running the old ones.
 *  - Calls mirror streamCompat in src/lib/ai/providers.ts (same body, no fallback models) but read the
 *    usage/cost OpenRouter reports, and repeat the chat route's draw-block follow-up when a reply has none.
 *  - Metrics are automatic and deterministic (lot vs the app calculator, R:R, SL vs ATR, format, cost,
 *    latency, outcome). Rates get Wilson 95% CIs, means get seeded bootstrap 95% CIs.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { contextBlock, systemPrompt, type ChatContext } from "../src/lib/ai/prompt";
import { scrub } from "../src/lib/ai/sanitize";
import { mtfBlock, formatMtf, higherTimeframes, summarizeTf } from "../src/lib/ai/mtf";
import { resolvePlan } from "../src/lib/ai/track";
import { checkPlans, lotsInText } from "../src/lib/ai/lot-check";
import { extractDrawings } from "../src/lib/drawings";
import { getCandles } from "../src/lib/market/data";
import { adx, atr, bollinger, ema, macd, rsi, swings, turbulence } from "../src/lib/market/indicators";
import { DEFAULT_RISK, pipValueUsd, positionSize, type RiskSettings } from "../src/lib/market/risk";
import { type Candle, type Interval, getInstrument, intervalSec, newsKeys } from "../src/lib/market/symbols";
import { newsDigest } from "../src/lib/news";

const OUT = join(process.cwd(), "scripts", "eval-trade");
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const MODELS = (arg("models") ?? "thinkingmachines/inkling,qwen/qwen3.8-flash,nvidia/nemotron-3.5-lightning").split(",");
const ARMS = (arg("arms") ?? "baseline,pipvalue,worked").split(",") as Arm[];
const CONCURRENCY = Number(arg("concurrency") ?? 6);
const RISK: RiskSettings = { ...DEFAULT_RISK, balance: 1000, riskPct: 1, currency: "USD" };
const HORIZON = 60;

/** A wording, optionally with a replicate tag ("baseline#2" = the same wording sampled again). */
type Arm = string;
interface Scenario {
  id: string;
  kind: "live" | "backtest";
  inst: string;
  iv: Interval;
  lang: "id" | "en";
  prompt: string;
  ctx: ChatContext;
  news: string;
  mtf: string;
  atr: number;
  /** Candles after the cut-off (backtest only), for scoring. */
  future?: Candle[];
}

// ─── Scenario building (mirrors AIPanel.buildContext) ────────────────────────
function buildCtx(instId: string, iv: Interval, all: Candle[], drawings: unknown[] = []): ChatContext {
  const inst = getInstrument(instId)!;
  const recent = all.slice(-120);
  const closes = all.map((c) => c.close);
  const r = (v: number | null | undefined) => (v == null ? null : +v.toFixed(inst.digits));
  const e20 = ema(closes, 20), e50 = ema(closes, 50), e200 = ema(closes, 200);
  const m = macd(closes), bb = bollinger(closes), turb = turbulence(all.slice(0, -1));
  const pv = pipValueUsd(inst, all.at(-1)!.close);
  return {
    page: "chart",
    symbol: inst.id,
    symbolName: inst.name,
    interval: iv,
    lastPrice: all.at(-1)!.close,
    candles: recent.map((c) => [c.time, r(c.open), r(c.high), r(c.low), r(c.close)]),
    indicators: {
      EMA20: r(e20.at(-1)), EMA50: r(e50.at(-1)), EMA200: r(e200.at(-1)),
      RSI14: rsi(closes) != null ? +rsi(closes)!.toFixed(1) : null,
      ATR14: r(atr(all)),
      MACD: m ? +m.macd.toPrecision(4) : null, MACDsignal: m ? +m.signal.toPrecision(4) : null,
      BBupper: r(bb?.upper), BBlower: r(bb?.lower),
      ADX14: adx(all) != null ? +adx(all)!.toFixed(1) : null,
      TurbulencePct: turb ? Math.round(turb.pct) : null,
      pipSize: inst.pip,
    },
    swings: swings(recent),
    drawings,
    risk: { balance: RISK.balance, riskPct: RISK.riskPct, currency: RISK.currency, pipValue: Number.isFinite(pv) ? +pv.toPrecision(6) : undefined },
  };
}

/** Higher-timeframe block as it would have looked at a past moment (closed candles only). */
async function mtfAt(instId: string, iv: Interval, cutoff: number) {
  const inst = getInstrument(instId)!;
  const sums = [];
  for (const h of higherTimeframes(iv, "pro")) {
    const c = (await getCandles(instId, h)).candles.filter((x) => x.time <= cutoff);
    const s = summarizeTf(h, c, inst.digits);
    if (s) sums.push(s);
  }
  return formatMtf(instId, iv, sums);
}

const LIVE = [
  { id: "L1-gold-analysis", inst: "XAUUSD", iv: "1h", lang: "id", prompt: "Analisa XAU/USD sekarang dong, ada setup bagus?" },
  { id: "L2-eurusd-plan", inst: "EURUSD", iv: "4h", lang: "en", prompt: "Full analysis of EUR/USD on this chart and give me a trade plan." },
  { id: "L3-btc-scalp", inst: "BTCUSD", iv: "15m", lang: "id", prompt: "Mau scalping BTC sekarang, entry di mana, SL TP berapa, lot berapa buat modal saya?" },
  { id: "L4-usdjpy-review", inst: "USDJPY", iv: "1h", lang: "id", prompt: "Cek trade plan saya di chart, sudah bagus belum? Apa yang perlu diubah?", review: true },
  { id: "L5-gold-revenge", inst: "XAUUSD", iv: "1h", lang: "id", prompt: "Hari ini saya udah loss 3x di gold, total -6%. Mau balas pakai lot 0.5 biar balik modal. Entry buy sekarang ya?" },
] as const;
const BT_SETS: { inst: string; iv: Interval }[] = [
  { inst: "XAUUSD", iv: "1h" }, { inst: "XAUUSD", iv: "4h" }, { inst: "EURUSD", iv: "1h" },
  { inst: "GBPUSD", iv: "4h" }, { inst: "USDJPY", iv: "1h" }, { inst: "BTCUSD", iv: "1h" },
];
const BT_PROMPT = "Kasih 1 setup trading terbaik sekarang (long atau short) lengkap entry, SL, TP dan lot untuk modal saya, lalu gambar di chart. Kalau tidak ada setup yang layak, bilang saja.";
const CUTS = Number(arg("cuts") ?? 6);
const CUT_GAP = 30;

async function buildScenarios(): Promise<Scenario[]> {
  const out: Scenario[] = [];
  for (const c of LIVE) {
    const inst = getInstrument(c.inst)!;
    const all = (await getCandles(c.inst, c.iv)).candles;
    let drawings: unknown[] = [];
    if ("review" in c) {
      // A user plan with two planted mistakes: stop inside the noise (0.25 ATR) and a far-away target (6 ATR).
      const base = buildCtx(c.inst, c.iv, all), last = base.lastPrice!, a = Number(base.indicators!.ATR14);
      const hi = base.swings?.highs.at(-1)?.price ?? last + 2 * a;
      const f = (v: number) => +v.toFixed(inst.digits);
      drawings = [
        { by: "user", type: "position", side: "long", entry: f(last), sl: f(last - 0.25 * a), tp: f(last + 6 * a) },
        { by: "user", type: "hline", price: f(hi), label: "Resistance" },
      ];
    }
    const ctx = buildCtx(c.inst, c.iv, all, drawings);
    const [news, mtf] = await Promise.all([newsDigest(newsKeys(inst), inst).catch(() => "News digest unavailable."), mtfBlock(c.inst, c.iv, "pro")]);
    out.push({ id: c.id, kind: "live", inst: c.inst, iv: c.iv, lang: c.lang, prompt: c.prompt, ctx, news, mtf, atr: Number(ctx.indicators!.ATR14) });
    console.log("scenario", c.id);
  }
  for (const s of BT_SETS) {
    const full = (await getCandles(s.inst, s.iv)).candles;
    for (let k = 0; k < CUTS; k++) {
      const cut = full.length - HORIZON - 2 - k * CUT_GAP;
      if (cut < 250) break;
      const hist = full.slice(0, cut + 1);
      const ctx = buildCtx(s.inst, s.iv, hist);
      const mtf = await mtfAt(s.inst, s.iv, hist.at(-1)!.time);
      const id = `B-${s.inst}-${s.iv}-${new Date(hist.at(-1)!.time * 1000).toISOString().slice(0, 13)}`;
      out.push({ id, kind: "backtest", inst: s.inst, iv: s.iv, lang: "id", prompt: BT_PROMPT, ctx, news: "News digest unavailable for this moment.", mtf, atr: Number(ctx.indicators!.ATR14), future: full.slice(cut + 1, cut + 1 + HORIZON) });
    }
    console.log("scenarios", s.inst, s.iv);
  }
  return out;
}

// ─── Arms ────────────────────────────────────────────────────────────────────
/** The user turn for an arm: the current context, with the risk line swapped for the older wording. */
function userTurn(s: Scenario, arm: Arm) {
  let block = contextBlock(s.ctx, s.news, false, s.lang, "", s.mtf);
  const r = s.ctx.risk!;
  const money = +((r.balance * r.riskPct) / 100).toFixed(2);
  const old = `User risk settings: balance ${r.balance} ${r.currency}, risk ${r.riskPct}% per trade`;
  const pv = r.pipValue ? +r.pipValue.toFixed(r.pipValue < 1 ? 4 : 2) : 0;
  const wording = arm.split("#")[0];
  if (!["baseline", "pipvalue", "worked"].includes(wording)) throw new Error(`unknown arm ${arm}`);
  if (wording === "baseline") block = block.replace(/^User risk settings: .*$/m, old);
  if (wording === "pipvalue") block = block.replace(/^User risk settings: .*$/m, `${old} = ${money} ${r.currency} at risk. Pip value for ${s.ctx.symbol}: 1 pip on 1.00 lot = ${pv} ${r.currency}, so lot = ${money} ÷ (SL pips × ${pv}), rounded down to 0.01`);
  return `${block}\n\n${s.prompt}`;
}

// ─── Model calls (mirror streamCompat; read usage) ──────────────────────────
interface Call { text: string; err: string; sec: number; ttft: number; tokIn: number; tokOut: number; tokReason: number; cost: number; provider: string }

async function stream(model: string, messages: { role: string; content: string }[]): Promise<Call> {
  const t0 = Date.now();
  const res: Call = { text: "", err: "", sec: 0, ttft: 0, tokIn: 0, tokOut: 0, tokReason: 0, cost: 0, provider: "" };
  try {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json", "HTTP-Referer": process.env.NEXTAUTH_URL ?? "https://sobatfx.app", "X-Title": "SobatFX" },
      body: JSON.stringify({ model, messages, stream: true, max_tokens: 2500, reasoning: { enabled: false }, stream_options: { include_usage: true } }),
      signal: AbortSignal.timeout(180_000),
    });
    if (!r.ok || !r.body) {
      res.err = `${r.status} ${(await r.text()).slice(0, 160)}`;
      return res;
    }
    const dec = new TextDecoder();
    let buf = "";
    for await (const chunk of r.body as unknown as AsyncIterable<Uint8Array>) {
      buf += dec.decode(chunk, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:") || line === "data: [DONE]") continue;
        const j = JSON.parse(line.slice(5));
        if (j.error) res.err = String(j.error.message ?? j.error);
        const t = j.choices?.[0]?.delta?.content;
        if (t) {
          if (!res.ttft) res.ttft = (Date.now() - t0) / 1000;
          res.text += t;
        }
        if (j.provider) res.provider = j.provider;
        if (j.usage) {
          res.tokIn = j.usage.prompt_tokens ?? 0;
          res.tokOut = j.usage.completion_tokens ?? 0;
          res.tokReason = j.usage.completion_tokens_details?.reasoning_tokens ?? 0;
          res.cost = j.usage.cost ?? 0;
        }
      }
    }
  } catch (e) {
    res.err = (e as Error).message;
  }
  res.sec = (Date.now() - t0) / 1000;
  return res;
}

/** Same test the chat route uses to decide a reply talked about levels (and so needs a drawing block). */
function mentionsLevels(text: string, last?: number) {
  if (!last) return false;
  const nums = (text.match(/\d[\d.,]*\d/g) ?? []).map((s) => Number(s.replace(/[.,](?=\d{3}\b)/g, "").replace(",", ".")));
  return nums.filter((n) => Math.abs(n - last) / last < 0.15).length >= 2;
}

async function answer(model: string, s: Scenario, arm: Arm) {
  const system = systemPrompt("pro");
  const user = userTurn(s, arm);
  const first = await stream(model, [{ role: "system", content: system }, { role: "user", content: user }]);
  let text = first.text;
  let followUp: Call | null = null;
  if (!first.err && !/sobatfx[-_ ]draw/i.test(text) && mentionsLevels(text, s.ctx.lastPrice)) {
    followUp = await stream(model, [
      { role: "system", content: system },
      { role: "user", content: user },
      { role: "assistant", content: text },
      { role: "user", content: "Now output ONLY the ```sobatfx-draw``` fenced block for the levels, zones, trendlines and trade plan you described above — no other text." },
    ]);
    const m = /```\s*sobatfx[-_ ]draw[\s\S]*?```/i.exec(followUp.text);
    if (m) text += `\n\n${m[0]}`;
  }
  return { first, followUp, text: scrub(text) };
}

// ─── Metrics ─────────────────────────────────────────────────────────────────
const TOO_WIDE = /terlalu (lebar|jauh|besar)|too (wide|far)|di ?bawah 0[.,]01|below 0[.,]01|kurang dari 0[.,]01|<\s?0[.,]01|minimum 0[.,]01/i;
const SELF_TALK = /\b(tunggu,|wait[,.]|salah\.|koreksi:|actually,|hmm+|let me re|mari (cek|hitung) ulang|oops)/gi;
const DISCLAIMER = /Edukasi, bukan saran keuangan|Educational, not financial advice/i;

/** Entry/SL/TP written in prose, for replies that describe a plan without drawing it. */
function textPlan(prose: string) {
  const num = (s: string) => Number(s.replace(/[$*\s]/g, "").replace(/,(?=\d{3}\b)/g, "").replace(",", "."));
  const grab = (re: RegExp) => { const m = re.exec(prose); return m ? num(m[1]) : NaN; };
  const entry = grab(/\bentry[^\d\n]{0,40}?\$?\s*(\d[\d.,]*\d)/i);
  const sl = grab(/\b(?:SL|stop[- ]?loss)\b[^\d\n]{0,30}?\$?\s*(\d[\d.,]*\d)/i);
  const tp = grab(/\b(?:TP1?|take[- ]?profit(?: 1)?|target)\b[^\d\n]{0,30}?\$?\s*(\d[\d.,]*\d)/i);
  if (![entry, sl, tp].every(Number.isFinite)) return null;
  const side: "long" | "short" = tp > entry ? "long" : "short";
  return (side === "long" ? sl < entry && entry < tp : tp < entry && entry < sl) ? { side, entry, sl, tp } : null;
}

function measure(s: Scenario, text: string) {
  const inst = getInstrument(s.inst)!;
  const candles = s.ctx.candles!;
  const lows = candles.map((c) => c[3]!), highs = candles.map((c) => c[2]!);
  const range = { tMin: candles[0][0], tMax: candles.at(-1)![0], pMin: Math.min(...lows), pMax: Math.max(...highs), barSec: intervalSec(s.iv) };
  const d = extractDrawings(text, range);
  const prose = d.text;
  const words = prose.split(/\s+/).filter(Boolean).length;
  const idW = (prose.match(/\b(dan|yang|di|untuk|dengan|ini|ke|jika|harga|karena)\b/gi) ?? []).length;
  const enW = (prose.match(/\b(the|and|for|with|this|to|if|price|because|is)\b/gi) ?? []).length;
  const positions = d.drawings.filter((x) => x.type === "position");
  const drawn = positions
    .map((p) => ({ side: p.side === "short" ? ("short" as const) : ("long" as const), entry: p.price, sl: p.stopPrice!, tp: p.targetPrice! }))
    .find((p) => (p.side === "long" ? p.sl < p.entry && p.entry < p.tp : p.tp < p.entry && p.entry < p.sl));
  const plan = drawn ?? textPlan(prose);
  const stated = lotsInText(prose);
  let lot: "correct" | "oversized" | "undersized" | "roundedUp" | "missing" | null = null;
  let calcLot: number | null = null;
  if (plan) {
    const ps = positionSize(inst, RISK, plan.entry, plan.sl, plan.tp);
    calcLot = ps?.lot ?? null;
    // The first lot named is the plan's own; later ones are usually "if you tighten the SL…" alternatives.
    if (ps) {
      const main = stated[0];
      if (main == null) lot = "missing";
      else if (ps.lot < 0.01) lot = TOO_WIDE.test(prose) ? "correct" : main >= 0.02 ? "oversized" : "roundedUp";
      else if (stated.some((l) => Math.abs(l - ps.lot) <= 0.0101)) lot = "correct";
      else lot = main > ps.lot * 1.5 + 0.01 ? "oversized" : "undersized";
    }
  }
  const check = checkPlans(prose, d.drawings, inst, RISK)[0];
  const last = s.ctx.lastPrice!;
  let outcome: { status: string; r: number } | null = null;
  if (plan && s.future?.length) {
    const lastCandle = candles.at(-1)!;
    const series: Candle[] = [{ time: lastCandle[0], open: lastCandle[1]!, high: lastCandle[2]!, low: lastCandle[3]!, close: lastCandle[4]! }, ...s.future];
    outcome = resolvePlan({ ...plan, t: lastCandle[0], price: last }, series, intervalSec(s.iv), HORIZON, Date.now() / 1000) ?? { status: "open", r: 0 };
  }
  return {
    words, lang: idW >= enW ? "id" : "en", langOk: (idW >= enW ? "id" : "en") === s.lang,
    disclaimer: DISCLAIMER.test(prose), selfTalk: (prose.match(SELF_TALK) ?? []).length,
    drawBlock: /sobatfx-draw/i.test(text), drawings: d.drawings.length, unreadable: d.unreadable,
    planSource: drawn ? "drawn" : plan ? "text" : positions.length ? "badGeometry" : "none",
    plan, rr: plan ? +(Math.abs(plan.tp - plan.entry) / Math.abs(plan.entry - plan.sl)).toFixed(2) : null,
    slATR: plan ? +(Math.abs(plan.entry - plan.sl) / s.atr).toFixed(2) : null,
    entryATR: plan ? +(Math.abs(plan.entry - last) / s.atr).toFixed(2) : null,
    statedLots: stated, calcLot, lot, calcMismatch: check ? check.mismatch : null, calcTooWide: check ? check.tooWide : null,
    outcome,
  };
}

// ─── Statistics ──────────────────────────────────────────────────────────────
function wilson(k: number, n: number) {
  if (!n) return "–";
  const z = 1.96, p = k / n, d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d, h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return `${Math.round(p * 100)}% [${Math.round(Math.max(0, c - h) * 100)}–${Math.round(Math.min(1, c + h) * 100)}] (${k}/${n})`;
}
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function bootMean(xs: number[], seed = 42) {
  if (!xs.length) return "–";
  const rand = rng(seed), means: number[] = [];
  for (let b = 0; b < 4000; b++) {
    let s = 0;
    for (let i = 0; i < xs.length; i++) s += xs[Math.floor(rand() * xs.length)];
    means.push(s / xs.length);
  }
  means.sort((a, b) => a - b);
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return `${m.toFixed(2)} [${means[100].toFixed(2)} … ${means[3899].toFixed(2)}]`;
}
/** Two-sided exact sign test on paired flips (fixed vs broken). */
function signTest(a: number, b: number) {
  const n = a + b;
  if (!n) return "–";
  const k = Math.min(a, b);
  let p = 0;
  for (let i = 0; i <= k; i++) {
    let c = 1;
    for (let j = 0; j < i; j++) c = (c * (n - j)) / (j + 1);
    p += c / 2 ** n;
  }
  return Math.min(1, 2 * p).toFixed(3);
}
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

// ─── Run ─────────────────────────────────────────────────────────────────────
type Row = { scenario: string; kind: Scenario["kind"]; model: string; arm: Arm; text: string; first: Call; followUp: Call | null } & ReturnType<typeof measure>;

async function pool<T>(jobs: (() => Promise<T>)[], n: number) {
  const out: T[] = new Array(jobs.length);
  let next = 0, done = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (next < jobs.length) {
        const i = next++;
        out[i] = await jobs[i]();
        if (++done % 10 === 0 || done === jobs.length) console.log(`  ${done}/${jobs.length} answers`);
      }
    }),
  );
  return out;
}

function report(scn: Scenario[], rows: Row[]) {
  const L: string[] = [];
  const models = [...new Set(rows.map((r) => r.model))], arms = [...new Set(rows.map((r) => r.arm))];
  const short = (m: string) => m.split("/")[1];
  const of = (m: string, a: Arm, kind?: Scenario["kind"]) => rows.filter((r) => r.model === m && r.arm === a && (!kind || r.kind === kind));
  const nBt = scn.filter((s) => s.kind === "backtest").length;
  L.push(`# SobatFX trade-analysis eval — ${new Date().toISOString().slice(0, 16)}Z`, "");
  L.push(`${scn.length} scenarios (${scn.length - nBt} live, ${nBt} backtest) × ${models.length} models × ${arms.length} arms = ${rows.length} answers. Risk: $1000, 1%. Pro system prompt. 95% CIs: Wilson (rates), bootstrap (means).`, "");

  L.push("## 1. Delivery: speed, cost, format", "", "| model | arm | errors | avg s | first token s | avg cost $ | words (≤250) | disclaimer shown | self-talk | follow-up call needed |", "|---|---|---|---|---|---|---|---|---|---|");
  for (const m of models) for (const a of arms) {
    const rs = of(m, a), ok = rs.filter((r) => !r.first.err);
    const cost = ok.map((r) => r.first.cost + (r.followUp?.cost ?? 0));
    L.push(`| ${short(m)} | ${a} | ${rs.length - ok.length} | ${avg(ok.map((r) => r.first.sec + (r.followUp?.sec ?? 0))).toFixed(1)} | ${avg(ok.map((r) => r.first.ttft)).toFixed(1)} | ${avg(cost).toFixed(4)} | ${Math.round(avg(ok.map((r) => r.words)))} (${wilson(ok.filter((r) => r.words <= 250).length, ok.length)}) | ${wilson(ok.filter((r) => r.disclaimer).length, ok.length)} | ${wilson(ok.filter((r) => r.selfTalk > 0).length, ok.length)} | ${wilson(ok.filter((r) => r.followUp).length, ok.length)} |`);
  }

  L.push("", "## 2. Risk maths (every answer that contains a plan)", "", "Lot is judged against the app's calculator for the model's own entry/SL (drawn plan, else the plan in the text). *correct* = any lot named matches (or the reply says the stop is too wide when even 0.01 lot is too big); *oversized* = the first lot named is >1.5× the correct one, or ≥0.02 when even 0.01 is too big — the dangerous error; *0.01 on a too-wide stop* = rounds up to the minimum without warning, so it risks more than planned (a milder version of the same error).", "", "| model | arm | plans (drawn/text) | lot correct | lot oversized | 0.01 on a too-wide stop | lot undersized | lot missing | R:R ≥ 1.5 | SL < 0.5 ATR |", "|---|---|---|---|---|---|---|---|---|---|");
  for (const m of models) for (const a of arms) {
    const ps = of(m, a).filter((r) => r.plan);
    const n = ps.length, c = (k: string) => ps.filter((r) => r.lot === k).length;
    L.push(`| ${short(m)} | ${a} | ${n} (${ps.filter((r) => r.planSource === "drawn").length}/${ps.filter((r) => r.planSource === "text").length}) | ${wilson(c("correct"), n)} | ${wilson(c("oversized"), n)} | ${wilson(c("roundedUp"), n)} | ${wilson(c("undersized"), n)} | ${wilson(c("missing"), n)} | ${wilson(ps.filter((r) => (r.rr ?? 0) >= 1.5).length, n)} | ${wilson(ps.filter((r) => (r.slATR ?? 9) < 0.5).length, n)} |`);
  }

  L.push("", "### Effect of the context wording (paired: same scenario, same model)", "", "| model | comparison | lot correct | fixed | broken | oversized | sign test p (fixed vs broken) |", "|---|---|---|---|---|---|---|");
  // Each comparison is a list of (arm1, arm2) pairings; a pooled one pairs replicate with replicate.
  const comps: { label: string; pairs: [Arm, Arm][] }[] = [
    { label: "baseline → pipvalue", pairs: [["baseline", "pipvalue"]] },
    { label: "baseline → worked", pairs: [["baseline", "worked"]] },
    { label: "pipvalue → worked", pairs: [["pipvalue", "worked"]] },
    { label: "baseline → baseline#2 (noise)", pairs: [["baseline", "baseline#2"]] },
    { label: "worked → worked#2 (noise)", pairs: [["worked", "worked#2"]] },
    { label: "baseline → worked, both runs pooled", pairs: [["baseline", "worked"], ["baseline#2", "worked#2"]] },
  ].map((c) => ({ ...c, pairs: c.pairs.filter(([a, b]) => arms.includes(a) && arms.includes(b)) as [Arm, Arm][] }))
    .filter((c) => c.pairs.length && !(c.label.includes("pooled") && c.pairs.length < 2));
  for (const m of models) for (const comp of comps) {
    let fixed = 0, broken = 0, c1 = 0, c2 = 0, o1 = 0, o2 = 0, n = 0;
    for (const [a1, a2] of comp.pairs) for (const s of scn) {
      const r1 = rows.find((r) => r.scenario === s.id && r.model === m && r.arm === a1);
      const r2 = rows.find((r) => r.scenario === s.id && r.model === m && r.arm === a2);
      if (!r1?.plan || !r2?.plan) continue;
      n++;
      const k1 = r1.lot === "correct", k2 = r2.lot === "correct";
      c1 += +k1; c2 += +k2; o1 += +(r1.lot === "oversized"); o2 += +(r2.lot === "oversized");
      if (!k1 && k2) fixed++;
      if (k1 && !k2) broken++;
    }
    L.push(`| ${short(m)} | ${comp.label} (n=${n}) | ${c1} → ${c2} | ${fixed} | ${broken} | ${o1} → ${o2} | ${signTest(fixed, broken)} |`);
  }

  L.push("", "## 3. Backtest outcomes (plans scored on the 60 candles that followed)", "", "Standing aside counts as 0R. A plan with a stop inside the noise can post a freak win (e.g. a 1-pip SL hitting a 46R target), so the capped column is the fairer read. Small samples: read the CIs, not the point estimates.", "", "| model | arm | setups | plans | TP | SL | expired | not filled | win rate (TP÷(TP+SL)) | mean R per setup [95% CI] | same, wins capped at 5R | total R |", "|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const m of models) for (const a of arms) {
    const rs = of(m, a, "backtest");
    const st = (k: string) => rs.filter((r) => r.outcome?.status === k).length;
    const rsR = rs.map((r) => r.outcome?.r ?? 0);
    L.push(`| ${short(m)} | ${a} | ${rs.length} | ${rs.filter((r) => r.plan).length} | ${st("tp")} | ${st("sl")} | ${st("expired")} | ${st("nofill")} | ${wilson(st("tp"), st("tp") + st("sl"))} | ${bootMean(rsR)} | ${bootMean(rsR.map((x) => Math.min(x, 5)))} | ${rsR.reduce((x, y) => x + y, 0).toFixed(1)} |`);
  }
  const armP: Arm = arms.includes("worked") ? "worked" : arms.includes("pipvalue") ? "pipvalue" : arms[0];
  L.push("", `### Paired model differences in mean R per setup, wins capped at 5R (row − column, ${armP} arm)`, "");
  L.push(`| | ${models.map(short).join(" | ")} |`, `|---|${models.map(() => "---").join("|")}|`);
  for (const m1 of models) {
    const cells = models.map((m2) => {
      if (m1 === m2) return "–";
      const diffs = scn.filter((s) => s.kind === "backtest").map((s) => {
        const r1 = rows.find((r) => r.scenario === s.id && r.model === m1 && r.arm === armP);
        const r2 = rows.find((r) => r.scenario === s.id && r.model === m2 && r.arm === armP);
        return Math.min(r1?.outcome?.r ?? 0, 5) - Math.min(r2?.outcome?.r ?? 0, 5);
      });
      return bootMean(diffs);
    });
    L.push(`| ${short(m1)} | ${cells.join(" | ")} |`);
  }
  L.push("", "_A CI that includes 0 means the backtest can't tell the models apart._", "");
  return L.join("\n");
}

function blindPacket(scn: Scenario[], rows: Row[]) {
  const have = new Set(rows.map((r) => r.arm));
  const arm: Arm = have.has("worked") ? "worked" : have.has("pipvalue") ? "pipvalue" : [...have][0];
  const rand = rng(7);
  const key: Record<string, Record<string, string>> = {};
  const L: string[] = [`# Blind grading packet (live scenarios, ${arm} arm)`, "", "Grade each answer 0–5 on: data fidelity · reasoning (trend/HTF/news) · risk correctness · clarity. Model names are in live-key.json — open it only after grading.", ""];
  for (const s of scn.filter((x) => x.kind === "live")) {
    const rs = rows.filter((r) => r.scenario === s.id && r.arm === arm).map((r) => [rand(), r] as const).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    key[s.id] = {};
    const ind = s.ctx.indicators!;
    L.push(`## ${s.id} — ${s.inst} ${s.iv}`, `**Prompt:** ${s.prompt}`, "", "```", `Last ${s.ctx.lastPrice} · ATR ${ind.ATR14} · EMA20 ${ind.EMA20} · EMA50 ${ind.EMA50} · EMA200 ${ind.EMA200} · RSI ${ind.RSI14} · ADX ${ind.ADX14}`, `Swing highs: ${s.ctx.swings?.highs.map((x) => x.price).join(", ")}`, `Swing lows: ${s.ctx.swings?.lows.map((x) => x.price).join(", ")}`, s.ctx.drawings?.length ? `User drawings: ${JSON.stringify(s.ctx.drawings)}` : "", s.mtf, s.news.slice(0, 1200), "```", "");
    rs.forEach((r, i) => {
      const label = String.fromCharCode(65 + i);
      key[s.id][label] = r.model;
      L.push(`### Answer ${label}`, "", r.first.err ? `**ERROR:** ${r.first.err}` : r.text, "", `_auto: words ${r.words}, plan ${r.planSource}, lot ${r.lot ?? "–"} (calc ${r.calcLot ?? "–"}, stated ${r.statedLots.join("/") || "–"}), R:R ${r.rr ?? "–"}, SL ${r.slATR ?? "–"} ATR, self-talk ${r.selfTalk}_`, "");
    });
  }
  writeFileSync(join(OUT, "live-blind.md"), L.join("\n"));
  writeFileSync(join(OUT, "live-key.json"), JSON.stringify(key, null, 1));
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const file = join(OUT, "scenarios.json");
  const scn: Scenario[] = (process.argv.includes("--reuse") || process.argv.includes("--rescore")) && existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : await buildScenarios();
  writeFileSync(file, JSON.stringify(scn));
  console.log(`${scn.length} scenarios · models ${MODELS.join(", ")} · arms ${ARMS.join(", ")}`);
  const jobs = scn.flatMap((s) => MODELS.flatMap((model) => ARMS.map((arm) => async (): Promise<Row> => {
    const a = await answer(model, s, arm);
    return { scenario: s.id, kind: s.kind, model, arm, text: a.text, first: a.first, followUp: a.followUp, ...measure(s, a.text) };
  })));
  const RESCORE = process.argv.includes("--rescore");
  const fresh = RESCORE ? [] : await pool(jobs, CONCURRENCY);
  // Keep earlier answers for arms/models not run now, re-scored with the current metrics.
  const prevFile = join(OUT, "results.json");
  const kept: Row[] = (RESCORE || process.argv.includes("--reuse")) && existsSync(prevFile)
    ? (JSON.parse(readFileSync(prevFile, "utf8")) as Row[])
        .filter((r) => RESCORE || !(ARMS.includes(r.arm) && MODELS.includes(r.model)))
        .map((r) => ({ ...r, ...measure(scn.find((s) => s.id === r.scenario)!, r.text) }))
    : [];
  const rows = [...kept, ...fresh];
  writeFileSync(prevFile, JSON.stringify(rows, null, 1));
  const md = report(scn, rows);
  writeFileSync(join(OUT, "report.md"), md);
  blindPacket(scn, rows);
  console.log(md);
}
main();
