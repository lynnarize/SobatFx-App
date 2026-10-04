/** Offline checks for the partner support/resistance logic:  npx tsx scripts/selftest-levels.ts */
import assert from "node:assert/strict";
import { autoLevels, levelsPrompt, parseAiLevels } from "../src/lib/levels";
import type { Candle } from "../src/lib/market/symbols";

let failed = 0;
const test = (name: string, fn: () => void) => {
  try {
    fn();
    console.log("✓", name);
  } catch (e) {
    failed++;
    console.error("✗", name, "\n ", (e as Error).message);
  }
};

// A range market: price oscillates between ~110 (resistance) and ~90 (support), ending at 100.
const candles: Candle[] = Array.from({ length: 120 }, (_, i) => {
  const mid = 100 + 10 * Math.sin((i / 12) * Math.PI);
  return { time: 1_790_000_000 + i * 3600, open: mid - 0.3, high: mid + 0.6, low: mid - 0.6, close: mid + 0.3 };
});
candles.push({ time: candles.at(-1)!.time + 3600, open: 100, high: 100.4, low: 99.6, close: 100 });

test("autoLevels finds the range edges on the right side of price", () => {
  const lv = autoLevels(candles);
  const r = lv.filter((l) => l.type === "resistance");
  const s = lv.filter((l) => l.type === "support");
  assert.ok(r.length && s.length);
  assert.ok(r.every((l) => l.price > 100) && s.every((l) => l.price < 100));
  assert.ok(Math.abs(r[0].price - 110.6) < 1, `resistance ${r[0].price}`);
  assert.ok(Math.abs(s[0].price - 89.4) < 1, `support ${s[0].price}`);
  assert.equal(r[0].strength, 3);
});

test("autoLevels needs enough candles", () => {
  assert.deepEqual(autoLevels(candles.slice(0, 10)), []);
});

test("parseAiLevels keeps valid levels, nearest first, and drops wrong-side or far-off ones", () => {
  const reply = `Here you go:
  {"levels":[
    {"type":"resistance","price":110.5,"strength":3,"label":"Range top 1790003600"},
    {"type":"resistance","price":"104","strength":"2"},
    {"type":"support","price":95,"strength":5},
    {"type":"support","price":108},
    {"type":"resistance","price":900},
    {"type":"pivot","price":101},
  ],"note":"Harga di tengah range 90-110."}`;
  const out = parseAiLevels(reply, candles)!;
  assert.deepEqual(out.levels.map((l) => [l.type, l.price]), [["resistance", 104], ["resistance", 110.5], ["support", 95]]);
  assert.equal(out.levels[1].label, "Range top");
  assert.equal(out.levels[2].strength, 3);
  assert.equal(out.note, "Harga di tengah range 90-110.");
});

test("parseAiLevels returns null when nothing usable comes back", () => {
  assert.equal(parseAiLevels("Sorry, I can't.", candles), null);
  assert.equal(parseAiLevels('{"levels":[{"type":"support","price":500}]}', candles), null);
});

test("levelsPrompt carries the signal and the candles", () => {
  const p = levelsPrompt({ symbol: "XAUUSD", interval: "1h", digits: 2, candles, hints: autoLevels(candles), signal: { side: "BUY", entryLow: 95, entryHigh: 96, sl: 93 } });
  assert.match(p, /Signal: BUY area 95 - 96, stop loss 93/);
  assert.match(p, /Last price: 100\./);
});

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
