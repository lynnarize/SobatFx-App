// Release history per event type (for beat/miss streaks, scoring past leans and price reactions),
// kept in the store, since the free calendar feed only covers the current week. It fills up
// automatically as releases come in. Server-only.

import { getCandles } from "./market/data";
import { INSTRUMENTS } from "./market/symbols";
import { type HistRec, reactionFromCandles } from "./outlook";
import { kv } from "./store";
import { pairDirection } from "./usual-effect";

const KEEP = 24; // releases remembered per event type
const TTL = 400 * 86_400;
export const histKey = (currency: string, title: string) => `evh:${currency}|${title}`;

/** Stored histories for these event types ("CUR|Title"), newest release first. */
export async function loadHistories(keys: string[]) {
  const uniq = [...new Set(keys)];
  const rows = await kv.mget<HistRec[]>(uniq.map((k) => `evh:${k}`));
  return new Map(uniq.map((k, i) => [k, rows[i] ?? []]));
}

export async function saveHistory(key: string, recs: HistRec[]) {
  await kv.set(`evh:${key}`, [...recs].sort((a, b) => b.t - a.t).slice(0, KEEP), { ex: TTL });
}

/**
 * Measures how every pair with this currency as a leg moved 15 min and 1 h after a release
 * (5-minute history reaches back ~1.5 days, so this runs soon after each release).
 */
export async function measureReaction(currency: string, releaseMs: number) {
  const react: NonNullable<HistRec["react"]> = {};
  for (const inst of INSTRUMENTS.filter((i) => pairDirection(currency, i) !== 0)) {
    const candles = await getCandles(inst.id, "5m").then((r) => r.candles).catch(() => null);
    const r = candles && reactionFromCandles(releaseMs, candles, inst.pip);
    if (r) react[inst.id] = r;
  }
  return react;
}

/** Preview figures seen for upcoming events, by event key; headlines roll off, so they're kept for the week. */
export async function loadPreviews() {
  return (await kv.get<Record<string, { v: number; text: string }>>("previews")) ?? {};
}

export async function savePreviews(p: Record<string, { v: number; text: string }>) {
  await kv.set("previews", p, { ex: 8 * 86_400 });
}
