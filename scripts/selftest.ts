/** Offline checks for the pure logic (no API keys needed):  npm test */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { contextBlock, systemPrompt } from "../src/lib/ai/prompt";
import { scrub, streamScrubber } from "../src/lib/ai/sanitize";
import { formatMtf, higherTimeframes, summarizeTf } from "../src/lib/ai/mtf";
import { asksForDrawing, extractDrawings } from "../src/lib/drawings";
import { checkPlans, lotsInText } from "../src/lib/ai/lot-check";
import { fingerprint, hasContent, mergeData, type SyncData } from "../src/lib/sync";
import { emptyData, loadDoc, saveDoc, syncDataSchema } from "../src/lib/sync-store";
import { acquireSlot, clientIp, hit, isSameOrigin, readJson } from "../src/lib/guard";
import { parseLooseJson } from "../src/lib/loose-json";
import { instrumentName, translate } from "../src/lib/i18n";
import { createQrisOrder, createTransferOrder, displayStatus, getOrder, syncOrder } from "../src/lib/payments";
import { indexSale, monthOf, salesCsv, salesFor, summarize } from "../src/lib/revenue";
import { handleUpdate, notifyClaim, parseGrant, type Update } from "../src/lib/telegram-bot";
import { validWebhookSecret } from "../src/lib/telegram";
import { effectiveTier, getUser, grantTier } from "../src/lib/users";
import { kv } from "../src/lib/store";
import { pipValueUsd, positionSize, DEFAULT_RISK } from "../src/lib/market/risk";
import { type Candle, getInstrument } from "../src/lib/market/symbols";

const test = (name: string, fn: () => void) => {
  try {
    fn();
    console.log("✓", name);
  } catch (e) {
    console.error("✗", name, "\n ", (e as Error).message);
    process.exitCode = 1;
  }
};

const inst = (id: string) => getInstrument(id)!;
const usd = { ...DEFAULT_RISK, balance: 1000, riskPct: 1 };

test("EUR/USD lot: $1000, 1%, 20 pips → 0.05", () => assert.equal(positionSize(inst("EURUSD"), usd, 1.1, 1.098, 1.104)!.lot, 0.05));
test("XAU/USD lot: $1000, 1%, $5 SL → 0.02", () => assert.equal(positionSize(inst("XAUUSD"), usd, 4200, 4195, 4210)!.lot, 0.02));
test("XAU/USD pip value = $10/lot", () => assert.equal(pipValueUsd(inst("XAUUSD"), 4200), 10));
test("USD/JPY pip value @150 ≈ $6.67", () => assert.equal(pipValueUsd(inst("USDJPY"), 150).toFixed(2), "6.67"));
test("GBP/JPY uses USDJPY rate", () => assert.equal(pipValueUsd(inst("GBPJPY"), 200, { USDJPY: 150 }).toFixed(2), "6.67"));
test("only analysis/drawing requests replace the AI's drawings", () => {
  for (const yes of [
    "Analyze this chart: bias, key levels. Draw the key levels.",
    "Analisis chart ini: bias, level kunci. Gambar level kuncinya.",
    "Tandai zona support dan resistance paling penting di chart saya.",
    "Mark the most important support and resistance zones on my chart.",
    "gambar ulang dong",
    "tolong analisa xauusd",
  ])
    assert.equal(asksForDrawing(yes), true, yes);
  for (const no of [
    "Lihat gambar yang saya buat di chart. Apakah level dan rencana trading saya masuk akal?",
    "Look at what I drew on the chart. Are my levels sensible?",
    'Tinjau posisi yang saya pilih di chart: {"type":"position","entry":84150}. Apakah posisinya sudah tepat?',
    "kenapa harga turun?",
    "analisa tapi jangan gambar apa-apa",
  ])
    assert.equal(asksForDrawing(no), false, no);
});
test("AI trade plans under 1:1 R:R are refused, not drawn", () => {
  const block = (p: string) => "Plan.\n```sobatfx-draw\n" + JSON.stringify({ drawings: [{ type: "hline", price: 84490 }, JSON.parse(p)] }) + "\n```";
  const bad = extractDrawings(block('{"type":"position","side":"short","entry":84155,"sl":85100,"tp":83968,"t1":1}'));
  assert.equal(bad.drawings.filter((d) => d.type === "position").length, 0);
  assert.equal(bad.rejected.length, 1);
  assert.equal(bad.rejected[0].rr.toFixed(2), "0.20");
  assert.equal(bad.unreadable, false);
  const wrongSide = extractDrawings(block('{"type":"position","side":"long","entry":100,"sl":105,"tp":120,"t1":1}'));
  assert.equal(wrongSide.rejected.length, 1);
  const ok = extractDrawings(block('{"type":"position","side":"short","entry":84150,"sl":84500,"tp":83600,"t1":1}'));
  assert.equal(ok.drawings.filter((d) => d.type === "position").length, 1);
  assert.equal(ok.rejected.length, 0);
});
test("R:R and warnings", () => {
  const r = positionSize(inst("EURUSD"), usd, 1.1, 1.098, 1.099)!;
  assert.ok(r.rr! < 1 && r.warnings.includes("rrBelow1"));
});
test("IDR account converts pip value", () => {
  const r = positionSize(inst("EURUSD"), { balance: 16_500_000, riskPct: 1, currency: "IDR", usdIdr: 16500 }, 1.1, 1.098, null)!;
  assert.equal(r.lot, 0.05); // Rp16.5M ≈ $1000 → same lot as the USD case
});

test("AI context walks through lot sizing with a worked example in the instrument's prices", () => {
  const ctx = { symbol: "EURUSD", symbolName: "Euro", interval: "1h", lastPrice: 1.13582, indicators: { pipSize: 0.0001 }, risk: { balance: 1000, riskPct: 1, currency: "USD", pipValue: 10 } };
  const block = contextBlock(ctx, "news", false, "en");
  assert.match(block, /risk 1% per trade = 10 USD at risk/);
  assert.match(block, /SL pips = \|entry − SL\| ÷ 0\.0001 — e\.g\. 1\.1358 → 1\.1338 is 0\.0020 in price = 20 pips/);
  assert.match(block, /1 pip on 1\.00 lot = 10 USD\. \(3\) lot = 10 ÷ \(SL pips × 10\), rounded DOWN to 0\.01 — e\.g\. 20 pips → 0\.05 lot/);
  // Gold: $1 = 10 pips; the example lot follows the $10 pip value.
  const gold = contextBlock({ ...ctx, symbol: "XAUUSD", lastPrice: 4187.63, indicators: { pipSize: 0.1 } }, "news", false, "en");
  assert.match(gold, /4187\.6 → 4185\.6 is 2\.0 in price = 20 pips.*20 pips → 0\.05 lot/);
  // Older clients (and Free, where the route drops it) send no pip value: no lot recipe.
  assert.doesNotMatch(contextBlock({ ...ctx, risk: { balance: 1000, riskPct: 1, currency: "USD" } }, "news", false, "en"), /Lot sizing/);
});
test("lot sizes are read from AI replies", () => {
  assert.deepEqual(lotsInText("Lot = 10 / (92 × $1) = 0.108 → **lot 0.10**. Or 0,05 lot."), [0.1, 0.05]);
  assert.deepEqual(lotsInText("Lot = $10 / (100 pips * $10) = **0.01 Lot**."), [0.01]);
  assert.deepEqual(lotsInText("SL 100 pips, TP 200 pips"), []);
  assert.deepEqual(lotsInText(String.raw`Hitungan: $\frac{10}{10 \times 10} = 0.10$ Lot.`), [0.1]);
  assert.deepEqual(lotsInText("**Perhitungan lot (SL 38.4 pips, risk $10):** → **0.04 lot**"), [0.04]);
  // Units are not sizes.
  assert.deepEqual(lotsInText("Pip value GBPUSD: 10 USD per lot (1.00). Pip value: $10 per lot × 0.01 = $0.10. 1 pip on 1.00 lot = 10 USD → **0.04 lot**"), [0.04]);
});
test("calculator check flags a wrong AI lot and a too-wide stop", () => {
  const pos = (entry: number, sl: number, tp: number) => ({ id: "p", type: "position" as const, color: "#fff", price: entry, time: 0, stopPrice: sl, targetPrice: tp, side: (tp > entry ? "long" : "short") as "long" | "short" });
  // Gold, SL $5 = 50 pips at $10/pip/lot → 0.02 lot. The reply said 0.20 (pip value $1).
  const [bad] = checkPlans("Lot = 10 / (50 × 1) = 0.20 lot", [pos(4200, 4195, 4210)], inst("XAUUSD"), usd);
  assert.equal(bad.lot, 0.02);
  assert.equal(bad.mismatch, true);
  const [ok] = checkPlans("Lot = 10 / (50 × 10) = 0.02 lot", [pos(4200, 4195, 4210)], inst("XAUUSD"), usd);
  assert.equal(ok.mismatch, false);
  // SL $13 = 130 pips → 0.0077 lot: too wide, and 0.01 lot would risk $13.
  const [wide] = checkPlans("", [pos(4178, 4165, 4200)], inst("XAUUSD"), usd);
  assert.equal(wide.tooWide, true);
  assert.equal(wide.riskMoney.toFixed(2), "13.00");
});
test("BotID protects every route that runs the strict guard (otherwise Vercel blocks every real user)", () => {
  const protectedPaths = new Set([...fs.readFileSync("src/instrumentation-client.ts", "utf8").matchAll(/path: "([^"]+)"/g)].map((m) => m[1]));
  const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
  const strict = walk("src/app/api").filter((f) => f.endsWith("route.ts") && /strict: true/.test(fs.readFileSync(f, "utf8")));
  assert.ok(strict.length > 0);
  for (const f of strict) {
    const route = "/" + path.dirname(path.relative("src/app", f)).split(path.sep).join("/");
    assert.ok(protectedPaths.has(route), `${route} uses guard({ strict: true }) but is missing from src/instrumentation-client.ts`);
  }
});

test("/grant parsing: email, plan, optional days", () => {
  assert.deepEqual(parseGrant("/grant Budi@Gmail.com pro"), { email: "budi@gmail.com", tier: "pro" });
  assert.deepEqual(parseGrant("/grant@sobatfx_bot a@b.co ultra 45"), { email: "a@b.co", tier: "ultimate", days: 45 });
  assert.deepEqual(parseGrant("/grant a@b.co ultimate 1"), { email: "a@b.co", tier: "ultimate", days: 1 });
  for (const bad of ["/grant", "/grant a@b.co", "/grant a@b.co free", "/grant nobody pro", "/grant a@b.co pro 0", "/grant a@b.co pro 999", "/grant a@b.co pro 30 extra", "/grant a@b.co pro 3x"]) assert.equal(parseGrant(bad), null, bad);
});

test("scrub removes model names", () => {
  const s = scrub("I am Claude Opus 5.5 by Anthropic, not qwen3.8-max via OpenRouter or GPT-5.");
  assert.ok(!/claude|anthropic|qwen|openrouter|gpt/i.test(s), s);
});
test("scrub also removes the hosting vendors behind Free and Pro", () => {
  const s = scrub("Built by OpenAI, Alibaba Cloud, inclusionAI (Ant Group), NVIDIA and xAI; I am Ling 3.0 flash and Grok-4 via DashScope.");
  assert.ok(!/openai|alibaba|inclusionai|ant group|nvidia|xai|ling|grok|dashscope/i.test(s), s);
});
test("stream scrubber catches names split across chunks", () => {
  const sc = streamScrubber();
  const text = "Sure! Honestly I'm Cla" + "ude Op" + "us 5.5 made by Anthro" + "pic and I'm happy to help with gold today.";
  let out = "";
  for (const ch of text.match(/.{1,3}/g)!) out += sc.push(ch);
  out += sc.flush();
  assert.ok(!/claude|anthropic|opus/i.test(out), out);
  assert.ok(out.includes("happy to help with gold today"));
});
test("scrub keeps normal trading words", () => {
  const t = "Gold rallied after NFP; EUR/USD holds 1.1000 support. Google trends irrelevant.";
  assert.equal(scrub(t), t);
});

test("extractDrawings parses and hides the block", () => {
  const reply = 'Bias bullish.\n\n```sobatfx-draw\n{"drawings":[{"type":"hline","price":4200,"label":"Support"},{"type":"position","side":"long","entry":4205,"sl":4195,"tp":4230,"t1":1790000000},{"type":"hline","price":99999}]}\n```';
  const r = extractDrawings(reply, { tMin: 1789990000, tMax: 1790100000, pMin: 4150, pMax: 4260, barSec: 3600 });
  assert.equal(r.text, "Bias bullish.");
  assert.equal(r.drawings.length, 2, "out-of-range price must be dropped");
  const [h, p] = r.drawings;
  assert.deepEqual([h.type, h.price, h.text, h.by], ["horizontal", 4200, "Support", "ai"]);
  assert.deepEqual([p.type, p.side, p.price, p.stopPrice, p.targetPrice, p.time2], ["position", "long", 4205, 4195, 4230, 1790000000 + 25 * 3600]);
});
test("extractDrawings keeps text written after the block (e.g. the disclaimer)", () => {
  const r = extractDrawings('Bias bearish.\n\n```sobatfx-draw\n{"drawings":[]}\n```\n\nEdukasi, bukan saran keuangan.');
  assert.equal(r.text, "Bias bearish.\n\nEdukasi, bukan saran keuangan.");
});
test("extractDrawings handles a half-streamed block", () => {
  const r = extractDrawings('Levels:\n```sobatfx-draw\n{"drawings":[{"type":"hl');
  assert.equal(r.pending, true);
  assert.equal(r.text, "Levels:");
});

test("system prompt names no vendor/model", () => {
  for (const t of ["free", "pro", "ultimate"] as const) assert.ok(!/claude|anthropic|qwen|openrouter|opencode|openai|gpt/i.test(systemPrompt(t)), t);
});

test("i18n: Indonesian default strings + interpolation", () => {
  assert.equal(translate("id", "chart.clearAi", { n: 3 }), "Hapus AI (3)");
  assert.equal(translate("en", "chart.clearAi", { n: 3 }), "Clear AI (3)");
  assert.equal(instrumentName("Gold / US Dollar", "id"), "Emas / Dolar AS");
});

test("draw block survives common model JSON slips", () => {
  const sloppy = 'Levels.\n```sobatfx-draw\n{"drawings":[\n  // key level\n  {"type":"hline","price":4,160.50,"label":"Resistance"},\n  {"type":"hline","price":4146.6,"label":"Support",},\n]}\n```';
  const r = extractDrawings(sloppy, { tMin: 1, tMax: 2, pMin: 4100, pMax: 4300, barSec: 3600 });
  assert.deepEqual(r.drawings.map((d) => d.price), [4160.5, 4146.6]);
  assert.equal(r.unreadable, false);
  assert.equal(parseLooseJson("not json at all"), undefined);
});

// ── Demo trading ──
import { closeTrade, entryReached, fillTrade, firstFillInCandles, firstHitInCandles, hitInRange, pendingKind, stats, tradePnl, validateLevels, type PaperTrade } from "../src/lib/paper";

const pt = (o: Partial<PaperTrade>): PaperTrade => ({ id: "t", symbol: "EURUSD", side: "buy", lot: 0.1, entry: 1.1, openedAt: 1_790_000_000_000, ...o });

test("paper P/L: EUR/USD buy 0.10 lot +20 pips = +$20; XAU sell 0.01 lot -$5 move = -$5", () => {
  assert.equal(tradePnl(pt({}), 1.102).toFixed(2), "20.00");
  assert.equal(tradePnl(pt({ symbol: "XAUUSD", side: "sell", lot: 0.01, entry: 4150 }), 4155).toFixed(2), "-5.00");
});
test("paper SL/TP detection (SL wins a same-candle tie)", () => {
  const t = pt({ sl: 1.098, tp: 1.104 });
  assert.equal(hitInRange(t, 1.099, 1.1035), null);
  assert.equal(hitInRange(t, 1.0995, 1.1041), "tp");
  assert.equal(hitInRange(t, 1.0979, 1.1045), "sl");
  assert.equal(hitInRange(pt({ side: "sell", sl: 1.102, tp: 1.096 }), 1.0959, 1.1), "tp");
});
test("paper catch-up finds the first hit after opening, ignoring older candles", () => {
  const t = pt({ sl: 1.098, tp: 1.104, openedAt: 1_000_000 * 1000 });
  const c = [
    { time: 999_000, open: 1.1, high: 1.2, low: 1.0, close: 1.1 }, // before the trade — ignored
    { time: 1_000_060, open: 1.1, high: 1.1025, low: 1.0995, close: 1.101 },
    { time: 1_000_120, open: 1.101, high: 1.1042, low: 1.1005, close: 1.104 },
  ];
  assert.deepEqual(firstHitInCandles(t, c), { result: "tp", at: 1_000_120 * 1000 });
});
test("paper catch-up ignores price moves in the candle the trade opened in", () => {
  // 1m candle dipped to 4149 at :10, the BUY (SL 4150) was opened at :40 — the dip must not stop it out.
  const start = 1_000_000;
  const t = pt({ entry: 4155.6, sl: 4150, tp: 4170, openedAt: (start + 40) * 1000 });
  const dipCandle = { time: start, open: 4155, high: 4156, low: 4149, close: 4155.6 };
  assert.equal(firstHitInCandles(t, [dipCandle]), null);
  // A later candle that really reaches the SL still closes it; a candle starting exactly at open counts.
  const later = { time: start + 60, open: 4155, high: 4156, low: 4149.5, close: 4150 };
  assert.deepEqual(firstHitInCandles(t, [dipCandle, later]), { result: "sl", at: (start + 60) * 1000 });
  assert.deepEqual(firstHitInCandles(pt({ sl: 4150, openedAt: start * 1000 }), [dipCandle]), { result: "sl", at: start * 1000 });
});
test("paper stats + level validation", () => {
  const win = closeTrade(pt({ sl: 1.098, tp: 1.104 }), 0, "tp", 2, {});
  const loss = closeTrade(pt({ sl: 1.098, tp: 1.104 }), 0, "sl", 3, {});
  const s = stats({ startBalance: 10_000, trades: [win, loss] });
  assert.equal(s.balance.toFixed(2), "10020.00"); // +40 -20
  assert.equal(s.winRate, 0.5);
  assert.equal(s.avgR?.toFixed(2), "0.50"); // (+2R -1R)/2
  assert.equal(validateLevels("buy", 1.1, 1.101), "slSide");
  assert.equal(validateLevels("sell", 1.1, 1.102, 1.103), "tpSide");
  assert.equal(validateLevels("buy", 1.1, 1.098, 1.104), null);
});
test("paper pending orders: kind from entry vs live price", () => {
  assert.equal(pendingKind("buy", 1.1, 1.098), "limit");
  assert.equal(pendingKind("buy", 1.1, 1.102), "stop");
  assert.equal(pendingKind("sell", 1.1, 1.102), "limit");
  assert.equal(pendingKind("sell", 1.1, 1.098), "stop");
  assert.equal(pendingKind("buy", 1.1, 1.1), null);
});
test("paper pending orders: fill when the entry is reached, and never trigger SL/TP before that", () => {
  const buyLimit = pt({ pending: "limit", entry: 1.098, sl: 1.096, tp: 1.104 });
  assert.equal(entryReached(buyLimit, 1.0985, 1.11), false);
  assert.equal(entryReached(buyLimit, 1.0975, 1.1), true);
  assert.equal(entryReached(pt({ pending: "stop", entry: 1.102 }), 1.09, 1.1019), false);
  assert.equal(entryReached(pt({ pending: "stop", entry: 1.102 }), 1.09, 1.102), true);
  assert.equal(entryReached(pt({ side: "sell", pending: "limit", entry: 1.102 }), 1.09, 1.1021), true);
  assert.equal(entryReached(pt({ side: "sell", pending: "stop", entry: 1.098 }), 1.0981, 1.11), false);
  assert.equal(hitInRange(buyLimit, 1.09, 1.11), null); // pending: no SL/TP yet
  assert.equal(entryReached(fillTrade(buyLimit, 5), 1.0, 2.0), false);
  assert.equal(fillTrade(buyLimit, 5).pending, undefined);
});
test("paper pending orders: catch-up fill skips the placement candle and the fill candle's SL/TP", () => {
  const start = 1_000_000;
  const t = pt({ pending: "stop", entry: 1.102, sl: 1.098, tp: 1.108, openedAt: (start + 30) * 1000 });
  const placement = { time: start, open: 1.1, high: 1.103, low: 1.1, close: 1.1 }; // touched 1.102 before the order existed
  const fillCandle = { time: start + 60, open: 1.1, high: 1.1025, low: 1.097, close: 1.102 }; // dipped below SL, order unknown
  const after = { time: start + 120, open: 1.102, high: 1.1085, low: 1.101, close: 1.108 };
  assert.equal(firstFillInCandles(t, [placement]), null);
  const fill = firstFillInCandles(t, [placement, fillCandle, after])!;
  assert.equal(fill.at, (start + 61) * 1000);
  const filled = fillTrade(t, fill.at);
  assert.deepEqual(firstHitInCandles(filled, [placement, fillCandle, after]), { result: "tp", at: (start + 120) * 1000 });
});
test("paper stats: pending orders are neither open nor closed", () => {
  const s = stats({ startBalance: 10_000, trades: [pt({ pending: "limit" }), pt({}), closeTrade(pt({ sl: 1.098 }), 0, "sl", 3, {})] });
  assert.equal(s.open, 1);
  assert.equal(s.pending, 1);
  assert.equal(s.closed, 1);
});

// ── Market feedback (track record) + regime features ──
import { plansFromReply, resolvePlan, summarizeTrack, type PlanRecord } from "../src/lib/ai/track";
import { adx, macd, regimeOf, turbulence } from "../src/lib/market/indicators";

const bar = (time: number, low: number, high: number, close = (low + high) / 2) => ({ time, open: close, high, low, close });
const H = 3600, T0 = 1_790_000_000;
const plan = { side: "long" as const, entry: 100, sl: 98, tp: 104, t: T0, price: 100 };

test("plan scoring: market long hits TP (+2R), SL wins a same-candle tie, creation candle ignored", () => {
  const made = bar(T0, 90, 110); // range before the plan existed — must not count
  assert.deepEqual(resolvePlan(plan, [made, bar(T0 + H, 99, 101), bar(T0 + 2 * H, 100, 104.5)], H), { status: "tp", r: 2, at: T0 + 2 * H });
  assert.equal(resolvePlan(plan, [made, bar(T0 + H, 97.5, 104.5)], H)!.status, "sl");
});
test("plan scoring: limit entry never reached → nofill; still live → undefined; horizon → marked at market", () => {
  const limit = { ...plan, entry: 99, sl: 97, tp: 103, price: 100.5 };
  assert.equal(resolvePlan(limit, [bar(T0, 100, 101), bar(T0 + H, 100, 103.2)], H)!.status, "nofill");
  assert.equal(resolvePlan(plan, [bar(T0, 99, 101), bar(T0 + H, 99, 101)], H, 60, T0 + 2 * H), undefined);
  const flat = [bar(T0, 99, 101), ...Array.from({ length: 3 }, (_, i) => bar(T0 + (i + 1) * H, 99.5, 101, 101))];
  assert.deepEqual(resolvePlan(plan, flat, H, 3, T0 + 10 * H), { status: "expired", r: 0.5, at: T0 + 3 * H });
  assert.equal(resolvePlan(plan, [bar(T0 + 5 * H, 99, 101)], H, 3, T0 + 10 * H)!.status, "void", "history must reach back to the plan");
});
test("plansFromReply keeps only sane positions", () => {
  const r = 'Plan.\n```sobatfx-draw\n{"drawings":[{"type":"position","side":"long","entry":4205,"sl":4195,"tp":4230},{"type":"position","side":"short","entry":4205,"sl":4195,"tp":4180},{"type":"hline","price":4200}]}\n```';
  assert.deepEqual(plansFromReply(r), [{ side: "long", entry: 4205, sl: 4195, tp: 4230 }]);
});
test("track summary: counts, win rate, groups, small-sample warning", () => {
  const rec = (side: "long" | "short", status: "tp" | "sl", r: number, turbPct: number): PlanRecord => ({
    id: Math.random().toString(36), symbol: "XAUUSD", interval: "1h", tier: "pro", side, entry: 1, sl: 0, tp: 2, t: T0, price: 1,
    feat: { turbPct, trend: 1 }, outcome: { status, r, at: T0 },
  });
  const s = summarizeTrack("XAUUSD", [rec("long", "tp", 2, 40), rec("long", "sl", -1, 95), rec("short", "sl", -1, 95)]);
  assert.match(s, /Scored 3 \(small sample/);
  assert.match(s, /1 TP, 2 SL/);
  assert.match(s, /win rate 33%/);
  assert.match(s, /turbulent 0\/2/);
  assert.match(s, /counter-trend 0\/1/);
  assert.equal(summarizeTrack("XAUUSD", []), "");
});
test("turbulence spikes on a shock bar; regime gate at p90", () => {
  let px = 100;
  const c = Array.from({ length: 300 }, (_, i) => {
    const o = px;
    px *= 1 + Math.sin(i * 1.7) * 0.001;
    return { time: T0 + i * H, open: o, close: px, high: Math.max(o, px) * 1.0008, low: Math.min(o, px) * 0.9992 };
  });
  const calm = turbulence(c)!;
  const last = c.at(-1)!;
  const shocked = [...c, ...[1, 2, 3].map((k) => ({ time: last.time + k * H, open: last.close, close: last.close * (1 - 0.01 * k), high: last.close * 1.002, low: last.close * (1 - 0.012 * k) }))];
  assert.ok(turbulence(shocked)!.pct >= 99 && turbulence(shocked)!.value > calm.value * 10);
  assert.equal(regimeOf(95), "turbulent");
  assert.equal(regimeOf(30), "calm");
  assert.equal(regimeOf(null), null);
});
test("MACD / ADX sanity on a steady uptrend", () => {
  const c = Array.from({ length: 120 }, (_, i) => bar(T0 + i * H, 100 + i - 0.5, 100 + i + 0.8, 100 + i + 0.5));
  assert.ok(macd(c.map((x) => x.close))!.macd > 0);
  assert.ok(adx(c)! > 50, "clean trend → strong ADX");
});
test("tier prompts: Free is analysis-only, Pro/Ultra get plans, uploads and journal review", () => {
  const free = systemPrompt("free"), pro = systemPrompt("pro"), ultra = systemPrompt("ultimate");
  assert.doesNotMatch(free, /"type":"position"/);
  assert.doesNotMatch(free, /sobatfx-annotate/);
  assert.match(free, /Do NOT give entry prices, stop loss/);
  for (const p of [pro, ultra]) {
    assert.match(p, /"type":"position"/);
    assert.match(p, /sobatfx-annotate/);
    assert.match(p, /DEMO trading journal/);
    assert.doesNotMatch(p, /Do NOT give entry prices/);
  }
});
test("multi-timeframe: which frames each tier sees above the chart's", () => {
  assert.deepEqual(higherTimeframes("15m", "free"), []);
  assert.deepEqual(higherTimeframes("15m", "pro"), ["1h", "4h", "1d"]);
  assert.deepEqual(higherTimeframes("15m", "ultimate"), ["1h", "4h", "1d"]);
  assert.deepEqual(higherTimeframes("1m", "ultimate"), ["15m", "1h", "4h", "1d"]);
  assert.deepEqual(higherTimeframes("1m", "pro"), ["15m", "1h", "4h", "1d"]);
  assert.deepEqual(higherTimeframes("1h", "pro"), ["4h", "1d"]);
  assert.deepEqual(higherTimeframes("1d", "ultimate"), []);
  assert.deepEqual(higherTimeframes("nope", "pro"), []);
});
test("multi-timeframe: summary reads trend, structure and alignment", () => {
  const mk = (dir: 1 | -1): Candle[] =>
    Array.from({ length: 220 }, (_, i) => {
      const base = 100 + dir * i * 0.5 + Math.sin(i / 4) * 3;
      return { time: 1_700_000_000 + i * 3600, open: base, high: base + 1, low: base - 1, close: base + dir * 0.2 };
    });
  const up = summarizeTf("4h", mk(1), 2)!, down = summarizeTf("1d", mk(-1), 2)!;
  assert.equal(up.bias, "bullish");
  assert.equal(down.bias, "bearish");
  assert.match(up.line, /^4H: bullish .*structure HH\+HL/);
  assert.match(down.line, /structure LH\+LL/);
  assert.equal(summarizeTf("4h", mk(1).slice(0, 30), 2), null, "too little history → no summary");
  assert.match(formatMtf("XAUUSD", "1h", [up, down]), /Alignment: higher timeframes CONFLICT/);
  assert.match(formatMtf("XAUUSD", "1h", [up, up]), /Alignment: all higher timeframes bullish/);
  assert.equal(formatMtf("XAUUSD", "1h", []), "");
});
test("multi-timeframe: paid prompts teach top-down use, Free never sees the block", () => {
  for (const t of ["pro", "ultimate"] as const) assert.match(systemPrompt(t), /MULTI-TIMEFRAME/);
  assert.doesNotMatch(systemPrompt("free"), /MULTI-TIMEFRAME|Higher-timeframe view/);
  assert.match(contextBlock({ symbol: "XAUUSD", symbolName: "Gold", interval: "1h" }, "news", false, "en", "", "Higher-timeframe view of XAUUSD"), /Higher-timeframe view of XAUUSD/);
});
test("paid prompt teaches regime + track record; free doesn't", () => {
  assert.match(systemPrompt("pro"), /Track record/);
  assert.doesNotMatch(systemPrompt("free"), /Track record/);
});

// ── Calendar usual effect ──
import { pairDirection, parseValue, surprise, usualEffect } from "../src/lib/usual-effect";

test("usual effect matches Forex Factory's detail pages", () => {
  for (const t of ["Non-Farm Employment Change", "CPI m/m", "Final GDP q/q", "ISM Manufacturing PMI", "Cash Rate", "Federal Funds Rate", "Prelim UoM Inflation Expectations"]) assert.equal(usualEffect(t), "higher", t);
  for (const t of ["Unemployment Rate", "Unemployment Claims", "Claimant Count Change"]) assert.equal(usualEffect(t), "lower", t);
  for (const t of ["FOMC Statement", "ECB Press Conference", "BOE Gov Bailey Speaks", "MPC Official Bank Rate Votes", "FOMC Economic Projections", "SNB Monetary Policy Assessment", "RBNZ Monetary Policy Statement", "ECB President Lagarde Speaks", "German Buba President Nagel Speaks"]) assert.equal(usualEffect(t), "hawkish", t);
  for (const t of ["President Trump Speaks", "Treasury Sec Bessent Speaks"]) assert.equal(usualEffect(t), null, t);
});
test("surprise: beat/miss judged by usual effect, units parsed", () => {
  assert.equal(parseValue("90K"), 90_000);
  assert.equal(parseValue("<1.25%"), 1.25);
  assert.equal(surprise("Non-Farm Employment Change", "120K", "90K"), 1);
  assert.equal(surprise("Unemployment Rate", "4.3%", "4.1%"), -1, "higher unemployment is bad for the currency");
  assert.equal(surprise("CPI m/m", 0.4, 0.5), -1);
  assert.equal(surprise("Cash Rate", "4.60%", "4.60%"), 0);
  assert.equal(surprise("GDP m/m", "0.2%", "", "0.1%"), 1, "no forecast → compare with previous");
  assert.equal(surprise("FOMC Statement", "x", "y"), null);
  assert.equal(pairDirection("USD", getInstrument("XAUUSD")!), -1);
  assert.equal(pairDirection("EUR", getInstrument("EURUSD")!), 1);
  assert.equal(pairDirection("JPY", getInstrument("EURUSD")!), 0);
});

// ── Actuals from release headlines ──
import { matchRelease, parseRelease } from "../src/lib/releases";

test("release headlines parse: actual, expected, prior, units, period", () => {
  const p = (s: string) => {
    const r = parseRelease(s);
    return r && [r.currency ?? "-", r.actual, r.expected, r.prior ?? "-", r.period ?? "-"];
  };
  assert.deepEqual(p("JOLTS job openings 7.079M vs 7.225M estimate"), ["-", 7_079_000, 7_225_000, "-", "-"]);
  assert.deepEqual(p("Sept US consumer confidence 81.9 vs 89.2 expected"), ["USD", 81.9, 89.2, "-", "-"]);
  assert.deepEqual(p("Australian August Headline CPI 4% (vs. expected 4%, prior 3.5%)"), ["AUD", 4, 4, 3.5, "-"]);
  assert.deepEqual(p("Canada July GDP 0.0% vs 0.0% expected"), ["CAD", 0, 0, "-", "-"]);
  assert.deepEqual(p("US July CaseShiller 20-city house price index +2.5% vs 2.2% expected"), ["USD", 2.5, 2.2, "-", "-"]);
  assert.deepEqual(p("US Q2 GDP final 3.8% vs 3.3% expected"), ["USD", 3.8, 3.3, "-", "-"]);
  assert.deepEqual(p("Eurozone September flash CPI +2.2% y/y vs +2.3% y/y expected"), ["EUR", 2.2, 2.3, "-", "y/y"]);
  assert.deepEqual(p("US August non-farm payrolls +142K vs +160K expected"), ["USD", 142_000, 160_000, "-", "-"]);
  assert.equal(parseRelease("China official manufacturing PMI (September): 50.1 (expected 50.1, prior 49.8)"), null, "no app currency");
  assert.equal(parseRelease("Gold hits record as dollar slides"), null);
  assert.equal(parseRelease("Fed's Waller says rates could fall in 2027"), null);
});

test("release headlines match the right calendar event, or none", () => {
  const e = (time: string, currency: string, title: string, forecast: string, previous = "") => ({ time, currency, title, forecast, previous });
  const cal = [
    e("2026-09-29T14:00:00.000Z", "USD", "JOLTS Job Openings", "7.23M", "7.27M"),
    e("2026-09-29T14:00:00.000Z", "USD", "CB Consumer Confidence", "89.2", "89.4"),
    e("2026-09-30T01:30:00.000Z", "AUD", "CPI m/m", "0.5%", "1.0%"),
    e("2026-09-30T01:30:00.000Z", "AUD", "CPI y/y", "4.1%", "3.5%"),
    e("2026-09-30T01:30:00.000Z", "AUD", "Trimmed Mean CPI m/m", "0.3%", "0.5%"),
    e("2026-09-30T12:15:00.000Z", "USD", "ADP Non-Farm Employment Change", "73K", "38K"),
    e("2026-10-02T12:30:00.000Z", "USD", "Non-Farm Employment Change", "90K", "162K"),
    e("2026-10-02T12:30:00.000Z", "USD", "Unemployment Rate", "4.1%", "4.1%"),
    e("2026-10-01T12:30:00.000Z", "USD", "Unemployment Claims", "201K", "197K"),
    e("2026-10-01T14:00:00.000Z", "USD", "ISM Manufacturing PMI", "54.8", "54.6"),
    e("2026-10-01T14:00:00.000Z", "USD", "ISM Manufacturing Prices", "62.1", "63.0"),
    e("2026-09-30T12:30:00.000Z", "USD", "Core PCE Price Index m/m", "0.3%", "0.2%"),
    e("2026-09-29T11:00:00.000Z", "EUR", "ECB President Lagarde Speaks", ""),
  ];
  const m = (title: string, at: string) => matchRelease(parseRelease(title)!, at, cal)?.title ?? null;
  assert.equal(m("JOLTS job openings 7.079M vs 7.225M estimate", "2026-09-29T14:09:00Z"), "JOLTS Job Openings");
  assert.equal(m("Sept US consumer confidence 81.9 vs 89.2 expected", "2026-09-29T14:00:00Z"), "CB Consumer Confidence");
  assert.equal(m("Australian August Headline CPI 4% (vs. expected 4%, prior 3.5%)", "2026-09-30T01:30:00Z"), "CPI y/y", "value picks y/y over m/m");
  assert.equal(m("Australia August trimmed mean CPI +0.2% m/m vs +0.3% expected", "2026-09-30T01:31:00Z"), "Trimmed Mean CPI m/m");
  assert.equal(m("US ADP employment +81K vs +73K expected", "2026-09-30T12:15:00Z"), "ADP Non-Farm Employment Change");
  assert.equal(m("US September non-farm payrolls +120K vs +90K expected", "2026-10-02T12:30:00Z"), "Non-Farm Employment Change");
  assert.equal(m("US September unemployment rate 4.2% vs 4.1% expected", "2026-10-02T12:31:00Z"), "Unemployment Rate");
  assert.equal(m("US initial jobless claims 205K vs 201K estimate", "2026-10-01T12:30:00Z"), "Unemployment Claims");
  assert.equal(m("US continuing claims 1.95M vs 1.93M estimate", "2026-10-01T12:30:00Z"), null, "continuing ≠ initial claims");
  assert.equal(m("US September ISM manufacturing 55.2 vs 54.8 expected", "2026-10-01T14:00:00Z"), "ISM Manufacturing PMI");
  assert.equal(m("US ISM manufacturing prices paid 64.0 vs 62.1 expected", "2026-10-01T14:00:00Z"), "ISM Manufacturing Prices");
  assert.equal(m("US August PCE +0.3% m/m vs +0.3% expected", "2026-09-30T12:30:00Z"), null, "headline PCE ≠ Core PCE");
  assert.equal(m("US August core PCE +0.2% m/m vs +0.3% expected", "2026-09-30T12:30:00Z"), "Core PCE Price Index m/m");
  assert.equal(m("US September non-farm payrolls +120K vs +90K expected", "2026-10-02T11:00:00Z"), null, "headline before the release time");

  const rates = [
    e("2026-09-29T04:30:00.000Z", "AUD", "Cash Rate", "4.60%", "4.35%"),
    e("2026-10-28T18:00:00.000Z", "USD", "Federal Funds Rate", "4.00%", "4.25%"),
    e("2026-09-29T04:30:00.000Z", "AUD", "RBA Rate Statement", ""),
  ];
  const mr = (title: string, at: string) => {
    const r = parseRelease(title);
    return r ? [matchRelease(r, at, rates)?.title ?? null, r.actual] : null;
  };
  assert.deepEqual(mr("RBA raises cash rate by 25bp to 4.60%, as expected", "2026-09-29T04:31:00Z"), ["Cash Rate", 4.6]);
  assert.deepEqual(mr("Fed cuts rates by 25 bps to 3.75%-4.00%", "2026-10-28T18:00:00Z"), ["Federal Funds Rate", 4]);
  assert.equal(mr("Traders bet the Fed will cut rates to 3.75%", "2026-10-28T18:05:00Z"), null, "expectations aren't decisions");
  assert.deepEqual(mr("RBA raises cash rate to 4.60%", "2026-09-28T04:31:00Z"), [null, 4.6], "a day before the meeting: no match");
});

// ── Calendar event detail ──
import { eventSpec } from "../src/lib/event-specs";

test("event detail: kind, publisher, frequency for real FF titles", () => {
  const s = (title: string, cur: string) => {
    const x = eventSpec(title, cur)!;
    return [x.kind, x.source ?? "-", x.frequency.kind === "meetings" ? `meetings:${x.frequency.n}` : x.frequency.kind];
  };
  assert.deepEqual(s("Final GDP q/q", "USD"), ["gdp", "Bureau of Economic Analysis", "quarterly"]);
  assert.deepEqual(s("GDP m/m", "CAD"), ["gdp", "Statistics Canada", "monthly"]);
  assert.deepEqual(s("Core PCE Price Index m/m", "USD"), ["pce", "Bureau of Economic Analysis", "monthly"]);
  assert.deepEqual(s("Non-Farm Employment Change", "USD"), ["payrolls", "Bureau of Labor Statistics", "monthly"]);
  assert.deepEqual(s("ADP Non-Farm Employment Change", "USD"), ["adp", "ADP Research", "monthly"]);
  assert.deepEqual(s("Unemployment Claims", "USD"), ["claims", "Department of Labor", "weekly"]);
  assert.deepEqual(s("Claimant Count Change", "GBP"), ["claims", "Office for National Statistics", "monthly"]);
  assert.deepEqual(s("ISM Manufacturing Prices", "USD"), ["pmiPrices", "Institute for Supply Management", "monthly"]);
  assert.deepEqual(s("German Flash Manufacturing PMI", "EUR"), ["pmi", "S&P Global", "monthly"]);
  assert.deepEqual(s("German Prelim CPI m/m", "EUR"), ["cpi", "Destatis", "monthly"]);
  assert.deepEqual(s("CB Consumer Confidence", "USD"), ["confidence", "The Conference Board", "monthly"]);
  assert.deepEqual(s("Prelim UoM Inflation Expectations", "USD"), ["inflationExp", "University of Michigan", "monthly"]);
  assert.deepEqual(s("Final GDP Price Index q/q", "USD"), ["gdpPrice", "Bureau of Economic Analysis", "quarterly"]);
  assert.deepEqual(s("Cash Rate", "AUD"), ["rate", "Reserve Bank of Australia", "meetings:8"]);
  assert.deepEqual(s("FOMC Statement", "USD"), ["cbTalk", "Federal Reserve", "meetings:8"]);
  assert.deepEqual(s("BOE Gov Bailey Speaks", "GBP"), ["cbTalk", "Bank of England", "irregular"]);
  assert.deepEqual(s("President Trump Speaks", "USD"), ["political", "-", "irregular"]);
  assert.deepEqual(s("Unemployment Rate", "NZD"), ["unemployment", "Stats NZ", "quarterly"]);
  assert.deepEqual(eventSpec("Tokyo Core CPI y/y", "JPY")!.notes, ["core"]);
  assert.deepEqual(eventSpec("Final GDP q/q", "USD")!.notes, ["usGdp"]);
  assert.equal(eventSpec("Bank Holiday", "GBP"), null);
});

// ── Prediction: preview headlines, pre-release lean, price reaction ──
import { outlookFor, reactionFromCandles, summarizeReactions, type HistRec } from "../src/lib/outlook";
import { PREVIEW_WINDOW, parsePreview } from "../src/lib/releases";

test("preview headlines: figure parsed and matched before the release only", () => {
  const p = parsePreview("Australia CPI preview: headline inflation seen at 4.0% after RBA hike")!;
  assert.deepEqual([p.currency, p.actual], ["AUD", 4]);
  assert.equal(parsePreview("Sept US consumer confidence 81.9 vs 89.2 expected"), null, "a release, not a preview");
  assert.equal(parsePreview("Gold rallies ahead of NFP"), null, "no figure");
  const cal = [
    { time: "2026-09-30T01:30:00.000Z", currency: "AUD", title: "CPI m/m", forecast: "0.5%", previous: "1.0%" },
    { time: "2026-09-30T01:30:00.000Z", currency: "AUD", title: "CPI y/y", forecast: "4.1%", previous: "3.5%" },
  ];
  assert.equal(matchRelease(p, "2026-09-29T20:44:00Z", cal, PREVIEW_WINDOW)?.title, "CPI y/y");
  assert.equal(matchRelease(p, "2026-09-30T02:00:00Z", cal, PREVIEW_WINDOW), undefined, "after the release it's not a preview");
});

test("lean: preview + related releases + streak, low/medium confidence", () => {
  const nfp = { time: "2026-10-02T12:30:00.000Z", currency: "USD", title: "Non-Farm Employment Change", forecast: "90K" };
  const cal = [
    nfp,
    { time: "2026-09-30T12:15:00.000Z", currency: "USD", title: "ADP Non-Farm Employment Change", forecast: "73K", actual: "120K", better: 1 as const },
    { time: "2026-10-01T12:30:00.000Z", currency: "USD", title: "Unemployment Claims", forecast: "201K", actual: "190K", better: 1 as const },
  ];
  const none = () => [] as HistRec[];
  // Two related releases beat → leans better, low confidence (one kind of signal).
  let o = outlookFor(nfp, cal, none);
  assert.deepEqual([o.lean, o.confidence, o.reasons.map((r) => r.kind)], [1, "low", ["lead", "lead"]]);
  // Add a preview above consensus → medium confidence.
  o = outlookFor(nfp, cal, none, { value: 110_000, text: "110K" }, 90_000);
  assert.deepEqual([o.lean, o.confidence], [1, "medium"]);
  // Preview below consensus cancels the leads → leans stay weak.
  o = outlookFor(nfp, cal, none, { value: 60_000, text: "60K" }, 90_000);
  assert.equal(o.lean, 0);
  // A lead released AFTER the target doesn't count; the streak needs ≥4 past releases.
  const later = [nfp, { ...cal[1], time: "2026-10-03T12:15:00.000Z" }];
  assert.equal(outlookFor(nfp, later, none).reasons.length, 0);
  const T = Date.parse(nfp.time);
  const past: HistRec[] = [1, 1, 1, -1, 1].map((b, i) => ({ t: T - (i + 1) * 30 * 86_400_000, actual: 1, forecast: 1, better: b as 1 | -1, lean: 1 }));
  o = outlookFor(nfp, [nfp], (title) => (title === nfp.title ? past : []));
  assert.deepEqual([o.lean, o.reasons[0]], [1, { kind: "streak", beats: 4, misses: 1, n: 5 }]);
  assert.deepEqual(o.record, { hits: 4, n: 5 }, "past leans are scored against the results");
  // Lower-is-better event: a preview BELOW forecast is the good side.
  const ur = { time: nfp.time, currency: "USD", title: "Unemployment Rate", forecast: "4.1%" };
  assert.equal(outlookFor(ur, [ur], none, { value: 4.0, text: "4.0%" }, 4.1).reasons[0].kind === "preview" && outlookFor(ur, [ur], none, { value: 4.0, text: "4.0%" }, 4.1).lean, 1);
});

test("price reaction: pips at 15 min / 1 h from 5-minute candles; summary counts the usual direction", () => {
  const rel = Date.parse("2026-10-02T12:30:00Z");
  const s = rel / 1000;
  const c = Array.from({ length: 14 }, (_, i) => ({ time: s + i * 300, open: 4000 - i * 1.5, close: 4000 - (i + 1) * 1.5 }));
  assert.deepEqual(reactionFromCandles(rel, c, 0.1), { m15: -45, h1: -180 });
  assert.equal(reactionFromCandles(rel, c.slice(1), 0.1), null, "no candle at the release time");
  assert.equal(reactionFromCandles(rel, c.map((x) => ({ ...x, open: 150, close: 150 })), 0.01), null, "stale feed (no trades all hour)");
  const xau = getInstrument("XAUUSD")!;
  const recs: HistRec[] = [
    { t: 1, actual: 1, forecast: 1, better: 1, react: { XAUUSD: { m15: -40, h1: -180 } } }, // USD beat → gold down: usual
    { t: 2, actual: 1, forecast: 1, better: -1, react: { XAUUSD: { m15: -10, h1: -60 } } }, // USD miss but gold down: not usual
    { t: 3, actual: 1, forecast: 1, better: 0, react: { XAUUSD: { m15: 5, h1: 30 } } },
  ];
  assert.deepEqual(summarizeReactions(recs, "XAUUSD", "USD", xau), { n: 3, avgH1: 90, avgM15: 18.3, usual: 1, surprised: 2 });
  assert.equal(summarizeReactions(recs, "EURUSD", "USD", getInstrument("EURUSD")!), null);
});

// ─── API guard (src/lib/guard.ts) ───
const atest = async (name: string, fn: () => Promise<void>) => {
  try {
    await fn();
    console.log("✓", name);
  } catch (e) {
    console.error("✗", name, "\n ", (e as Error).message);
    process.exitCode = 1;
  }
};
const post = (headers: Record<string, string>, body = "{}") => new Request("https://sobatfx.test/api/ai/chat", { method: "POST", headers: { host: "sobatfx.test", ...headers }, body });

test("client IP: forwarded headers only behind a trusted proxy, platform header first", () => {
  const env = process.env as Record<string, string | undefined>;
  const vercel = env.VERCEL;
  try {
    delete env.VERCEL;
    assert.equal(clientIp(post({ "x-forwarded-for": "6.6.6.6" })), "untrusted", "off Vercel a forged X-Forwarded-For gets no bucket of its own");
    env.VERCEL = "1";
    assert.equal(clientIp(post({ "x-vercel-forwarded-for": "1.1.1.1", "x-forwarded-for": "6.6.6.6" })), "1.1.1.1");
    assert.equal(clientIp(post({})), "unknown");
  } finally {
    env.VERCEL = vercel;
  }
});
test("same-origin check: own site passes, other sites fail, missing Origin fails in production", () => {
  const prod = process.env.NODE_ENV;
  (process.env as Record<string, string>).NODE_ENV = "production";
  try {
    assert.ok(isSameOrigin(post({ origin: "https://sobatfx.test" })));
    assert.ok(isSameOrigin(post({ referer: "https://sobatfx.test/trade" })));
    assert.ok(!isSameOrigin(post({ origin: "https://evil.example" })));
    assert.ok(!isSameOrigin(post({})));
  } finally {
    (process.env as Record<string, string | undefined>).NODE_ENV = prod;
  }
});

void (async () => {
  await atest("sync: merge keeps both devices' drawings and trades, and never re-opens a closed trade", async () => {
    const line = (id: string, price: number) => ({ id, type: "horizontal" as const, price, color: "#fff" });
    const trade = (id: string, extra: object = {}) => ({ id, symbol: "XAUUSD", side: "buy" as const, lot: 0.1, entry: 2000, openedAt: Number(id.slice(1)) * 1000, ...extra });
    const pc: SyncData = { drawings: { XAUUSD: [line("a", 1), line("b", 2)] }, paper: { startBalance: 10_000, trades: [trade("t1"), trade("t2", { pending: "limit" })] } };
    const phone: SyncData = { drawings: { XAUUSD: [line("b", 3), line("c", 4)], EURUSD: [line("d", 5)] }, paper: { startBalance: 5000, trades: [trade("t1", { closedAt: 9, exit: 2010, result: "tp", pnl: 10 }), trade("t3")] } };
    const m = mergeData(pc, phone);
    assert.deepEqual(m.drawings.XAUUSD.map((d) => d.id).sort(), ["a", "b", "c"]);
    assert.equal(m.drawings.XAUUSD.find((d) => d.id === "b")!.price, 2, "on a clash the merging device's copy wins");
    assert.equal(m.drawings.EURUSD.length, 1);
    assert.deepEqual(m.paper.trades.map((t) => t.id), ["t1", "t2", "t3"]);
    assert.equal(m.paper.trades[0].closedAt, 9, "the closed copy beats the open one");
    assert.equal(m.paper.startBalance, 10_000);
    assert.notEqual(fingerprint(pc), fingerprint(phone));
    assert.equal(fingerprint(pc), fingerprint(JSON.parse(JSON.stringify(pc))), "same content, same fingerprint after a storage round trip");
    assert.ok(!hasContent(emptyData()) && hasContent(pc));
  });
  await atest("sync store: saves only from the current revision, otherwise hands back the newer copy", async () => {
    const mail = `sync-${Date.now()}@test.com`;
    assert.equal((await loadDoc(mail)).rev, 0);
    const mine = { ...emptyData(), drawings: { XAUUSD: [{ id: "a", type: "horizontal", price: 1, color: "#fff" }] } } as SyncData;
    const first = await saveDoc(mail, 0, mine);
    assert.deepEqual(first, { ok: true, rev: 1 });
    const stale = await saveDoc(mail, 0, emptyData());
    assert.ok(!stale.ok && stale.current.rev === 1 && stale.current.drawings.XAUUSD.length === 1, "a device that missed rev 1 can't overwrite it");
    assert.deepEqual(await saveDoc(mail, 1, emptyData()), { ok: true, rev: 2 });
    const race = await Promise.all([saveDoc(mail, 2, mine), saveDoc(mail, 2, emptyData())]);
    assert.equal(race.filter((r) => r.ok).length, 1, "two devices saving from the same revision: exactly one wins, the other must merge");
    assert.ok(syncDataSchema.safeParse(mine).success);
    assert.ok(!syncDataSchema.safeParse({ ...mine, paper: { startBalance: 1, trades: [{ id: "x" }] } }).success, "malformed trades are rejected");
    assert.ok(!syncDataSchema.safeParse({ drawings: { XAUUSD: [{ price: 1 }] }, paper: mine.paper }).success, "drawings need an id and a type");
  });
  await atest("rate limit: allows `limit` hits per window, then blocks with a Retry-After", async () => {
    const k = `selftest:${Date.now()}`;
    for (let i = 0; i < 3; i++) assert.ok((await hit(k, 3, 60)).ok);
    const r = await hit(k, 3, 60);
    assert.ok(!r.ok && r.retryAfter >= 1 && r.retryAfter <= 60);
    assert.ok((await hit(`${k}:other`, 3, 60)).ok, "another key has its own count");
  });
  await atest("one AI slot per user: a second request is refused until the first finishes", async () => {
    const email = `slot-${Date.now()}@test`;
    const release = await acquireSlot(email);
    assert.ok(release);
    assert.equal(await acquireSlot(email), null);
    await release();
    await release(); // releasing twice must not free somebody else's slot
    const again = await acquireSlot(email);
    assert.ok(again);
    assert.equal(await acquireSlot(email), null);
  });
  await atest("payments: grants are once per order, the pay lock is exclusive and expires, odd ids are never looked up", async () => {
    const mail = `grant-${Date.now()}@test.com`;
    const once = (await grantTier(mail, "pro", 30, "SFX-PRO-TEST-1")).proUntil!;
    assert.equal((await grantTier(mail, "pro", 30, "SFX-PRO-TEST-1")).proUntil, once, "a retried grant for the same order doesn't extend again");
    assert.equal((await grantTier(mail, "pro", 30, "SFX-PRO-TEST-2")).proUntil, once + 30 * 86_400_000);
    const k = `paylock:test-${Date.now()}`;
    assert.ok(await kv.lock(k, 1));
    assert.ok(!(await kv.lock(k, 1)), "held");
    await new Promise((r) => setTimeout(r, 1100));
    assert.ok(await kv.lock(k, 1), "a crashed holder's lock runs out");
    assert.equal(await getOrder("../user:someone"), null);
    assert.equal(await getOrder("x".repeat(500)), null);
  });
  await atest("body reader stops at the size cap, and rejects bad JSON", async () => {
    assert.deepEqual(await readJson(post({}, JSON.stringify({ a: 1 })), 100), { ok: true, data: { a: 1 } });
    assert.deepEqual(await readJson(post({}, "x".repeat(500)), 100), { ok: false, status: 413 });
    assert.deepEqual(await readJson(post({}, "{nope"), 100), { ok: false, status: 400 });
  });
  await atest("bank transfer: unique amounts, owner-only approval, single grant, confirmed /grant", async () => {
    const env = process.env as Record<string, string | undefined>;
    Object.assign(env, { BANK_NAME: "BCA", BANK_ACCOUNT_NUMBER: "123", BANK_ACCOUNT_HOLDER: "SobatFX", TELEGRAM_BOT_TOKEN: "t", TELEGRAM_WEBHOOK_SECRET: "s3cret", TELEGRAM_ADMIN_IDS: "111, x, 222", PRO_PRICE_IDR: "99000" });
    const calls: { method: string; body: Record<string, unknown> }[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string, init: { body: string }) => {
      calls.push({ method: String(url).split("/").pop()!, body: JSON.parse(init.body) });
      return Response.json({ ok: true, result: { message_id: 1 } });
    }) as unknown as typeof fetch;
    try {
      const tag = Date.now();
      const buyer = `buyer-${tag}@test.com`;
      const order = await createTransferOrder(buyer, "pro");
      assert.ok(order.amount > 99000 && order.amount < 100000 && order.method === "transfer");
      assert.equal((await createTransferOrder(buyer, "pro")).id, order.id, "reopening reuses the open order");
      const amounts = new Set([order.amount]);
      for (let i = 0; i < 40; i++) amounts.add((await createTransferOrder(`other-${tag}-${i}@test.com`, "pro")).amount);
      assert.equal(amounts.size, 41, "no two open orders share an amount");
      assert.equal(displayStatus({ ...order, expiresAt: Date.now() - 1 }), "expired");

      assert.ok(await notifyClaim(order));
      const card = calls.filter((c) => c.method === "sendMessage");
      assert.deepEqual(card.map((c) => c.body.chat_id), [111, 222], "every admin id is told, junk ids are ignored");
      assert.ok(JSON.stringify(card[0].body.reply_markup).includes(`ok:${order.id}`));

      const tap = (from: number, data: string): Update => ({ callback_query: { id: "cb", from: { id: from }, data, message: { message_id: 5, chat: { id: from, type: "private" } } } });
      await handleUpdate(tap(999, `ok:${order.id}`));
      assert.equal(effectiveTier(await getUser(buyer)).tier, "free", "a non-admin cannot approve");
      await handleUpdate(tap(111, `ok:${order.id}`));
      const until = (await getUser(buyer))!.proUntil;
      assert.equal(effectiveTier(await getUser(buyer)).tier, "pro");
      await handleUpdate(tap(222, `ok:${order.id}`));
      await handleUpdate(tap(111, `no:${order.id}`));
      assert.equal((await getUser(buyer))!.proUntil, until, "second approval and late reject change nothing");
      assert.equal((await getOrder(order.id))!.status, "paid");

      const msg = (from: number, text: string): Update => ({ message: { message_id: 9, from: { id: from }, chat: { id: from, type: "private" }, text } });
      const target = `target-${tag}@test.com`;
      calls.length = 0;
      await handleUpdate(msg(999, `/grant ${target} pro`));
      assert.ok(!(await getUser(target)) && !JSON.stringify(calls).includes("gy:"), "a non-admin gets no grant prompt");
      await handleUpdate(msg(111, `/grant ${target} ultra 10`));
      assert.equal(await getUser(target), null, "/grant only asks for confirmation");
      const token = JSON.stringify(calls.at(-1)!.body.reply_markup).match(/gy:([a-f0-9]+)/)![1];
      await handleUpdate(tap(111, `gy:${token}`));
      const granted = (await getUser(target))!.ultimateUntil!;
      assert.ok(granted > Date.now() + 9 * 86_400_000 && granted < Date.now() + 11 * 86_400_000);
      await handleUpdate(tap(111, `gy:${token}`));
      assert.equal((await getUser(target))!.ultimateUntil, granted, "confirming twice grants once");

      calls.length = 0;
      const second = await createTransferOrder(`proof-${tag}@test.com`, "pro");
      await handleUpdate({ message: { message_id: 1, from: { id: 5 }, chat: { id: 5, type: "private" }, text: `/start ${second.id}` } });
      await handleUpdate({ message: { message_id: 2, from: { id: 5 }, chat: { id: 5, type: "private" }, photo: [{}] } });
      const copies = calls.filter((c) => c.method === "copyMessage");
      assert.deepEqual(copies.map((c) => c.body.chat_id), [111, 222]);
      assert.ok(JSON.stringify(copies[0].body.reply_markup).includes(`ok:${second.id}`));
      assert.ok((await getOrder(second.id))!.claimedAt, "sending proof marks the order as claimed");
      assert.equal(effectiveTier(await getUser(`proof-${tag}@test.com`)).tier, "free", "proof alone never activates");
    } finally {
      globalThis.fetch = realFetch;
    }
  });
  await atest("sales book: QRIS + transfer + /grant recorded once, alert once, /revenue and CSV", async () => {
    const env = process.env as Record<string, string | undefined>;
    Object.assign(env, { MIDTRANS_SERVER_KEY: "k", TELEGRAM_BOT_TOKEN: "t", TELEGRAM_WEBHOOK_SECRET: "s3cret", TELEGRAM_ADMIN_IDS: "111,222", PRO_PRICE_IDR: "99000", ULTIMATE_PRICE_IDR: "299000" });
    const sent: { chat: unknown; text: string; markup?: unknown }[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string, init?: { body?: string }) => {
      const u = String(url);
      if (u.endsWith("/v2/charge")) return Response.json({ status_code: "201", qr_string: "QR" });
      if (u.endsWith("/status")) return Response.json({ transaction_status: "settlement", gross_amount: "299000.00" });
      const body = JSON.parse(init?.body ?? "{}");
      if (u.endsWith("/sendMessage")) sent.push({ chat: body.chat_id, text: body.text, markup: body.reply_markup });
      return Response.json({ ok: true, result: { message_id: 1 } });
    }) as unknown as typeof fetch;
    try {
      const tag = Date.now();
      const month = monthOf(Date.now());
      const before = summarize(await salesFor(month));

      const q = await createQrisOrder(`qris-${tag}@test.com`, "ultimate");
      assert.equal((await salesFor(month)).some((o) => o.id === q.id), false, "unpaid orders are not in the book");
      const paid = (await syncOrder(q.id))!;
      assert.equal(paid.status, "paid");
      assert.ok(paid.paidAt && Math.abs(paid.paidAt - Date.now()) < 5000);
      await syncOrder(q.id);
      const alerts = sent.filter((m) => m.text.includes("New sale"));
      assert.deepEqual(alerts.map((m) => m.chat), [111, 222], "one alert per admin, once");
      assert.ok(alerts[0].text.includes("299.000") && alerts[0].text.includes(q.id));

      await indexSale(q.id, Date.now()); // a retried grant can index twice
      await indexSale(q.id, Date.UTC(2020, 0, 15)); // or in a month it was not paid in
      assert.equal((await salesFor(month)).filter((o) => o.id === q.id).length, 1, "counted once");
      assert.equal((await salesFor("2020-01")).length, 0, "only the month it was paid in");

      const tap = (data: string): Update => ({ callback_query: { id: "cb", from: { id: 111 }, data, message: { message_id: 5, chat: { id: 111, type: "private" } } } });
      const msg = (text: string): Update => ({ message: { message_id: 9, from: { id: 111 }, chat: { id: 111, type: "private" }, text } });
      Object.assign(env, { BANK_NAME: "BCA", BANK_ACCOUNT_NUMBER: "123", BANK_ACCOUNT_HOLDER: "SobatFX" });
      const t = await createTransferOrder(`transfer-${tag}@test.com`, "pro");
      await handleUpdate(tap(`ok:${t.id}`));
      assert.ok(!sent.some((m) => m.text.includes("New sale") && m.text.includes(t.id)), "approved transfers are not announced again");
      sent.length = 0;
      await handleUpdate(msg(`/grant gift-${tag}@test.com pro 7`));
      await handleUpdate(tap(`gy:${JSON.stringify(sent.at(-1)!.markup).match(/gy:([a-f0-9]+)/)![1]}`));

      const book = await salesFor(month);
      const mine = book.filter((o) => o.email.endsWith(`-${tag}@test.com`));
      assert.deepEqual(mine.map((o) => o.method), ["qris", "transfer", "manual"], "oldest first, every way of paying");
      const after = summarize(book);
      assert.equal(after.total - before.total, 299000 + t.amount, "a free /grant is not income");
      assert.equal(after.count - before.count, 2);
      assert.equal(after.freeGrants - before.freeGrants, 1);

      sent.length = 0;
      await handleUpdate(msg("/revenue"));
      assert.ok(sent[0].text.includes((after.total).toLocaleString("id-ID")), "/revenue shows this month's total");
      await handleUpdate(msg("/revenue 2026-13"));
      assert.ok(sent[1].text.startsWith("Usage"));

      const csv = salesCsv([{ ...mine[2], note: 'telegram:1, "x"' }]).split("\n");
      assert.equal(csv[0], "order_id,paid_at_wib,method,plan,days,amount_idr,counts_as_income,email,note");
      assert.ok(csv[1].endsWith(`,manual,Pro,7,0,no,gift-${tag}@test.com,"telegram:1, ""x"""`), csv[1]);
      assert.equal(monthOf(Date.UTC(2026, 8, 30, 17, 30)), "2026-10", "00:30 WIB on 1 Oct is October");
    } finally {
      globalThis.fetch = realFetch;
    }
  });
  await atest("webhook secret: exact match only, and closed when unset", async () => {
    const env = process.env as Record<string, string | undefined>;
    env.TELEGRAM_WEBHOOK_SECRET = "s3cret";
    assert.ok(validWebhookSecret("s3cret"));
    assert.ok(!validWebhookSecret("s3cre7") && !validWebhookSecret("s3cret!") && !validWebhookSecret(null));
    env.TELEGRAM_WEBHOOK_SECRET = "";
    assert.ok(!validWebhookSecret("") && !validWebhookSecret("s3cret"));
  });
})();
