// Demo (paper) trading with virtual money. Pure logic — the state lives in the browser (workspace.tsx)
// and the live engine is in components/trade/PaperEngine.tsx.

import { pipValueUsd } from "./market/risk";
import { type Candle, type Instrument, getInstrument } from "./market/symbols";

export type Side = "buy" | "sell";
export type CloseReason = "tp" | "sl" | "manual";
/** Pending order kind: limit = wait for a better price (buy below / sell above), stop = wait for a breakout (buy above / sell below). */
export type PendingKind = "limit" | "stop";

export interface PaperTrade {
  id: string;
  symbol: string;
  side: Side;
  lot: number;
  /** Fill price. While `pending` is set this is the order price the trade is waiting for. */
  entry: number;
  /** Set while the order waits for `entry` to be reached; cleared (and `openedAt` reset) when it fills. */
  pending?: PendingKind;
  sl?: number;
  tp?: number;
  openedAt: number; // ms
  closedAt?: number;
  exit?: number;
  result?: CloseReason;
  /** Realised P/L in USD (closed trades). */
  pnl?: number;
}

export interface PaperAccount {
  startBalance: number;
  trades: PaperTrade[];
}

export const DEFAULT_PAPER: PaperAccount = { startBalance: 10_000, trades: [] };

const dir = (s: Side) => (s === "buy" ? 1 : -1);

/** Signed pips moved in the trade's favour. */
export function tradePips(t: PaperTrade, price: number, inst = getInstrument(t.symbol)) {
  return inst ? (dir(t.side) * (price - t.entry)) / inst.pip : 0;
}

/** P/L in USD at `price` (uses live USD conversion rates for crosses). */
export function tradePnl(t: PaperTrade, price: number, rates: Record<string, number> = {}) {
  const inst = getInstrument(t.symbol);
  if (!inst) return 0;
  const pv = pipValueUsd(inst, price, rates);
  return Number.isFinite(pv) ? tradePips(t, price, inst) * pv * t.lot : 0;
}

/** R multiple of a closed trade (P/L relative to the planned stop). */
export function rMultiple(t: PaperTrade) {
  if (t.sl == null || t.exit == null) return null;
  const risk = Math.abs(t.entry - t.sl);
  return risk ? (dir(t.side) * (t.exit - t.entry)) / risk : null;
}

/** Kind of pending order for a custom entry price, or null when it equals the live price (a market order). */
export function pendingKind(side: Side, price: number, entry: number): PendingKind | null {
  if (entry === price) return null;
  return (entry < price) === (side === "buy") ? "limit" : "stop";
}

/** Translation key for a pending order kind, e.g. "trade.kind.buyLimit". */
export const kindKey = (side: Side, kind: PendingKind) => `trade.kind.${side}${kind === "limit" ? "Limit" : "Stop"}` as const;

/** Did this price range (one tick, or a candle's low..high) reach the entry price of a pending order? */
export function entryReached(t: PaperTrade, low: number, high: number) {
  if (!t.pending) return false;
  const fillsBelow = (t.side === "buy") === (t.pending === "limit"); // price has to fall to the entry
  return fillsBelow ? low <= t.entry : high >= t.entry;
}

/** Turns a pending order into an open position at its order price. */
export function fillTrade(t: PaperTrade, at: number): PaperTrade {
  return { ...t, pending: undefined, openedAt: at };
}

/**
 * First candle after the order was placed that reached its entry price (catch-up for fills while the app was closed).
 * Like {@link firstHitInCandles} the candle of placement is skipped. The fill time is set just after the fill
 * candle starts, so its SL/TP check skips that candle too — the order of moves inside a candle is unknown.
 */
export function firstFillInCandles(t: PaperTrade, candles: Candle[]) {
  const placedSec = Math.floor(t.openedAt / 1000);
  for (const c of candles) {
    if (c.time < placedSec) continue;
    if (entryReached(t, c.low, c.high)) return { at: (c.time + 1) * 1000 };
  }
  return null;
}

/** Did this price range, or a candle's low..high) touch SL or TP? SL wins a tie — conservative. */
export function hitInRange(t: PaperTrade, low: number, high: number): CloseReason | null {
  if (t.pending) return null;
  const slHit = t.sl != null && (t.side === "buy" ? low <= t.sl : high >= t.sl);
  const tpHit = t.tp != null && (t.side === "buy" ? high >= t.tp : low <= t.tp);
  return slHit ? "sl" : tpHit ? "tp" : null;
}

/**
 * First SL/TP hit in candles after the trade opened (catch-up for trades that hit while the app was closed).
 * The candle the trade opened in is skipped: its low/high include price moves from before the trade existed,
 * and live ticks already cover that stretch.
 */
export function firstHitInCandles(t: PaperTrade, candles: Candle[]) {
  const openSec = Math.floor(t.openedAt / 1000);
  for (const c of candles) {
    if (c.time < openSec) continue; // candle started before the trade existed
    const r = hitInRange(t, c.low, c.high);
    if (r) return { result: r, at: Math.max(c.time * 1000, t.openedAt) };
  }
  return null;
}

export function closeTrade(t: PaperTrade, exit: number, result: CloseReason, at: number, rates: Record<string, number>): PaperTrade {
  const price = result === "tp" ? t.tp! : result === "sl" ? t.sl! : exit;
  return { ...t, exit: price, result, closedAt: at, pnl: +tradePnl(t, price, rates).toFixed(2) };
}

/** Checks SL/TP make sense for the side at the given price. Returns an error key or null. */
export function validateLevels(side: Side, price: number, sl?: number, tp?: number): "slSide" | "tpSide" | null {
  if (sl != null && (side === "buy" ? sl >= price : sl <= price)) return "slSide";
  if (tp != null && (side === "buy" ? tp <= price : tp >= price)) return "tpSide";
  return null;
}

export function stats(acc: PaperAccount) {
  const closed = acc.trades.filter((t) => t.closedAt != null);
  const wins = closed.filter((t) => (t.pnl ?? 0) > 0);
  const losses = closed.filter((t) => (t.pnl ?? 0) < 0);
  const gross = (xs: PaperTrade[]) => xs.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const realised = gross(closed);
  const rs = closed.map(rMultiple).filter((r): r is number => r != null);
  return {
    closed: closed.length,
    open: acc.trades.filter((t) => t.closedAt == null && !t.pending).length,
    pending: acc.trades.filter((t) => t.pending).length,
    winRate: closed.length ? wins.length / closed.length : null,
    realised,
    balance: acc.startBalance + realised,
    profitFactor: losses.length ? gross(wins) / Math.abs(gross(losses)) : wins.length ? Infinity : null,
    avgR: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null,
    tpHits: closed.filter((t) => t.result === "tp").length,
    slHits: closed.filter((t) => t.result === "sl").length,
  };
}

/** Compact journal for the AI (Pro/Ultra review). */
export function journalForAI(acc: PaperAccount, prices: Record<string, number>, rates: Record<string, number>) {
  const s = stats(acc);
  const line = (t: PaperTrade) => {
    const inst = getInstrument(t.symbol) as Instrument | undefined;
    const d = inst?.digits ?? 5;
    const f = (v?: number) => (v == null ? "-" : v.toFixed(d));
    if (t.pending) return `${new Date(t.openedAt).toISOString().slice(0, 16)} ${t.symbol} ${t.side} ${t.pending} order ${t.lot}lot at ${f(t.entry)} SL ${f(t.sl)} TP ${f(t.tp)} → PENDING, not filled yet`;
    const open = t.closedAt == null;
    const px = open ? prices[t.symbol] : t.exit;
    const pnl = open ? (px != null ? tradePnl(t, px, rates) : null) : t.pnl;
    return `${new Date(t.openedAt).toISOString().slice(0, 16)} ${t.symbol} ${t.side} ${t.lot}lot entry ${f(t.entry)} SL ${f(t.sl)} TP ${f(t.tp)} → ${open ? `OPEN now ${f(px)}` : `${t.result} @ ${f(t.exit)} ${new Date(t.closedAt!).toISOString().slice(0, 16)}`} P/L ${pnl == null ? "?" : `$${pnl.toFixed(2)}`}${open ? "" : ` R ${rMultiple(t)?.toFixed(2) ?? "-"}`}`;
  };
  return {
    summary: `start $${acc.startBalance}, balance $${s.balance.toFixed(2)}, closed ${s.closed}, open ${s.open}, pending orders ${s.pending}, win rate ${s.winRate == null ? "-" : (s.winRate * 100).toFixed(0) + "%"}, TP hits ${s.tpHits}, SL hits ${s.slHits}, avg R ${s.avgR?.toFixed(2) ?? "-"}, profit factor ${s.profitFactor == null ? "-" : Number.isFinite(s.profitFactor) ? s.profitFactor.toFixed(2) : "∞"}`,
    trades: acc.trades.slice(-30).map(line),
  };
}
