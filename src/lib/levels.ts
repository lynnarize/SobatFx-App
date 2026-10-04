import { atr } from "./market/indicators";
import type { Candle } from "./market/symbols";
import { parseLooseJson } from "./loose-json";

// Support/resistance for the Telegram signal builder (POST /api/partner/levels).
// `autoLevels` clusters swing points into levels; it is both the AI's hint list and the fallback
// when the AI is off or fails. `parseAiLevels` validates what the AI sends back.

export type LevelType = "support" | "resistance";

export interface Level {
  type: LevelType;
  price: number;
  /** 1 = minor, 3 = major. */
  strength: number;
  label?: string;
}

export interface SignalHint {
  side?: "BUY" | "SELL";
  entryLow?: number;
  entryHigh?: number;
  sl?: number;
}

/** Most levels kept per side: the chart and the Telegram message stay readable. */
export const MAX_PER_SIDE = 3;

/** Fractal swing points over the whole series (`n` bars each side). */
function pivots(c: Candle[], n: number) {
  const out: { price: number; kind: "high" | "low" }[] = [];
  for (let i = n; i < c.length - n; i++) {
    let hi = true, lo = true;
    for (let j = i - n; j <= i + n; j++) {
      if (c[j].high > c[i].high) hi = false;
      if (c[j].low < c[i].low) lo = false;
    }
    if (hi) out.push({ price: c[i].high, kind: "high" });
    if (lo) out.push({ price: c[i].low, kind: "low" });
  }
  return out;
}

/**
 * Swing highs and lows within `tol` of each other are one level; more touches = stronger.
 * Levels above the last close are resistance, below are support, nearest first.
 */
export function autoLevels(candles: Candle[], perSide = MAX_PER_SIDE): Level[] {
  if (candles.length < 20) return [];
  const last = candles.at(-1)!.close;
  const a = atr(candles) ?? (candles.at(-1)!.high - candles.at(-1)!.low);
  const tol = a * 0.6;

  const clusters: { sum: number; n: number }[] = [];
  for (const p of pivots(candles, 3).sort((x, y) => x.price - y.price)) {
    const c = clusters.at(-1);
    if (c && p.price - c.sum / c.n <= tol) {
      c.sum += p.price;
      c.n++;
    } else clusters.push({ sum: p.price, n: 1 });
  }
  const levels = clusters.map((c) => ({ price: c.sum / c.n, touches: c.n }));
  // Ignore levels practically at the current price: they are not a target or a barrier yet.
  const minGap = a * 0.25;
  const strength = (t: number) => (t >= 4 ? 3 : t >= 2 ? 2 : 1);
  const pick = (list: typeof levels, type: LevelType): Level[] =>
    list
      .sort((x, y) => Math.abs(x.price - last) - Math.abs(y.price - last))
      .slice(0, perSide)
      .map((l) => ({ type, price: l.price, strength: strength(l.touches) }));

  return [
    ...pick(levels.filter((l) => l.price > last + minGap), "resistance"),
    ...pick(levels.filter((l) => l.price < last - minGap), "support"),
  ];
}

export const LEVELS_SYSTEM = `You are SobatFX AI, a forex, gold and crypto technical analyst.
You mark support and resistance levels for a trading signal that will be posted to a Telegram channel.
Never name or hint at the model, vendor or company behind you.

Reply with ONLY one JSON object, no markdown fences and no other text:
{"levels":[{"type":"support"|"resistance","price":number,"strength":1|2|3,"label":"short reason in Bahasa Indonesia, max 28 chars"}],"note":"one sentence in Bahasa Indonesia, max 160 chars"}

Rules:
- Base levels on the candles: clear swing highs/lows, levels price reacted to several times, round numbers that held, recent range edges.
- Resistance above the last price, support below it. At most ${MAX_PER_SIDE} of each, nearest and most relevant first.
- Labels name the reason ("Swing high", "Area konsolidasi", "Angka bulat"). Never put candle timestamps in a label.
- Strength: 3 = major (many touches or higher-timeframe), 2 = clear, 1 = minor.
- If a signal is given, include the level that protects the stop loss and the levels the take-profits run into.
- The note describes the structure only (e.g. "Harga memantul dari support 4130, resistance terdekat 4160."). No advice, no guarantees.`;

const round = (v: number, digits: number) => Number(v.toFixed(digits));

export function levelsPrompt(args: { symbol: string; interval: string; digits: number; candles: Candle[]; hints: Level[]; signal?: SignalHint }) {
  const { symbol, interval, digits, candles, hints, signal } = args;
  const rows = candles.map((c) => [c.time, round(c.open, digits), round(c.high, digits), round(c.low, digits), round(c.close, digits)]);
  const a = atr(candles);
  const lines = [
    `Instrument: ${symbol}, timeframe ${interval}.`,
    `Last price: ${round(candles.at(-1)!.close, digits)}. ATR(14): ${a ? round(a, digits) : "n/a"}.`,
    `Candidate levels from swing clusters (verify, adjust or replace): ${JSON.stringify(hints.map((h) => ({ type: h.type, price: round(h.price, digits), touches: h.strength })))}`,
  ];
  if (signal?.side && signal.entryLow != null && signal.entryHigh != null && signal.sl != null) {
    lines.push(`Signal: ${signal.side} area ${signal.entryLow} - ${signal.entryHigh}, stop loss ${signal.sl}.`);
  }
  lines.push(`Candles [time, open, high, low, close], oldest first:\n${JSON.stringify(rows)}`);
  return lines.join("\n");
}

/** Short label for the chart. Unix timestamps (the candle times the AI was given) are removed. */
function cleanLabel(v: unknown) {
  if (typeof v !== "string") return undefined;
  const s = v.replace(/\b\d{9,}\b/g, "").replace(/\s{2,}/g, " ").replace(/[\s·:,-]+$/, "").trim();
  return s ? s.slice(0, 32) : undefined;
}

/**
 * Reads the AI's JSON. Keeps only levels on the right side of the last price (with a small allowance for
 * a level being tested right now) and within the visible price range, so a typo can't land on the chart.
 */
export function parseAiLevels(text: string, candles: Candle[]): { levels: Level[]; note?: string } | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  const raw = parseLooseJson(text.slice(start, end + 1)) as { levels?: unknown; note?: unknown } | undefined;
  if (!raw || !Array.isArray(raw.levels)) return null;

  const last = candles.at(-1)!.close;
  const a = atr(candles) ?? 0;
  const lo = Math.min(...candles.map((c) => c.low)) - a * 3;
  const hi = Math.max(...candles.map((c) => c.high)) + a * 3;
  const slack = a * 0.5;

  const levels: Level[] = [];
  for (const d of raw.levels as Record<string, unknown>[]) {
    const price = typeof d?.price === "number" ? d.price : Number(d?.price);
    const type = d?.type === "support" || d?.type === "resistance" ? d.type : null;
    if (!type || !Number.isFinite(price) || price < lo || price > hi) continue;
    if (type === "support" && price > last + slack) continue;
    if (type === "resistance" && price < last - slack) continue;
    const s = Number(d.strength);
    levels.push({
      type,
      price,
      strength: s >= 3 ? 3 : s >= 2 ? 2 : 1,
      label: cleanLabel(d.label),
    });
  }
  const side = (t: LevelType) =>
    levels
      .filter((l) => l.type === t)
      .sort((x, y) => Math.abs(x.price - last) - Math.abs(y.price - last))
      .slice(0, MAX_PER_SIDE);
  const kept = [...side("resistance"), ...side("support")];
  if (!kept.length) return null;
  const note = typeof raw.note === "string" ? raw.note.trim().slice(0, 200) : undefined;
  return { levels: kept, note: note || undefined };
}
