// Pre-release "lean" for calendar events, and the typical price reaction afterwards.
// Pure logic (no network): src/lib/event-history.ts feeds it stored history, preview headlines
// and candles. Client-safe types.
//
// The lean combines independent, free signals, each of which is shown to the user as a reason:
//   - preview headlines ("CPI preview: seen at 4.0%") that differ from the calendar consensus;
//   - related releases that already came out (ADP/claims before payrolls, German CPI before
//     Eurozone CPI, CPI/PPI before PCE, flash before final PMI);
//   - the event's own beat/miss streak.
// It's a statistical lean, never a promise: confidence is "low" or "medium" at most.

import { pairDirection, surprise } from "./usual-effect";

/** One past release of an event, stored per event type. Values in absolute units. */
export interface HistRec {
  /** Release time, ms. */
  t: number;
  actual: number;
  forecast: number | null;
  better: -1 | 0 | 1 | null;
  /** The lean the app showed before this release, to score the predictions themselves. */
  lean?: -1 | 0 | 1;
  /** Signed move of each pair after the release, in pips: 15 min and 1 h. */
  react?: Record<string, { m15: number | null; h1: number | null }>;
  /** When reactions were measured (tried), ms. */
  reactAt?: number;
}

export type Reason =
  | { kind: "preview"; value: string; forecast: string; sign: -1 | 0 | 1 }
  | { kind: "lead"; title: string; actual: string; better: -1 | 0 | 1 }
  | { kind: "streak"; beats: number; misses: number; n: number };

export interface Outlook {
  /** +1 leans better than forecast for the currency, −1 worse, 0 no clear lean. */
  lean: -1 | 0 | 1;
  confidence: "low" | "medium";
  reasons: Reason[];
  /** How past leans for this event did (only counted once the release is out). */
  record?: { hits: number; n: number };
}

export interface Reaction {
  /** Releases measured. */
  n: number;
  /** Average absolute move, pips. */
  avgH1: number;
  avgM15: number;
  /** Of the releases that surprised, how many moved the pair the usual way. */
  usual: number;
  surprised: number;
}

/** Releases that tend to hint at a later one (by exact calendar title). `cur: "*"` = any currency. */
const LEADS: { target: RegExp; cur: string; leads: { title: string; days: number }[] }[] = [
  { target: /^Non-Farm Employment Change$/, cur: "USD", leads: [{ title: "ADP Non-Farm Employment Change", days: 7 }, { title: "Unemployment Claims", days: 7 }, { title: "JOLTS Job Openings", days: 10 }] },
  { target: /^Unemployment Rate$/, cur: "USD", leads: [{ title: "Unemployment Claims", days: 7 }, { title: "ADP Non-Farm Employment Change", days: 7 }] },
  { target: /^(Core )?CPI Flash Estimate y\/y$/, cur: "EUR", leads: ["German Prelim CPI m/m", "French Prelim CPI m/m", "Spanish Flash CPI y/y", "Italian Prelim CPI m/m"].map((title) => ({ title, days: 7 })) },
  { target: /^Core PCE Price Index m\/m$/, cur: "USD", leads: [{ title: "Core CPI m/m", days: 35 }, { title: "Core PPI m/m", days: 35 }] },
  { target: /^(Core )?CPI (m\/m|y\/y)$/, cur: "USD", leads: [{ title: "Core PPI m/m", days: 7 }, { title: "PPI m/m", days: 7 }] },
  { target: /^National Core CPI y\/y$/, cur: "JPY", leads: [{ title: "Tokyo Core CPI y/y", days: 35 }] },
  { target: /^Final Manufacturing PMI$/, cur: "*", leads: [{ title: "Flash Manufacturing PMI", days: 14 }] },
  { target: /^Final Services PMI$/, cur: "*", leads: [{ title: "Flash Services PMI", days: 14 }] },
  { target: /^Revised UoM Consumer Sentiment$/, cur: "USD", leads: [{ title: "Prelim UoM Consumer Sentiment", days: 21 }] },
];

/** Titles whose history a target's lean may need. */
export function leadTitles(title: string, currency: string) {
  return LEADS.filter((l) => l.target.test(title) && (l.cur === "*" || l.cur === currency)).flatMap((l) => l.leads.map((x) => x.title));
}

export interface OutlookEvent {
  time: string;
  currency: string;
  title: string;
  forecast: string;
  actual?: string;
  better?: -1 | 0 | 1 | null;
}

/**
 * The lean for `e` as it stood just before its release.
 * - `calendar`: this week's events (released ones carry `better`);
 * - `hist(title)`: stored past releases of an event type for this currency, newest first;
 * - `preview`: a preview headline's figure for this event, if one was seen (absolute units + display text).
 */
export function outlookFor(
  e: OutlookEvent,
  calendar: OutlookEvent[],
  hist: (title: string) => HistRec[],
  preview?: { value: number; text: string },
  forecastValue?: number | null,
): Outlook {
  const t = Date.parse(e.time);
  const reasons: Reason[] = [];
  let score = 0;

  if (preview && forecastValue != null) {
    const sign = surprise(e.title, preview.value, forecastValue) ?? 0;
    reasons.push({ kind: "preview", value: preview.text, forecast: e.forecast, sign });
    score += 1.5 * sign;
  }

  let leadScore = 0;
  for (const l of LEADS.filter((x) => x.target.test(e.title) && (x.cur === "*" || x.cur === e.currency)).flatMap((x) => x.leads)) {
    const from = t - l.days * 86_400_000;
    // This week's calendar first (it has the display value), then stored history.
    const cal = calendar.find((c) => c.title === l.title && c.currency === e.currency && c.better != null && c.actual && Date.parse(c.time) < t && Date.parse(c.time) >= from);
    if (cal) {
      reasons.push({ kind: "lead", title: l.title, actual: cal.actual!, better: cal.better! });
      leadScore += cal.better!;
      continue;
    }
    const h = hist(l.title).find((r) => r.better != null && r.t < t && r.t >= from);
    if (h) {
      reasons.push({ kind: "lead", title: l.title, actual: String(+h.actual.toPrecision(4)), better: h.better! });
      leadScore += h.better!;
    }
  }
  score += Math.max(-2, Math.min(2, leadScore));

  const past = hist(e.title).filter((r) => r.t < t && r.better != null).slice(0, 8);
  if (past.length >= 4) {
    const beats = past.filter((r) => r.better === 1).length, misses = past.filter((r) => r.better === -1).length;
    reasons.push({ kind: "streak", beats, misses, n: past.length });
    const bias = (beats - misses) / past.length;
    if (Math.abs(bias) >= 0.5) score += Math.sign(bias);
  }

  const lean = (score >= 1 ? 1 : score <= -1 ? -1 : 0) as Outlook["lean"];
  const kinds = new Set(reasons.filter((r) => r.kind !== "preview" || r.sign !== 0).map((r) => r.kind));
  const confidence = Math.abs(score) >= 2.5 && kinds.size >= 2 ? "medium" : "low";
  const scored = hist(e.title).filter((r) => r.lean && r.better != null && r.better !== 0);
  const record = scored.length ? { hits: scored.filter((r) => r.lean === r.better).length, n: scored.length } : undefined;
  return { lean, confidence, reasons, record };
}

/** Signed pips moved 15 min and 1 h after a release, from 5-minute candles (times in seconds). */
export function reactionFromCandles(releaseMs: number, candles: { time: number; open: number; close: number }[], pip: number) {
  const start = candles.find((c) => c.time * 1000 >= releaseMs);
  // The candle must open at the release (5-minute candles line up with :00/:15/:30/:45 releases).
  if (!start || start.time * 1000 - releaseMs >= 300_000) return null;
  // A thin feed that didn't trade for the whole hour is stale data, not a flat market.
  const hour = candles.filter((c) => c.time >= start.time && c.time <= start.time + 3300);
  if (hour.length > 1 && hour.every((c) => c.close === start.open && c.open === start.open)) return null;
  const at = (sec: number) => candles.find((c) => c.time === start.time + sec)?.close;
  const pips = (p: number | undefined) => (p == null ? null : +((p - start.open) / pip).toFixed(1));
  const m15 = pips(at(600)), h1 = pips(at(3300));
  return m15 == null && h1 == null ? null : { m15, h1 };
}

/** Typical reaction of `symbol` to an event type, from stored releases. */
export function summarizeReactions(recs: HistRec[], symbol: string, currency: string, inst: { base: string; quote: string }): Reaction | null {
  const rows = recs.filter((r) => r.react?.[symbol]?.h1 != null);
  if (!rows.length) return null;
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + Math.abs(b), 0) / xs.length : 0);
  const dir = pairDirection(currency, inst);
  const surprised = rows.filter((r) => r.better === 1 || r.better === -1);
  const usual = surprised.filter((r) => Math.sign(r.react![symbol].h1!) === r.better! * dir).length;
  return {
    n: rows.length,
    avgH1: +avg(rows.map((r) => r.react![symbol].h1!)).toFixed(1),
    avgM15: +avg(rows.map((r) => r.react![symbol].m15).filter((v): v is number => v != null)).toFixed(1),
    usual,
    surprised: surprised.length,
  };
}
