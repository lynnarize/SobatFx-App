/**
 * Trade-analysis research eval for the Pro tier: which model gives correct, useful trade plans,
 * and does a prompt/context change help? Complements eval-ai.ts (behaviour) with measured quality.
 *
 *   npm run eval:trade                       build fresh scenarios, run all models × arms
 *   npm run eval:trade -- --reuse            rerun on the saved scenarios (same inputs → comparable)
 *   npm run eval:trade -- --models a,b --arms pipvalue
 *   npm run eval:trade -- --tier free --reuse --models a,b --arms worked
 *                                            free tier: free system prompt, no higher-timeframe block,
 *                                            2000-token cap; reuses the Pro scenarios, writes eval-trade-free/
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
 *  - --provider opencode sends the calls to OpenCode Go (OPENCODE_API_KEY or OPENCODE_GO_API_KEY) instead of
 *    OpenRouter, with the models' default thinking left on and a larger token budget (--max-tokens, 16000).
 *    OpenCode Go is a subscription, so cost reads 0. Models are bare ids there, e.g. qwen3.8-max.
 *    Models it doesn't serve (checked against its /models list) still go to OpenRouter, with the same token budget
 *    and the model's default reasoning, so every model runs in its default mode. Pass OpenRouter ids; the bare id
 *    (vendor, ":free" and a -MMDD snapshot suffix stripped) is what OpenCode Go receives.
 *  - --suite btc runs BTC/USD only (4 live questions, backtests on 15m/1h/4h) into scripts/eval-trade-btc/.
 *  - --suite btc15m runs only BTC/USD 15m backtests (no live questions) into scripts/eval-trade-btc15m/, rebuilt
 *    from Binance history (the app's BTC source) in three market regimes: a rally, a sell-off and a range
 *    (--windows overrides: "regime@ISO-end,..."). The higher-timeframe candle still forming at the cut-off is
 *    rebuilt from the 15m bars up to it, so its close is not a future price.
 *  - --out <dir> writes somewhere else (relative to the repo), e.g. a second provider's run on the same scenarios.
 *  - --dry builds the scenarios and writes each arm's exact system + user prompt to prompts/, without calling a model.
 *  - --thinking off|on: off matches production (reasoning disabled, tier token cap); on is the default with
 *    --provider opencode. --resume only runs the (scenario, model, arm) answers missing or errored in results.json.
 *  - Prompt-variant arms. "worked" is the Pro prompt before levels+applot shipped; "prod" is production for the tier
 *    (Pro = levels+applot, built from the same prompt.ts / guardrails.ts code as the chat route). Join with "+" to
 *    combine, e.g. "entry+levels"; "all" = entry+levels+steps+applot:
 *      entry   when to enter at market vs a pullback limit, split entries, an expiry on every limit order
 *      levels  guardrails computed into the context: min SL distance, ATR buffers, nearest levels in ATR
 *      steps   the trade-plan rules rewritten as a 7-step procedure
 *      applot  the model gives entry/SL/TP only; the app sizes the lot (lot metric reads "app")
 *  - Metrics are automatic and deterministic (lot vs the app calculator, R:R, SL vs ATR, format, cost,
 *    latency, outcome). Rates get Wilson 95% CIs, means get seeded bootstrap 95% CIs.
 */
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { APP_LOT, contextBlock, systemPrompt, type ChatContext } from "../src/lib/ai/prompt";
import { planGuardrails } from "../src/lib/ai/guardrails";
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

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const TIER = (arg("tier") ?? "pro") as "free" | "pro";
const SUITE = arg("suite") ?? "all";
const OUT = arg("out") ? join(process.cwd(), arg("out")!) : join(process.cwd(), "scripts", TIER === "free" ? "eval-trade-free" : SUITE === "btc" ? "eval-trade-btc" : SUITE === "btc15m" ? "eval-trade-btc15m" : "eval-trade");
const OPENCODE = arg("provider") === "opencode";
const THINKING = (arg("thinking") ?? (OPENCODE ? "on" : "off")) === "on";
const MAX_TOKENS = Number(arg("max-tokens") ?? (THINKING ? 16000 : TIER === "free" ? 2000 : 2500));
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
  /** Market regime of the backtest window (btc15m suite). */
  regime?: string;
  /** Higher-timeframe swing levels at the cut-off, for the "levels" arm. */
  htf?: { iv: Interval; highs: number[]; lows: number[] }[];
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

const LIVE_ALL = [
  { id: "L1-gold-analysis", inst: "XAUUSD", iv: "1h", lang: "id", prompt: "Analisa XAU/USD sekarang dong, ada setup bagus?" },
  { id: "L2-eurusd-plan", inst: "EURUSD", iv: "4h", lang: "en", prompt: "Full analysis of EUR/USD on this chart and give me a trade plan." },
  { id: "L3-btc-scalp", inst: "BTCUSD", iv: "15m", lang: "id", prompt: "Mau scalping BTC sekarang, entry di mana, SL TP berapa, lot berapa buat modal saya?" },
  { id: "L4-usdjpy-review", inst: "USDJPY", iv: "1h", lang: "id", prompt: "Cek trade plan saya di chart, sudah bagus belum? Apa yang perlu diubah?", review: true },
  { id: "L5-gold-revenge", inst: "XAUUSD", iv: "1h", lang: "id", prompt: "Hari ini saya udah loss 3x di gold, total -6%. Mau balas pakai lot 0.5 biar balik modal. Entry buy sekarang ya?" },
] as const;
const LIVE_BTC = [
  { id: "L3-btc-scalp", inst: "BTCUSD", iv: "15m", lang: "id", prompt: "Mau scalping BTC sekarang, entry di mana, SL TP berapa, lot berapa buat modal saya?" },
  { id: "LB1-btc-full", inst: "BTCUSD", iv: "1h", lang: "en", prompt: "Full analysis of BTC/USD on this chart: trend, higher timeframes, key levels and what the news means for it. Then give me a trade plan." },
  { id: "LB2-btc-swing", inst: "BTCUSD", iv: "4h", lang: "id", prompt: "Analisa BTC buat swing beberapa hari ke depan. Ada setup bagus? Kalau ada, entry, SL, TP dan lot buat modal saya." },
  { id: "LB3-btc-news", inst: "BTCUSD", iv: "1h", lang: "id", prompt: "Ada berita atau data ekonomi yang bisa gerakin BTC dalam 1-2 hari ini? Aman buka posisi sekarang atau tunggu?" },
] as const;
const LIVE: readonly { id: string; inst: string; iv: Interval; lang: "id" | "en"; prompt: string; review?: boolean }[] = SUITE === "btc" ? LIVE_BTC : SUITE === "btc15m" ? [] : LIVE_ALL;
const BT_SETS: { inst: string; iv: Interval }[] = SUITE === "btc15m" ? [{ inst: "BTCUSD", iv: "15m" }] : SUITE === "btc" ? [{ inst: "BTCUSD", iv: "15m" }, { inst: "BTCUSD", iv: "1h" }, { inst: "BTCUSD", iv: "4h" }] : [
  { inst: "XAUUSD", iv: "1h" }, { inst: "XAUUSD", iv: "4h" }, { inst: "EURUSD", iv: "1h" },
  { inst: "GBPUSD", iv: "4h" }, { inst: "USDJPY", iv: "1h" }, { inst: "BTCUSD", iv: "1h" },
];
const BT_PROMPT = "Kasih 1 setup trading terbaik sekarang (long atau short) lengkap entry, SL, TP dan lot untuk modal saya, lalu gambar di chart. Kalau tidak ada setup yang layak, bilang saja.";
const CUTS = Number(arg("cuts") ?? 6);
const CUT_GAP = Number(arg("cut-gap") ?? 30);

const WINDOWS = (arg("windows") ?? "rally@2026-10-05T09:15Z,down@2026-09-25T16:00Z,range@2026-09-13T16:00Z").split(",").map((w) => {
  const [regime, end] = w.split("@");
  return { regime, end: Math.floor(Date.parse(end) / 1000) };
});

/** Binance klines opened at or before endSec (the app's BTC source, but at a past moment). */
async function binanceAt(sym: string, iv: Interval, endSec: number, limit = 1000): Promise<Candle[]> {
  const r = await fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${sym}&interval=${iv}&endTime=${endSec * 1000}&limit=${limit}`, { signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`binance ${r.status} ${await r.text()}`);
  return ((await r.json()) as unknown[][]).map((k) => ({ time: Math.floor(Number(k[0]) / 1000), open: +k[1]!, high: +k[2]!, low: +k[3]!, close: +k[4]!, volume: +k[5]! }));
}

/** BTC/USD 15m backtests in several market regimes, each cut-off seen exactly as it was at the time. */
async function histScenarios(): Promise<Scenario[]> {
  const out: Scenario[] = [];
  const iv: Interval = "15m", inst = getInstrument("BTCUSD")!, sym = inst.src.binance!, bar = intervalSec(iv);
  for (const w of WINDOWS) {
    const full = await binanceAt(sym, iv, w.end);
    for (let k = CUTS - 1; k >= 0; k--) {
      const cut = full.length - HORIZON - 1 - k * CUT_GAP;
      if (cut < 250) continue;
      const hist = full.slice(0, cut + 1);
      const now = hist.at(-1)!.time + bar; // the cut-off candle has just closed
      const ctx = buildCtx(inst.id, iv, hist);
      const sums = [], htf: NonNullable<Scenario["htf"]> = [];
      for (const h of higherTimeframes(iv, "pro")) {
        const hs = intervalSec(h);
        const closed = (await binanceAt(sym, h, now - 1, 500)).filter((c) => c.time + hs <= now);
        // The higher-timeframe candle still forming at the cut-off, from the 15m bars so far (not its final close).
        const part = hist.filter((c) => c.time >= Math.floor(now / hs) * hs);
        const forming: Candle[] = part.length
          ? [{ time: part[0].time, open: part[0].open, high: Math.max(...part.map((c) => c.high)), low: Math.min(...part.map((c) => c.low)), close: part.at(-1)!.close, volume: part.reduce((a, c) => a + (c.volume ?? 0), 0) }]
          : [];
        const sum = summarizeTf(h, [...closed, ...forming], inst.digits);
        if (sum) sums.push(sum);
        const sw = swings(closed.slice(-150));
        htf.push({ iv: h, highs: sw.highs.map((x) => x.price), lows: sw.lows.map((x) => x.price) });
      }
      const id = `B-${w.regime}-${new Date(hist.at(-1)!.time * 1000).toISOString().slice(0, 16)}`;
      out.push({ id, kind: "backtest", inst: inst.id, iv, lang: "id", prompt: BT_PROMPT, ctx, news: "News digest unavailable for this moment.", mtf: formatMtf(inst.id, iv, sums), atr: Number(ctx.indicators!.ATR14), future: full.slice(cut + 1, cut + 1 + HORIZON), regime: w.regime, htf });
    }
    const first = full.at(-HORIZON - 1 - (CUTS - 1) * CUT_GAP)!, last = full.at(-1)!;
    console.log(`scenarios ${w.regime}: ${new Date(first.time * 1000).toISOString().slice(0, 16)} → ${new Date(last.time * 1000).toISOString().slice(0, 16)}, ${(((last.close - first.close) / first.close) * 100).toFixed(1)}%`);
  }
  return out;
}

async function buildScenarios(): Promise<Scenario[]> {
  if (SUITE === "btc15m") return histScenarios();
  const out: Scenario[] = [];
  for (const c of LIVE) {
    const inst = getInstrument(c.inst)!;
    const all = (await getCandles(c.inst, c.iv)).candles;
    let drawings: unknown[] = [];
    if (c.review) {
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
const VARIANTS = ["entry", "levels", "steps", "applot"] as const;
type Variant = (typeof VARIANTS)[number];
/** The prompt variants an arm turns on ("worked" = none = the production prompt). */
function variantsOf(arm: Arm): Set<Variant> {
  const wording = arm.split("#")[0];
  if (["baseline", "pipvalue", "worked"].includes(wording)) return new Set();
  if (wording === "prod") return new Set(TIER === "pro" ? (["levels", "applot"] as Variant[]) : []);
  const parts = wording === "all" ? [...VARIANTS] : wording.split("+");
  for (const p of parts) if (!VARIANTS.includes(p as Variant)) throw new Error(`unknown arm ${arm}`);
  return new Set(parts as Variant[]);
}

// ─── Prompt variants (a copy of the "worked" prompt is rewritten; levels and applot use the production code) ──
/** Replace text that must exist, so a change to prompt.ts can't silently turn a variant into a no-op. */
function swap(text: string, from: string | RegExp, to: string) {
  if (!(typeof from === "string" ? text.includes(from) : from.test(text))) throw new Error(`prompt variant anchor not found: ${from}`);
  return text.replace(from, () => to);
}

const ENTRY_RULES = `  - Choose the entry type on purpose — a plan that never fills is a missed trade, not a safe one:
    - Market entry (at the last price) when the higher timeframes agree with your side, ADX ≥ 25 and the last 3–5 closed candles are not fading. In a trend like that a pullback limit more than ~1 × ATR from the last price is usually missed: don't make it the only plan.
    - Limit entry at a pullback level when the move is stretched (last price more than ~2 × ATR from EMA20, or RSI above 75 / below 25), fading (see above) or ranging (ADX < 20). Pick a level within ~1–1.5 × ATR of the last price that price is likely to revisit.
    - Unsure between the two: split it — half size at market, half at the pullback level, same SL — and draw the market half as the position.
    - Every limit entry gets an expiry: "valid for the next N candles (≈ X hours); cancel if price closes beyond Y first". If it needs more than ~2 × ATR of retracement, say it is unlikely to fill.`;

function stepsBlock(v: Set<Variant>) {
  const entry = v.has("entry")
    ? "market or limit, using the entry-type rules below."
    : "read the last 3–5 closed candles. After a rejection at a level, lower highs (for a long) or higher lows (for a short) and a close back through EMA20 mean the move is fading: don't enter now, give a pullback entry at demand/supply or a trigger (e.g. \"a 15m close back above X\") instead.";
  const lot = v.has("applot")
    ? APP_LOT
    : "pips = |entry − SL| ÷ pip size, then lot = risk ÷ (pips × pip value per lot), rounded DOWN to 0.01; show this briefly. Below 0.01: never round up to 0.01 — say the stop is too wide for this risk and suggest a tighter, structure-based stop or a smaller risk.";
  return `- Building a trade plan: work through these steps in order before you write (keep the working out of the reply). The app checks the plan against the candles and refuses one under 1:1, so get each step right yourself:
  1. Bias — the higher-timeframe biases first, then the chart timeframe inside them. 4H and 1D both against the idea → no position: say "wait" and give the trigger.
  2. Regime — turbulent: at most half risk, wait for a close/retest, SL beyond structure + ~1 ATR.
  3. Entry — ${entry}
  4. Stop loss (every trade idea has one) — beyond the latest pullback low (long) / high (short) or the EMA50, plus ~0.25 × ATR, and never closer to entry than 1 × ATR. If normal candles move further than your stop, it is too tight.
  5. Take profit — at the next real level, placed IN FRONT of it (~0.1–0.2 × ATR before the resistance for a long, above the support for a short), never on it or just past it. A target beyond a level that just rejected price needs a breakout: make that a separate "if it breaks and closes above X" scenario.
  6. R:R — TP distance ÷ SL distance. Below 1:1 → no trade at this entry: no "position" drawing; say "wait" and give a better entry where it works. Aim for 1:1.5–1:3. Never widen the SL or pull the TP in to force it, including when correcting a plan. State the R:R.
  7. Lot — ${lot}${v.has("entry") ? `\n${ENTRY_RULES}` : ""}`;
}

function systemFor(arm: Arm) {
  const v = variantsOf(arm);
  // Production's app-lot prompt, except under "steps", which rewrites the lot rule itself.
  let sys = systemPrompt(TIER, { appLot: v.has("applot") && !v.has("steps") });
  if (v.has("steps")) {
    if (v.has("applot")) sys = swap(sys, " → **Position size** (using the user's calculator settings when given)", "");
    return swap(sys, /- Placing a trade plan[\s\S]*?or a smaller risk\./, stepsBlock(v));
  }
  const momentum = /^ {2}- Check momentum before a market entry:.*$/m;
  if (v.has("entry")) sys = swap(sys, momentum, `${sys.match(momentum)?.[0]}\n${ENTRY_RULES}`);
  return sys;
}

/** The user turn for an arm: the current context, with the risk line swapped for the older wording or a variant. */
function userTurn(s: Scenario, arm: Arm) {
  const v = variantsOf(arm);
  // levels / applot: exactly what the chat route sends for Pro.
  let block = contextBlock(s.ctx, s.news, false, s.lang, "", s.mtf, { appLot: v.has("applot"), guardrails: v.has("levels") ? planGuardrails(s.ctx, s.htf) : "" });
  const r = s.ctx.risk!;
  const money = +((r.balance * r.riskPct) / 100).toFixed(2);
  const old = `User risk settings: balance ${r.balance} ${r.currency}, risk ${r.riskPct}% per trade`;
  const pv = r.pipValue ? +r.pipValue.toFixed(r.pipValue < 1 ? 4 : 2) : 0;
  const wording = arm.split("#")[0];
  if (wording === "baseline") block = block.replace(/^User risk settings: .*$/m, old);
  if (wording === "pipvalue") block = block.replace(/^User risk settings: .*$/m, `${old} = ${money} ${r.currency} at risk. Pip value for ${s.ctx.symbol}: 1 pip on 1.00 lot = ${pv} ${r.currency}, so lot = ${money} ÷ (SL pips × ${pv}), rounded down to 0.01`);
  return `${block}\n\n${s.prompt}`;
}

// ─── Model calls (mirror streamCompat; read usage) ──────────────────────────
interface Call { text: string; err: string; sec: number; ttft: number; tokIn: number; tokOut: number; tokReason: number; cost: number; provider: string }

const OPENCODE_KEY = process.env.OPENCODE_API_KEY ?? process.env.OPENCODE_GO_API_KEY;
/** Bare ids OpenCode Go serves; filled in main() when --provider opencode. */
let openCodeModels = new Set<string>();
/** OpenRouter id → OpenCode Go id: no vendor, no ":free", and no "-MMDD" snapshot suffix unless Go lists it. */
const bareId = (model: string) => {
  const id = model.split("/").at(-1)!.replace(/:free$/, "");
  return openCodeModels.has(id) ? id : id.replace(/-\d{4}$/, "");
};
const viaOpenCode = (model: string) => OPENCODE && openCodeModels.has(bareId(model));

/** stream() with retries on rate limits and server errors (10 s, 30 s, 90 s). */
async function stream(model: string, messages: { role: string; content: string }[], session?: string): Promise<Call> {
  let res = await streamOnce(model, messages, session);
  for (const wait of [10, 30, 90]) {
    if (!/^(429|5\d\d) /.test(res.err)) break;
    await new Promise((r) => setTimeout(r, wait * 1000));
    res = await streamOnce(model, messages, session);
  }
  return res;
}

async function streamOnce(model: string, messages: { role: string; content: string }[], session?: string): Promise<Call> {
  const t0 = Date.now();
  const res: Call = { text: "", err: "", sec: 0, ttft: 0, tokIn: 0, tokOut: 0, tokReason: 0, cost: 0, provider: "" };
  try {
    const r = viaOpenCode(model)
      ? await fetch("https://opencode.ai/zen/go/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${OPENCODE_KEY}`, "Content-Type": "application/json", "x-opencode-session": session ?? randomUUID(), "User-Agent": "sobatfx-dev-eval/1.0" },
          body: JSON.stringify({ model: bareId(model), messages, stream: true, max_tokens: MAX_TOKENS, ...(THINKING ? {} : { thinking: { type: "disabled" } }), stream_options: { include_usage: true } }),
          signal: AbortSignal.timeout(600_000),
        })
      : await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json", "HTTP-Referer": process.env.NEXTAUTH_URL ?? "https://sobatfx.app", "X-Title": "SobatFX" },
          body: JSON.stringify({ model, messages, stream: true, max_tokens: MAX_TOKENS, ...(THINKING ? {} : { reasoning: { enabled: false } }), stream_options: { include_usage: true } }),
          signal: AbortSignal.timeout(THINKING ? 600_000 : 180_000),
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
  const system = systemFor(arm);
  const user = userTurn(TIER === "free" ? { ...s, mtf: "" } : s, arm);
  const session = randomUUID();
  const first = await stream(model, [{ role: "system", content: system }, { role: "user", content: user }], session);
  let text = first.text;
  let followUp: Call | null = null;
  if (!first.err && !/sobatfx[-_ ]draw/i.test(text) && mentionsLevels(text, s.ctx.lastPrice)) {
    followUp = await stream(model, [
      { role: "system", content: system },
      { role: "user", content: user },
      { role: "assistant", content: text },
      { role: "user", content: "Now output ONLY the ```sobatfx-draw``` fenced block for the levels, zones, trendlines and trade plan you described above — no other text." },
    ], session);
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

function measure(s: Scenario, text: string, arm: Arm = "worked") {
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
  let lot: "correct" | "oversized" | "undersized" | "roundedUp" | "missing" | "app" | null = null;
  let calcLot: number | null = null;
  if (plan) {
    const ps = positionSize(inst, RISK, plan.entry, plan.sl, plan.tp);
    calcLot = ps?.lot ?? null;
    // The first lot named is the plan's own; later ones are usually "if you tighten the SL…" alternatives.
    if (ps && variantsOf(arm).has("applot")) lot = "app";
    else if (ps) {
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

const capR = (r?: Row) => Math.min(r?.outcome?.r ?? 0, 5);

/** Section 0: each arm against the production prompt ("worked"), on the backtests. Errored answers are left out. */
function headline(L: string[], scn: Scenario[], rows: Row[], models: string[], arms: Arm[], short: (m: string) => string) {
  const bt = scn.filter((s) => s.kind === "backtest");
  const regimes = [...new Set(bt.map((s) => s.regime ?? "all"))];
  const ctrl: Arm | undefined = arms.includes("worked") ? "worked" : undefined;
  const find = (s: Scenario, m: string, a: Arm) => rows.find((r) => r.scenario === s.id && r.model === m && r.arm === a && !r.first.err);
  L.push("## 0. Headline: prompt variants vs the production prompt (backtests)", "",
    "*filled* = the entry was reached (TP, SL or expired); *stood aside* = no plan. R per setup: standing aside = 0R, wins capped at 5R. Δ is paired (same setup, same model) against `worked`, the production prompt. Errored answers are left out.", "",
    `| model | arm | answers | plans | filled | stood aside | TP / SL | mean R per setup [95% CI] | Δ vs worked [95% CI] | ${regimes.map((g) => `${g} R (n=${bt.filter((s) => (s.regime ?? "all") === g).length})`).join(" | ")} | SL < 1 ATR | avg s | words |`,
    `|---|---|---|---|---|---|---|---|---|${regimes.map(() => "---").join("|")}|---|---|---|`);
  for (const m of [...models, "all models"]) for (const a of arms) {
    const ms = m === "all models" ? models : [m];
    const pairs = bt.flatMap((s) => ms.map((mm) => ({ s, r: find(s, mm, a), c: ctrl ? find(s, mm, ctrl) : undefined }))).filter((p) => p.r);
    const rs = pairs.map((p) => p.r!), plans = rs.filter((r) => r.plan);
    const filled = plans.filter((r) => ["tp", "sl", "expired"].includes(r.outcome?.status ?? "")).length;
    const st = (k: string) => rs.filter((r) => r.outcome?.status === k).length;
    const delta = ctrl && a !== ctrl ? bootMean(pairs.filter((p) => p.c).map((p) => capR(p.r) - capR(p.c))) : "–";
    const byReg = regimes.map((g) => { const x = pairs.filter((p) => (p.s.regime ?? "all") === g).map((p) => capR(p.r)); return x.length ? avg(x).toFixed(2) : "–"; });
    L.push(`| ${m === "all models" ? "**all models**" : short(m)} | ${a} | ${rs.length} | ${plans.length} | ${wilson(filled, plans.length)} | ${rs.length - plans.length} | ${st("tp")} / ${st("sl")} | ${bootMean(rs.map(capR))} | ${delta} | ${byReg.join(" | ")} | ${wilson(plans.filter((r) => (r.slATR ?? 9) < 1).length, plans.length)} | ${avg(rs.map((r) => r.first.sec + (r.followUp?.sec ?? 0))).toFixed(0)} | ${Math.round(avg(rs.map((r) => r.words)))} |`);
  }
  L.push("");
}

function report(scn: Scenario[], rows: Row[]) {
  const L: string[] = [];
  const models = [...new Set(rows.map((r) => r.model))], arms = [...new Set(rows.map((r) => r.arm))];
  const short = (m: string) => m.split("/").at(-1)!;
  const of = (m: string, a: Arm, kind?: Scenario["kind"]) => rows.filter((r) => r.model === m && r.arm === a && (!kind || r.kind === kind));
  const nBt = scn.filter((s) => s.kind === "backtest").length;
  L.push(`# SobatFX trade-analysis eval — ${new Date().toISOString().slice(0, 16)}Z`, "");
  L.push(`${scn.length} scenarios (${scn.length - nBt} live, ${nBt} backtest) × ${models.length} models × ${arms.length} arms = ${rows.length} answers. Risk: $1000, 1%. ${TIER === "free" ? "Free" : "Pro"} system prompt, thinking ${THINKING ? "on" : "off"}, max ${MAX_TOKENS} tokens. 95% CIs: Wilson (rates), bootstrap (means).`, "");
  if (nBt) headline(L, scn, rows, models, arms, short);

  L.push("## 1. Delivery: speed, cost, format", "", "| model | arm | errors | avg s | first token s | avg cost $ | reasoning tok | words (≤250) | disclaimer shown | self-talk | follow-up call needed |", "|---|---|---|---|---|---|---|---|---|---|---|");
  for (const m of models) for (const a of arms) {
    const rs = of(m, a), ok = rs.filter((r) => !r.first.err);
    const cost = ok.map((r) => r.first.cost + (r.followUp?.cost ?? 0));
    L.push(`| ${short(m)} | ${a} | ${rs.length - ok.length} | ${avg(ok.map((r) => r.first.sec + (r.followUp?.sec ?? 0))).toFixed(1)} | ${avg(ok.map((r) => r.first.ttft)).toFixed(1)} | ${avg(cost).toFixed(4)} | ${Math.round(avg(ok.map((r) => r.first.tokReason)))} | ${Math.round(avg(ok.map((r) => r.words)))} (${wilson(ok.filter((r) => r.words <= 250).length, ok.length)}) | ${wilson(ok.filter((r) => r.disclaimer).length, ok.length)} | ${wilson(ok.filter((r) => r.selfTalk > 0).length, ok.length)} | ${wilson(ok.filter((r) => r.followUp).length, ok.length)} |`);
  }

  L.push("", "## 2. Risk maths (every answer that contains a plan)", "", "Lot is judged against the app's calculator for the model's own entry/SL (drawn plan, else the plan in the text). *correct* = any lot named matches (or the reply says the stop is too wide when even 0.01 lot is too big); *oversized* = the first lot named is >1.5× the correct one, or ≥0.02 when even 0.01 is too big — the dangerous error; *0.01 on a too-wide stop* = rounds up to the minimum without warning, so it risks more than planned (a milder version of the same error).", "", "| model | arm | plans (drawn/text) | lot correct | lot oversized | 0.01 on a too-wide stop | lot undersized | lot missing | R:R ≥ 1.5 | SL < 0.5 ATR |", "|---|---|---|---|---|---|---|---|---|---|");
  for (const m of models) for (const a of arms) {
    const ps = of(m, a).filter((r) => r.plan);
    const n = ps.length, c = (k: string) => ps.filter((r) => r.lot === k).length;
    const lotCells = variantsOf(a).has("applot") ? "app-sized | app-sized | app-sized | app-sized | app-sized" : `${wilson(c("correct"), n)} | ${wilson(c("oversized"), n)} | ${wilson(c("roundedUp"), n)} | ${wilson(c("undersized"), n)} | ${wilson(c("missing"), n)}`;
    L.push(`| ${short(m)} | ${a} | ${n} (${ps.filter((r) => r.planSource === "drawn").length}/${ps.filter((r) => r.planSource === "text").length}) | ${lotCells} | ${wilson(ps.filter((r) => (r.rr ?? 0) >= 1.5).length, n)} | ${wilson(ps.filter((r) => (r.slATR ?? 9) < 0.5).length, n)} |`);
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

/** Side-by-side answers for a person to judge, as tables: production prompt vs a variant, same setup and model. */
function comparePacket(scn: Scenario[], rows: Row[]) {
  const arms = new Set(rows.map((r) => r.arm));
  const variant: Arm = arg("compare") ?? (arms.has("all") ? "all" : [...arms].find((a) => a !== "worked") ?? "worked");
  if (!arms.has("worked") || !arms.has(variant) || variant === "worked") return;
  const models = [...new Set(rows.map((r) => r.model))], short = (m: string) => m.split("/").at(-1)!;
  const bt = scn.filter((s) => s.kind === "backtest");
  const regimes = [...new Set(bt.map((s) => s.regime ?? "all"))];
  // Full answer text only for a few setups per regime (the tables cover them all).
  const per = Number(arg("compare-n") ?? 2);
  const withText = new Set(regimes.flatMap((g) => {
    const xs = bt.filter((s) => (s.regime ?? "all") === g);
    return Array.from({ length: Math.min(per, xs.length) }, (_, i) => xs[Math.floor(((i + 0.5) * xs.length) / per)].id);
  }));
  const get = (s: Scenario, m: string, a: Arm) => rows.find((r) => r.scenario === s.id && r.model === m && r.arm === a);
  const n = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 2 });
  const plan = (r?: Row) => !r ? "missing" : r.first.err ? `error: ${r.first.err.slice(0, 40)}` : r.plan
    ? `${r.plan.side} ${n(r.plan.entry)} · SL ${n(r.plan.sl)} · TP ${n(r.plan.tp)}`
    : "stood aside";
  const geo = (r?: Row) => (r?.plan ? `${r.rr} · ${r.slATR} · ${r.entryATR}` : "–");
  const result = (r?: Row) => {
    if (!r || r.first.err) return "–";
    if (!r.plan) return "0R";
    const o = r.outcome;
    const label: Record<string, string> = { tp: "✅ TP", sl: "❌ SL", expired: "⏳ expired", nofill: "⚪ not filled", open: "open", void: "void" };
    return o ? `${label[o.status] ?? o.status} ${o.r > 0 ? "+" : ""}${o.r}R` : "–";
  };
  const prose = (t: string) => t.replace(/```\s*sobatfx[-_ ]draw[\s\S]*?```/gi, "").trim();
  const capR = (r?: Row) => (r && !r.first.err ? Math.min(r.outcome?.r ?? 0, 5) : NaN);

  const L = [`# Production prompt (\`worked\`) vs \`${variant}\` — side by side`, "",
    `${bt.length} BTC/USD 15m setups × ${models.length} models. Prompt for each: "${BT_PROMPT}"`, "",
    "**Geometry** = R:R · stop distance in ATR · entry distance from the last price in ATR (0 = market entry). **Result** is scored on the 60 candles that followed; standing aside = 0R, not filled = 0R.", ""];

  // Summary per model and regime.
  L.push("## Summary: mean R per setup (wins capped at 5R)", "", `| model | ${regimes.map((g) => `${g}: worked → ${variant}`).join(" | ")} | all setups: worked → ${variant} | ${variant} better / same / worse |`, `|---|${regimes.map(() => "---").join("|")}|---|---|`);
  for (const m of models) {
    const cell = (xs: Scenario[]) => {
      const w = xs.map((s) => capR(get(s, m, "worked"))).filter(Number.isFinite), v = xs.map((s) => capR(get(s, m, variant))).filter(Number.isFinite);
      return `${avg(w).toFixed(2)} → ${avg(v).toFixed(2)}`;
    };
    let b = 0, same = 0, w = 0;
    for (const s of bt) {
      const d = capR(get(s, m, variant)) - capR(get(s, m, "worked"));
      if (!Number.isFinite(d)) continue;
      if (d > 0.005) b++; else if (d < -0.005) w++; else same++;
    }
    L.push(`| ${short(m)} | ${regimes.map((g) => cell(bt.filter((s) => (s.regime ?? "all") === g))).join(" | ")} | ${cell(bt)} | ${b} / ${same} / ${w} |`);
  }
  L.push("");

  // One table per setup.
  for (const g of regimes) {
    L.push(`## ${g}`, "");
    for (const s of bt.filter((x) => (x.regime ?? "all") === g)) {
      const ind = s.ctx.indicators!, last = s.ctx.lastPrice!, f = s.future!;
      const atrOf = (v: number) => { const d = (v - last) / s.atr; return `${d >= 0 ? "+" : ""}${d.toFixed(1)}`; };
      const align = /Alignment: (.*)/.exec(s.mtf)?.[1] ?? "n/a";
      L.push(`### ${s.id}`, "",
        `Last **${n(last)}** · ATR ${ind.ATR14} · RSI ${ind.RSI14} · ADX ${ind.ADX14} · ${align} · **what happened next (hidden from the models):** high ${atrOf(Math.max(...f.map((c) => c.high)))} ATR, low ${atrOf(Math.min(...f.map((c) => c.low)))} ATR, close ${atrOf(f.at(-1)!.close)} ATR`, "",
        `| model | worked: plan | geometry | result | ${variant}: plan | geometry | result |`, "|---|---|---|---|---|---|---|");
      for (const m of models) {
        const w = get(s, m, "worked"), v = get(s, m, variant);
        L.push(`| ${short(m)} | ${plan(w)} | ${geo(w)} | ${result(w)} | ${plan(v)} | ${geo(v)} | ${result(v)} |`);
      }
      L.push("");
      if (withText.has(s.id)) {
        for (const m of models) {
          const w = get(s, m, "worked"), v = get(s, m, variant);
          L.push(`<details><summary>${short(m)} — full answers</summary>`, "", "| worked | " + variant + " |", "|---|---|",
            `| ${(w ? prose(w.text) : "").replace(/\|/g, "\\|").replace(/\n+/g, "<br>")} | ${(v ? prose(v.text) : "").replace(/\|/g, "\\|").replace(/\n+/g, "<br>")} |`, "", "</details>", "");
        }
      }
    }
  }
  writeFileSync(join(OUT, "compare.md"), L.join("\n"));
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  if (systemFor("prod") !== systemPrompt(TIER)) throw new Error(`the "prod" arm no longer matches systemPrompt("${TIER}")`);
  if (OPENCODE) {
    const r = await fetch("https://opencode.ai/zen/go/v1/models", { headers: { Authorization: `Bearer ${OPENCODE_KEY}` } });
    openCodeModels = new Set(((await r.json()).data ?? []).map((m: { id: string }) => m.id));
    for (const m of MODELS) console.log(`${m} → ${viaOpenCode(m) ? `OpenCode Go (${bareId(m)})` : "OpenRouter"}`);
  }
  const file = join(OUT, "scenarios.json");
  // Free runs start from the Pro scenarios so both tiers answer the same frozen inputs.
  const proFile = join(process.cwd(), "scripts", "eval-trade", "scenarios.json");
  const src = TIER === "free" && !existsSync(file) && existsSync(proFile) ? proFile : file;
  const scn: Scenario[] = ["--reuse", "--rescore", "--resume"].some((f) => process.argv.includes(f)) && existsSync(src) ? JSON.parse(readFileSync(src, "utf8")) : await buildScenarios();
  writeFileSync(file, JSON.stringify(scn));
  if (process.argv.includes("--dry")) {
    // Exact prompts per arm for the first backtest setup, to read before spending any calls.
    const dir = join(OUT, "prompts"), s0 = scn.find((s) => s.kind === "backtest") ?? scn[0];
    mkdirSync(dir, { recursive: true });
    for (const a of ARMS) writeFileSync(join(dir, `${a}.md`), `# ${a} — ${s0.id}\n\n## System\n\n${systemFor(a)}\n\n## User\n\n${userTurn(s0, a)}\n`);
    console.log(`prompts written to ${dir}`);
    return;
  }
  console.log(`${scn.length} scenarios · models ${MODELS.join(", ")} · arms ${ARMS.join(", ")} · thinking ${THINKING ? "on" : "off"}, max ${MAX_TOKENS} tokens`);
  const RESCORE = process.argv.includes("--rescore"), RESUME = process.argv.includes("--resume");
  const prevFile = join(OUT, "results.json");
  const prev: Row[] = (RESCORE || RESUME || process.argv.includes("--reuse")) && existsSync(prevFile) ? JSON.parse(readFileSync(prevFile, "utf8")) : [];
  const key = (r: { scenario: string; model: string; arm: Arm }) => `${r.scenario}|${r.model}|${r.arm}`;
  const done = new Set(RESUME ? prev.filter((r) => !r.first.err).map(key) : []);
  // Arm-major order, so the first arms finish for every model even if a rate limit stops the run early.
  const jobs = ARMS.flatMap((arm) => scn.flatMap((s) => MODELS.filter((model) => !done.has(key({ scenario: s.id, model, arm }))).map((model) => async (): Promise<Row> => {
    const a = await answer(model, s, arm);
    return { scenario: s.id, kind: s.kind, model, arm, text: a.text, first: a.first, followUp: a.followUp, ...measure(s, a.text, arm) };
  })));
  const fresh = RESCORE ? [] : await pool(jobs, CONCURRENCY);
  // Keep earlier answers for arms/models not run now (or already done, with --resume), re-scored with the current metrics.
  const kept: Row[] = prev
    .filter((r) => RESCORE || done.has(key(r)) || !(ARMS.includes(r.arm) && MODELS.includes(r.model)))
    .filter((r) => scn.some((s) => s.id === r.scenario))
    .map((r) => ({ ...r, ...measure(scn.find((s) => s.id === r.scenario)!, r.text, r.arm) }));
  const rows = [...kept, ...fresh];
  writeFileSync(prevFile, JSON.stringify(rows, null, 1));
  const md = report(scn, rows);
  writeFileSync(join(OUT, "report.md"), md);
  blindPacket(scn, rows);
  comparePacket(scn, rows);
  console.log(md);
}
main();
