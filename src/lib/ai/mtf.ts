// Multi-timeframe context for the paid tiers ("deeper multi-timeframe analysis").
// The client only sends candles for the chart's own timeframe, so the higher timeframes are
// fetched here, summarised into a few lines each (trend, structure, momentum, swing levels)
// and put into <app_context>. Server-only: uses the server candle sources.

import { getCandles } from "../market/data";
import { adx, atr, ema, macd, rsi, swings } from "../market/indicators";
import { type Candle, type Interval, INTERVALS, getInstrument } from "../market/symbols";
import type { Tier } from "../tiers";
import type { HtfLevels } from "./guardrails";

/** How many timeframes above the chart's own each paid tier is shown. Paid tiers always get every frame up to 1D. */
const DEPTH: Record<Tier, number> = { free: 0, pro: 4, ultimate: 4 };

/** Timeframes shown as "higher" frames. 1m and 5m are too noisy to guide a trade, so they are never used. */
const LADDER: Interval[] = ["15m", "1h", "4h", "1d"];

/** The higher timeframes to summarise for a chart interval and tier (nearest first). */
export function higherTimeframes(chartIv: string, tier: Tier): Interval[] {
  const sec = INTERVALS.find((i) => i.id === chartIv)?.sec;
  if (!sec) return [];
  return LADDER.filter((iv) => INTERVALS.find((i) => i.id === iv)!.sec > sec).slice(0, DEPTH[tier]);
}

export type Bias = "bullish" | "bearish" | "mixed";

export interface TfSummary {
  iv: Interval;
  line: string;
  bias: Bias;
  /** Swing levels of the closed candles (all of them; the line shows the last 3), for Pro's plan guardrails. */
  highs: number[];
  lows: number[];
}

/** One timeframe as a compact text line. Pure. `candles` may end with the still-forming candle. */
export function summarizeTf(iv: Interval, candles: Candle[], digits: number): TfSummary | null {
  if (candles.length < 60) return null;
  const closed = candles.slice(0, -1);
  const closes = closed.map((c) => c.close);
  const price = candles.at(-1)!.close;
  const r = (v: number | null | undefined) => (v == null ? "n/a" : String(+v.toFixed(digits)));
  const e20 = ema(closes, 20).at(-1) ?? null;
  const e50 = ema(closes, 50).at(-1) ?? null;
  const e200 = ema(closes, 200).at(-1) ?? null;

  const bias: Bias = e20 == null || e50 == null ? "mixed" : price > e50 && e20 > e50 ? "bullish" : price < e50 && e20 < e50 ? "bearish" : "mixed";
  const ref = e50 == null ? "" : ` (price ${price > e50 ? ">" : "<"} EMA50 ${r(e50)}, EMA20 ${e20! > e50 ? ">" : "<"} EMA50)`;

  const sw = swings(closed.slice(-150));
  const [h1, h2] = sw.highs.slice(-2), [l1, l2] = sw.lows.slice(-2);
  const structure =
    h1 && h2 && l1 && l2
      ? h2.price > h1.price && l2.price > l1.price
        ? "HH+HL (uptrend)"
        : h2.price < h1.price && l2.price < l1.price
          ? "LH+LL (downtrend)"
          : "mixed/range"
      : "unclear";

  const a = adx(closed);
  const m = macd(closes);
  const rs = rsi(closes);
  const parts = [
    `${iv.toUpperCase()}: ${bias}${ref}`,
    `structure ${structure}`,
    rs != null ? `RSI ${rs.toFixed(1)}` : "",
    a != null ? `ADX ${a.toFixed(1)} ${a >= 25 ? "trending" : a < 20 ? "ranging" : "moderate"}` : "",
    m ? `MACD hist ${m.hist >= 0 ? "+" : ""}${+m.hist.toPrecision(3)}` : "",
    `ATR ${r(atr(closed))}`,
    e200 != null ? `EMA200 ${r(e200)}` : "",
    `swing highs ${sw.highs.slice(-3).map((s) => r(s.price)).join(", ") || "none"}`,
    `swing lows ${sw.lows.slice(-3).map((s) => r(s.price)).join(", ") || "none"}`,
  ];
  return { iv, line: parts.filter(Boolean).join(" | "), bias, highs: sw.highs.map((s) => s.price), lows: sw.lows.map((s) => s.price) };
}

/** The <app_context> block: one line per higher timeframe plus how well they agree. Pure. */
export function formatMtf(symbol: string, chartIv: string, sums: TfSummary[]) {
  if (!sums.length) return "";
  const biases = new Set(sums.map((s) => s.bias));
  const align =
    biases.size === 1 && !biases.has("mixed")
      ? `all higher timeframes ${sums[0].bias}`
      : biases.has("bullish") && biases.has("bearish")
        ? "higher timeframes CONFLICT"
        : "higher timeframes mixed/undecided";
  return [
    `Higher-timeframe view of ${symbol} (chart is ${chartIv}; closed candles; swing levels are prices only, oldest→newest):`,
    ...sums.map((s) => s.line),
    `Alignment: ${align}`,
  ].join("\n");
}

const TIMEOUT_MS = 6000;

/** Shown instead of the block when the higher-timeframe fetch failed, so the model says so instead of guessing. */
const UNAVAILABLE = "Higher-timeframe view: UNAVAILABLE this turn (data fetch failed). Do NOT guess the 1H/4H/1D trend; tell the user it could not be checked and keep any trade idea conditional.";

/** Multi-timeframe block for the chat context. Empty on Free or for unknown symbols; an explicit notice when every fetch fails. */
export async function mtfBlock(symbol: string, chartIv: string, tier: Tier): Promise<string> {
  return (await mtfView(symbol, chartIv, tier)).block;
}

/** The block plus each timeframe's swing levels (for the plan guardrails). */
export async function mtfView(symbol: string, chartIv: string, tier: Tier): Promise<{ block: string; levels: HtfLevels[] }> {
  const inst = getInstrument(symbol);
  const ivs = higherTimeframes(chartIv, tier);
  if (!inst || !ivs.length) return { block: "", levels: [] };
  try {
    const results = await Promise.all(
      ivs.map((iv) =>
        Promise.race([
          getCandles(inst.id, iv).then((r) => summarizeTf(iv, r.candles, inst.digits)),
          new Promise<null>((res) => setTimeout(() => res(null), TIMEOUT_MS)),
        ]).catch(() => null),
      ),
    );
    const sums = results.filter((s): s is TfSummary => s !== null);
    return { block: formatMtf(inst.id, chartIv, sums) || UNAVAILABLE, levels: sums.map(({ iv, highs, lows }) => ({ iv, highs, lows })) };
  } catch (e) {
    console.warn("[mtf] failed", (e as Error).message);
    return { block: UNAVAILABLE, levels: [] };
  }
}
