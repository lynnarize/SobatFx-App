import { MIN_RR, type Drawing, type RejectedPlan } from "../drawings";
import { atr, ema, swings } from "../market/indicators";
import type { Candle } from "../market/symbols";

// Structural checks on the AI's trade plans, after the R:R gate in extractDrawings. Models put the TP a
// hair past a level price was just rejected from (it needs a breakout to fill), set stops inside one
// candle's normal range, and buy straight into a fading move. Each plan is corrected against the
// candles; one that no longer reaches the minimum R:R after the correction is refused. Pure, so the
// client (what the user sees) and the track record (what gets scored) apply the same rules.

/** A TP within this many ATR past a level, or this close in front of it, counts as sitting on that level. */
const TP_PAST = 0.5;
const TP_SHORT_OF = 0.1;
/** A corrected TP sits this many ATR in front of the level. */
const TP_FRONT = 0.15;
/** Smallest stop, in ATR of the chart's timeframe. */
const SL_MIN_ATR = 1;
/** How far beyond the latest pullback extreme the stop must sit, in ATR. */
const SL_BEYOND = 0.25;
/** Bars that make up "the latest pullback" the stop must protect. */
const PULLBACK_BARS = 5;
/** Bars searched for the recent high/low price was rejected from. */
const RECENT_BARS = 30;

export type PlanNote =
  | { kind: "tp"; side: "long" | "short"; entry: number; from: number; to: number; level: number }
  | { kind: "sl"; side: "long" | "short"; entry: number; from: number; to: number; atr: number }
  | { kind: "momentum"; side: "long" | "short"; entry: number };

/**
 * Corrects or refuses the "position" drawings. Horizontal lines in the same reply count as levels too.
 * `candles` may end with the still-forming candle.
 */
export function guardPlans(drawings: Drawing[], candles: Candle[], digits: number) {
  const notes: PlanNote[] = [];
  const rejected: RejectedPlan[] = [];
  const closed = candles.slice(0, -1);
  const a = atr(closed);
  if (!a || closed.length < 30) return { drawings, notes, rejected };
  const round = (v: number) => +v.toFixed(digits);
  const recent = candles.slice(-RECENT_BARS);
  const sw = swings(closed.slice(-150));
  // The plan's own TP/SL/entry lines are not levels.
  const lines = drawings.filter((d) => d.type === "horizontal" && !/\b(tp|sl|target|take|stop|entry)\b/i.test(d.text ?? "")).map((d) => d.price);
  const highs = [...lines, ...sw.highs.map((s) => s.price), Math.max(...recent.map((c) => c.high))];
  const lows = [...lines, ...sw.lows.map((s) => s.price), Math.min(...recent.map((c) => c.low))];
  const closes = closed.map((c) => c.close);
  const e20 = ema(closes, 20).at(-1) ?? null;
  const last3 = closed.slice(-3);

  const out: Drawing[] = [];
  for (const d of drawings) {
    if (d.type !== "position" || d.stopPrice == null || d.targetPrice == null) {
      out.push(d);
      continue;
    }
    const side = d.side === "short" ? "short" : "long";
    const dir = side === "long" ? 1 : -1;
    const entry = d.price;
    let tp = d.targetPrice;
    let sl = d.stopPrice;

    // TP on (or just past) a level: pull it in front of the nearest such level.
    const blocking = (side === "long" ? highs : lows)
      .filter((l) => dir * (l - entry) > a * 0.25 && dir * (tp - l) <= a * TP_PAST && dir * (l - tp) <= a * TP_SHORT_OF)
      .sort((x, y) => dir * (x - y));
    if (blocking.length) {
      const level = blocking[0];
      const to = round(level - dir * a * TP_FRONT);
      if (dir * (tp - to) > 0) {
        notes.push({ kind: "tp", side, entry, from: tp, to, level: round(level) });
        tp = to;
      }
    }

    // SL inside normal noise or not beyond the latest pullback: move it out.
    const pull = candles.slice(-PULLBACK_BARS).map((c) => (side === "long" ? c.low : c.high));
    const extreme = side === "long" ? Math.min(...pull) : Math.max(...pull);
    let need = entry - dir * a * SL_MIN_ATR;
    if (dir * (entry - extreme) > 0) need = side === "long" ? Math.min(need, extreme - a * SL_BEYOND) : Math.max(need, extreme + a * SL_BEYOND);
    if (dir * (sl - need) > 0) {
      const to = round(need);
      notes.push({ kind: "sl", side, entry, from: sl, to, atr: round(a) });
      sl = to;
    }

    const rr = (dir * (tp - entry)) / Math.abs(entry - sl);
    if (rr < MIN_RR) {
      rejected.push({ side, entry, sl, tp, rr: Math.max(rr, 0), adjusted: true });
      // Notes about a plan that isn't drawn would only confuse.
      for (let i = notes.length - 1; i >= 0; i--) if (notes[i].entry === entry && notes[i].side === side) notes.splice(i, 1);
      continue;
    }

    // Entering at market into a fading move: lower highs closing under EMA20 (mirrored for shorts).
    const atMarket = Math.abs(entry - closed.at(-1)!.close) <= a * 0.5;
    const fading =
      last3.length === 3 &&
      e20 != null &&
      (side === "long"
        ? last3[0].high > last3[1].high && last3[1].high > last3[2].high && last3[2].close < e20
        : last3[0].low < last3[1].low && last3[1].low < last3[2].low && last3[2].close > e20);
    if (atMarket && fading) notes.push({ kind: "momentum", side, entry });

    out.push(tp === d.targetPrice && sl === d.stopPrice ? d : { ...d, targetPrice: tp, stopPrice: sl });
  }
  return { drawings: out, notes, rejected };
}
