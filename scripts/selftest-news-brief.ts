/** Offline checks for the partner news brief:  npx tsx scripts/selftest-news-brief.ts */
import assert from "node:assert/strict";
import { fallbackBrief, parseBrief, upcomingEvents } from "../src/lib/news-brief";
import type { CalendarEvent, Headline } from "../src/lib/news";

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

const reply = `Here is the brief:
{"assets":[
  {"symbol":"XAUUSD","bias":"bearish","headline":"Dolar menguat jelang Minutes FOMC","points":["ISM Services 54.9 vs 55.2.","${"Imbal hasil naik ".repeat(15)}"]},
  {"symbol":"BTCUSD","bias":"sideways","headline":"Bitcoin tertahan di $87.000","points":["Aturan pelaporan crypto dicabut."]}
]}`;

test("parseBrief reads both assets, normalises bias and shortens long points at a word", () => {
  const b = parseBrief(reply)!;
  assert.deepEqual(b.map((a) => [a.symbol, a.bias]), [["XAUUSD", "bearish"], ["BTCUSD", "netral"]]);
  const long = b[0].points[1];
  assert.ok(long.length <= 160 && long.endsWith("…") && !long.endsWith(" …"), long);
});

test("parseBrief rejects replies missing an asset or without points", () => {
  assert.equal(parseBrief('{"assets":[{"symbol":"XAUUSD","bias":"bullish","headline":"x","points":["y"]}]}'), null);
  assert.equal(parseBrief('{"assets":[{"symbol":"XAUUSD","headline":"x","points":[]},{"symbol":"BTCUSD","headline":"x","points":["y"]}]}'), null);
  assert.equal(parseBrief("Maaf, tidak bisa."), null);
});

const now = Date.parse("2026-10-06T05:00:00Z"); // 12:00 WIB
const h = (title: string, tags: string[], hoursAgo = 1): Headline => ({ id: title, title, link: "", source: "x", time: new Date(now - hoursAgo * 3600e3).toISOString(), tags, impact: "High" });

test("fallbackBrief uses only the asset's own headlines", () => {
  const b = fallbackBrief([h("Gold hits record", ["XAU"]), h("Brazil real gains", ["USD"]), h("Bitcoin rejected at 87k", ["BTC", "USD"]), h("Old gold story", ["XAU"], 48)], now);
  assert.equal(b[0].headline, "Gold hits record");
  assert.deepEqual(b[0].points, ["Pantau kalender ekonomi dan pergerakan dolar AS."]);
  assert.equal(b[1].headline, "Bitcoin rejected at 87k");
});

const ev = (title: string, iso: string, impact: CalendarEvent["impact"], currency = "USD") =>
  ({ id: title, title, currency, time: iso, impact, forecast: "", previous: "", effect: null }) as CalendarEvent;

test("upcomingEvents: USD High/Medium for today and tomorrow (WIB), earliest first", () => {
  const dayStart = Date.parse("2026-10-06T00:00:00Z") - 7 * 3600e3;
  const cal = [
    ev("Yesterday CPI", "2026-10-05T12:30:00Z", "High"),
    ev("Waller Speaks", "2026-10-06T08:30:00Z", "Medium"),
    ev("FOMC Minutes", "2026-10-07T18:00:00Z", "High"),
    ev("ECB Speech", "2026-10-06T09:00:00Z", "High", "EUR"),
    ev("Low thing", "2026-10-06T10:00:00Z", "Low"),
    ev("Day after tomorrow NFP", "2026-10-08T12:30:00Z", "High"),
  ];
  assert.deepEqual(upcomingEvents(cal, dayStart).map((e) => e.title), ["Waller Speaks", "FOMC Minutes"]);
});

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
