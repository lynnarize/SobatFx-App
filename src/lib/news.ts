import { XMLParser } from "fast-xml-parser";
import { actualFrom, blsSpec, fetchBls, refPeriod } from "./bls";
import { cached } from "./cache";
import { kv } from "./store";
import { loadHistories, loadPreviews, measureReaction, saveHistory, savePreviews } from "./event-history";
import { INSTRUMENTS } from "./market/symbols";
import { type HistRec, type Outlook, type Reaction, leadTitles, outlookFor, summarizeReactions } from "./outlook";
import { PREVIEW_WINDOW, type Release, matchRelease, parsePreview, parseReleases } from "./releases";
import { releaseTtl } from "./release-window";
import { type UsualEffect, pairDirection, parseValue, surprise, usualEffect } from "./usual-effect";

// Economic calendar: Forex Factory weekly JSON (free, rate-limited → cached 5 min, 2 min around a
// release, last good copy kept on failure). It has no actuals, so those are read from release
// headlines in the RSS feeds (src/lib/releases.ts).
// Headlines: public RSS feeds, tagged with the currencies/assets they likely move.
// Around a Medium/High release (src/lib/release-window.ts) every layer refreshes faster.
// Official actuals (src/lib/bls.ts) outrank headline ones for the events they cover.

export type Impact = "High" | "Medium" | "Low" | "Holiday";

export interface CalendarEvent {
  id: string;
  title: string;
  currency: string;
  time: string; // ISO
  impact: Impact;
  forecast: string;
  previous: string;
  /** Released value, with FF's unit ("4.1%", "120K"), when a release headline gave it. */
  actual?: string;
  /** Where `actual` came from: the official statistics agency, or a release headline. */
  actualSource?: "BLS" | "news";
  /** When an official actual was retrieved (ISO); BLS's terms ask apps to show it. */
  actualAt?: string;
  /** +1 better for the currency than forecast, −1 worse, 0 in line (FF's green/red number). */
  better?: -1 | 0 | 1 | null;
  /** FF's "Usual Effect" for this kind of event (src/lib/usual-effect.ts). */
  effect: UsualEffect;
  /** Pre-release lean (for released events: the lean it had before the release). */
  outlook?: Outlook;
  /** Typical reaction per pair to this event type, from stored past releases. */
  reactions?: Record<string, Reaction>;
}

export interface Headline {
  id: string;
  title: string;
  link: string;
  source: string;
  time: string; // ISO
  tags: string[];
  impact: "High" | "Medium" | "Low";
}

/** Server-side only: the post's body as plain text lines, where data posts list their secondary figures. */
type FeedItem = Headline & { body: string };

const UA = "Mozilla/5.0 (compatible; SobatFX/1.0)";

/** Latest calendar this instance has built; drives the release-aware cache TTLs below. */
let lastCal: CalendarEvent[] | undefined;

function ffCalendar() {
  return cached("calendar", () => releaseTtl(lastCal, 300, 120), async () => {
    const r = await fetch("https://nfs.faireconomy.media/ff_calendar_thisweek.json", { headers: { "user-agent": UA }, cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!r.ok) throw new Error(`calendar ${r.status}`);
    const rows: { title: string; country: string; date: string; impact: Impact; forecast: string; previous: string }[] = await r.json();
    return rows.map((e, i) => ({
      id: `${e.date}-${e.country}-${i}`,
      title: e.title,
      currency: e.country,
      time: new Date(e.date).toISOString(),
      impact: e.impact,
      forecast: e.forecast,
      previous: e.previous,
      effect: usualEffect(e.title),
    })) satisfies CalendarEvent[];
  }, { stale: true });
}

const isNumeric = (e: CalendarEvent) => (e.effect === "higher" || e.effect === "lower") && Boolean(e.forecast || e.previous);

const eventKey = (e: CalendarEvent) => `${e.time}|${e.currency}|${e.title}`;

/** Shows an absolute value the way FF shows this event's values: same unit, at least as many decimals. */
function display(e: CalendarEvent, v: number) {
  const ref = (e.forecast || e.previous).trim();
  const unit = /[%KMBT]$/i.exec(ref)?.[0] ?? "";
  const n = v / (parseValue(`1${unit}`) ?? 1);
  const dec = Math.min(4, Math.max(/\.(\d+)/.exec(ref)?.[1].length ?? 0, /\.(\d+)/.exec(String(+n.toFixed(4)))?.[1].length ?? 0));
  return `${n.toFixed(dec)}${unit}`;
}

/**
 * Actuals read from release headlines ("JOLTS job openings 7.079M vs 7.225M estimate") in the RSS
 * feeds — free, and usually posted within minutes. Matches are kept in the store for the week,
 * because headlines roll out of the feeds after a few hours.
 */
async function headlineActuals(cal: CalendarEvent[], heads: FeedItem[]) {
  const stored = (await kv.get<Record<string, number>>("actuals:rss")) ?? {};
  const open = cal.filter((e) => !(eventKey(e) in stored) && isNumeric(e) && Date.parse(e.time) <= Date.now());
  if (!open.length) return stored;
  // Strongest evidence first, so a weaker line can't claim an event a headline states outright.
  const rank = (r: Release) => (r.expected != null ? (r.fromBody ? 1 : 0) : r.prior != null ? 2 : 3);
  const found = heads.flatMap((h) => parseReleases(h.title, h.body).map((r) => ({ r, time: h.time })));
  found.sort((a, b) => rank(a.r) - rank(b.r));
  let added = 0;
  for (const { r, time } of found) {
    const e = matchRelease(r, time, open);
    if (!e || eventKey(e) in stored) continue;
    stored[eventKey(e)] = r.actual;
    added++;
  }
  if (added) await kv.set("actuals:rss", stored, { ex: 8 * 86_400 });
  return stored;
}

interface Official {
  v: number;
  src: "BLS";
  /** Data period, e.g. "2026-09" or "2026-Q3". */
  month: string;
  at: string;
}

/**
 * Official actuals for released events BLS covers, kept for the week. BLS is only asked while such
 * an event is released but not yet filled: every 15 s for its first 15 minutes (60 s without an API
 * key, which allows far fewer calls a day), every 5 min for 2 h, then every 30 min for 3 days.
 */
async function officialActuals(cal: CalendarEvent[]) {
  const stored = (await kv.get<Record<string, Official>>("actuals:official")) ?? {};
  const now = Date.now();
  const pending = cal.flatMap((e) => {
    const spec = blsSpec(e.currency, e.title);
    const age = now - Date.parse(e.time);
    if (!spec || eventKey(e) in stored || age < 0 || age > 3 * 86_400_000) return [];
    const month = refPeriod(e.time, spec);
    return month ? [{ e, spec, month, age }] : [];
  });
  if (!pending.length) return stored;
  const series = [...new Set(pending.map((p) => p.spec.series))].sort();
  const fromYear = Math.min(...pending.map((p) => +p.month.slice(0, 4))) - 1; // y/y needs last year
  const youngest = Math.min(...pending.map((p) => p.age));
  const ttl = () => (youngest < 15 * 60_000 ? (process.env.BLS_API_KEY ? 15 : 60) : youngest < 2 * 3_600_000 ? 300 : 1800);
  const obs = await cached(`bls:${series.join(",")}:${fromYear}`, ttl, () => fetchBls(series, fromYear));
  let added = 0;
  for (const { e, spec, month } of pending) {
    const v = obs[spec.series] ? actualFrom(spec, obs[spec.series], month) : null;
    if (v == null) continue;
    stored[eventKey(e)] = { v, src: "BLS", month, at: new Date().toISOString() };
    added++;
  }
  if (added) await kv.set("actuals:official", stored, { ex: 8 * 86_400 });
  return stored;
}

/** Preview figures ("CPI seen at 4.0%") for upcoming events, kept for the week. */
async function headlinePreviews(cal: CalendarEvent[], heads: Headline[]) {
  const stored = await loadPreviews();
  const upcoming = cal.filter((e) => isNumeric(e) && e.forecast && Date.parse(e.time) > Date.now());
  let added = 0;
  // Oldest first, so the newest preview for an event wins.
  for (const h of [...heads].reverse()) {
    const r = parsePreview(h.title);
    const e = r && matchRelease(r, h.time, upcoming, PREVIEW_WINDOW);
    if (!r || !e || stored[eventKey(e)]?.v === r.actual) continue;
    stored[eventKey(e)] = { v: r.actual, text: display(e, r.actual) };
    added++;
  }
  if (added) await savePreviews(stored);
  return stored;
}

const histId = (e: { currency: string; title: string }) => `${e.currency}|${e.title}`;

/**
 * Adds the pre-release lean and typical price reactions, and keeps the release history up to date:
 * every released event with an actual gets a history record (with the lean it had), and reactions
 * are measured once an hour has passed.
 */
async function withOutlook(cal: CalendarEvent[], previews: Record<string, { v: number; text: string }>) {
  const numeric = cal.filter(isNumeric);
  const hist = await loadHistories(numeric.flatMap((e) => [histId(e), ...leadTitles(e.title, e.currency).map((t) => `${e.currency}|${t}`)]));
  const lookup = (cur: string) => (title: string) => hist.get(`${cur}|${title}`) ?? [];
  const now = Date.now();
  const outlookOf = (e: CalendarEvent) => {
    const p = previews[eventKey(e)];
    return outlookFor(e, cal, lookup(e.currency), p && { value: p.v, text: p.text }, parseValue(e.forecast));
  };

  // Record releases (and the lean they had before release) into the history.
  const dirty = new Set<string>();
  for (const e of numeric) {
    const v = e.actual != null ? parseValue(e.actual) : null;
    if (v == null) continue;
    const t = Date.parse(e.time);
    const recs = hist.get(histId(e)) ?? [];
    if (recs.some((r) => r.t === t)) continue;
    const rec: HistRec = { t, actual: v, forecast: parseValue(e.forecast), better: e.better ?? null, lean: outlookOf(e).lean };
    hist.set(histId(e), [rec, ...recs]);
    dirty.add(histId(e));
  }
  // Price reactions: once, 65 min – 36 h after the release (a couple per call to keep requests quick).
  let measured = 0;
  for (const e of numeric) {
    const t = Date.parse(e.time);
    if (measured >= 2 || now - t < 65 * 60_000 || now - t > 36 * 3_600_000) continue;
    const rec = hist.get(histId(e))?.find((r) => r.t === t);
    if (!rec || rec.reactAt) continue;
    rec.react = await measureReaction(e.currency, t).catch(() => ({}));
    rec.reactAt = now;
    dirty.add(histId(e));
    measured++;
  }
  await Promise.all([...dirty].map((k) => saveHistory(k, hist.get(k)!)));

  return cal.map((e): CalendarEvent => {
    if (!isNumeric(e)) return e;
    const recs = hist.get(histId(e)) ?? [];
    const reactions: Record<string, Reaction> = {};
    for (const inst of INSTRUMENTS) {
      if (!pairDirection(e.currency, inst)) continue;
      const r = summarizeReactions(recs.filter((x) => x.t !== Date.parse(e.time)), inst.id, e.currency, inst);
      if (r) reactions[inst.id] = r;
    }
    return { ...e, outlook: outlookOf(e), reactions: Object.keys(reactions).length ? reactions : undefined };
  });
}

/** FF calendar with released actuals read from headlines, pre-release leans and typical reactions. */
export function getCalendar() {
  // 2 min (15 s around a release): each run costs a few Redis commands.
  return cached("calendar+actuals", () => releaseTtl(lastCal, 120, 15), async () => {
    const ff = await ffCalendar();
    const heads = await feedItems().catch(() => [] as FeedItem[]);
    const warn = (what: string) => (e: unknown) => (console.warn(`[news] ${what}`, (e as Error).message), {});
    const [official, fromHeads, previews] = await Promise.all([
      officialActuals(ff).catch(warn("official actuals")) as Promise<Record<string, Official>>,
      headlineActuals(ff, heads).catch(warn("headline actuals")) as Promise<Record<string, number>>,
      headlinePreviews(ff, heads).catch(warn("previews")) as Promise<Record<string, { v: number; text: string }>>,
    ]);
    const cal = ff.map((e): CalendarEvent => {
      const off = official[eventKey(e)];
      const v = off?.v ?? fromHeads[eventKey(e)];
      if (v == null) return e;
      return {
        ...e,
        actual: display(e, v),
        actualSource: off ? off.src : "news",
        ...(off && { actualAt: off.at }),
        better: surprise(e.title, v, parseValue(e.forecast) ?? undefined, parseValue(e.previous) ?? undefined),
      };
    });
    lastCal = await withOutlook(cal, previews).catch((e) => (console.warn("[news] outlook", (e as Error).message), cal));
    return lastCal;
  });
}

const FEEDS = [
  { source: "InvestingLive", url: "https://investinglive.com/feed/news" },
  { source: "FXStreet", url: "https://www.fxstreet.com/rss/news" },
  { source: "Investing.com", url: "https://www.investing.com/rss/news_1.rss" },
  { source: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/" },
  { source: "Cointelegraph", url: "https://cointelegraph.com/rss" },
];

const TAGS: [string, RegExp][] = [
  ["USD", /\b(usd|dollar|fed|fomc|powell|treasur|nfp|non-?farm|payrolls|us cpi|us pce|jobless|ism|u\.s\.|america|dxy|warsh)/i],
  ["EUR", /\b(eur|euro|ecb|lagarde|eurozone|german|bund|france|italy)/i],
  ["GBP", /\b(gbp|pound|sterling|boe|bank of england|bailey|uk\b|britain|gilt)/i],
  ["JPY", /\b(jpy|yen|boj|bank of japan|ueda|japan|jgb)/i],
  ["AUD", /\b(aud|aussie|rba|australia)/i],
  ["CAD", /\b(cad|loonie|boc|bank of canada|canada|oil|crude|wti)/i],
  ["CHF", /\b(chf|franc|snb|swiss)/i],
  ["NZD", /\b(nzd|kiwi|rbnz|new zealand)/i],
  ["XAU", /\b(gold|xau|bullion|precious metal|safe[- ]haven)/i],
  ["BTC", /\b(bitcoin|btc|crypto|etf flows?|stablecoin|sec\b)/i],
  ["ETH", /\b(ether|eth\b|ethereum)/i],
];
const HIGH = /\b(fomc|rate decision|rate cut|rate hike|nfp|non-?farm|cpi|inflation|pce|gdp|war|sanction|tariff|emergency|intervention|default|halving|etf approv|crash|surge|plunge)/i;
const MED = /\b(pmi|retail sales|jobless|unemployment|minutes|speech|speaks|testimony|yields?|ppi|housing|sentiment)/i;

function tagText(t: string) {
  const tags = TAGS.filter(([, re]) => re.test(t)).map(([k]) => k);
  return { tags, impact: (HIGH.test(t) ? "High" : MED.test(t) ? "Medium" : "Low") as Headline["impact"] };
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** RSS description HTML → plain text, one line per paragraph / list item. */
function bodyText(html: string) {
  return html
    .replace(/<\s*(?:br|\/?p|\/?li|\/?div|\/?h\d)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (m, e: string) =>
      e[0] !== "#" ? (ENTITIES[e.toLowerCase()] ?? m) : String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : +e.slice(1)),
    )
    .slice(0, 4000);
}

async function feed(source: string, url: string): Promise<FeedItem[]> {
  const r = await fetch(url, { headers: { "user-agent": UA }, cache: "no-store", signal: AbortSignal.timeout(8_000) });
  if (!r.ok) throw new Error(`${source} ${r.status}`);
  const xml = await r.text();
  const doc = new XMLParser({ ignoreAttributes: true }).parse(xml);
  const items = [doc.rss?.channel?.item ?? []].flat() as Record<string, unknown>[];
  return items
    .slice(0, 30)
    .filter((it) => /^https?:\/\//i.test(String(it.link ?? "").trim())) // feed content is untrusted: web links only, never javascript:
    .map((it) => {
      const title = String(it.title ?? "").replace(/<[^>]+>/g, "").trim();
      const link = String(it.link).trim();
      const time = new Date(String(it.pubDate ?? it["dc:date"] ?? Date.now())).toISOString();
      const body = typeof it.description === "string" ? bodyText(it.description) : "";
      return { id: link, title, link, source, time, body, ...tagText(title + " " + body.slice(0, 300)) };
    });
}

/** Headlines as sent to clients and the AI prompt (no bodies). */
export async function getHeadlines(): Promise<Headline[]> {
  return (await feedItems()).map(({ id, title, link, source, time, tags, impact }) => ({ id, title, link, source, time, tags, impact }));
}

function feedItems() {
  return cached("headlines", () => releaseTtl(lastCal, 300, 30), async () => {
    const all = await Promise.allSettled(FEEDS.map((f) => feed(f.source, f.url)));
    const seen = new Set<string>();
    return all
      .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
      .filter((h) => h.title && !seen.has(h.title.toLowerCase()) && seen.add(h.title.toLowerCase()))
      .sort((a, b) => b.time.localeCompare(a.time))
      .slice(0, 120);
  });
}

const EFFECT: Record<Exclude<UsualEffect, null>, string> = {
  higher: "higher than forecast",
  lower: "lower than forecast",
  hawkish: "more hawkish than expected",
};

/** Usual effect + what it means for the instrument, and the verdict once released. */
function effectNote(e: CalendarEvent, inst?: DigestInstrument) {
  if (!e.effect) return "";
  const dir = inst ? pairDirection(e.currency, inst) : 0;
  const move = (sign: number) => (sign > 0 ? "up" : "down");
  const lines = [` | usual effect: ${EFFECT[e.effect]} = good for ${e.currency}${dir ? ` (→ ${inst!.label} ${move(dir)})` : ""}`];
  if (Date.parse(e.time) < Date.now()) {
    if (e.actual == null) lines.push(e.effect === "hawkish" ? " [released: judge the tone from headlines]" : " [released: actual not in feed — judge from headlines and the price reaction]");
    else if (e.better == null) lines.push(` [actual ${e.actual}]`);
    else if (e.better === 0) lines.push(` [actual ${e.actual}: in line with forecast — little surprise]`);
    else lines.push(` [actual ${e.actual}: ${e.better > 0 ? "BETTER" : "WORSE"} than forecast = ${e.currency}-${e.better > 0 ? "positive" : "negative"}${dir ? ` → ${inst!.label} ${move(dir * e.better)}ish` : ""}]`);
  }
  return lines.join("") + outlookNote(e, inst);
}

const LEAN = (l: number, cur: string) => (l > 0 ? `better than forecast for ${cur}` : l < 0 ? `worse than forecast for ${cur}` : "no clear lean");

/** Pre-release lean with its reasons, and the chart pair's typical reaction to this event type. */
function outlookNote(e: CalendarEvent, inst?: DigestInstrument) {
  const o = e.outlook;
  const parts: string[] = [];
  const released = Date.parse(e.time) < Date.now();
  if (o && !released && o.reasons.length) {
    const why = o.reasons.map((r) =>
      r.kind === "preview" ? `preview headline ${r.value} vs fcst ${r.forecast}`
      : r.kind === "lead" ? `${r.title} came in ${r.better > 0 ? "better" : r.better < 0 ? "worse" : "in line"} (${r.actual})`
      : `beat ${r.beats}/${r.n} of recent releases, missed ${r.misses}`,
    );
    parts.push(` | lean: ${LEAN(o.lean, e.currency)}${o.lean ? ` (${o.confidence} confidence)` : ""} — ${why.join("; ")}${o.record ? `; past leans right ${o.record.hits}/${o.record.n}` : ""}`);
  } else if (o?.lean && e.better) {
    parts.push(` | pre-release lean was ${LEAN(o.lean, e.currency)} → ${o.lean === e.better ? "right" : "wrong"}`);
  }
  const r = inst?.id ? e.reactions?.[inst.id] : undefined;
  if (r) parts.push(` | typical ${inst!.label} move after past releases: ±${r.avgH1} pips in 1h (±${r.avgM15} in 15m, ${r.n} releases${r.surprised ? `, moved the usual way ${r.usual}/${r.surprised} times` : ""})`);
  return parts.join("");
}

type DigestInstrument = { id?: string; label: string; base: string; quote: string };

/** Compact text digest the AI gets with every request. `inst` adds what each event means for that chart. */
export async function newsDigest(keys: string[], inst?: DigestInstrument) {
  const [cal, heads] = await Promise.all([getCalendar().catch(() => []), getHeadlines().catch(() => [])]);
  const now = Date.now();
  const events = cal
    .filter((e) => (e.impact === "High" || e.impact === "Medium") && keys.includes(e.currency))
    .filter((e) => {
      const t = Date.parse(e.time);
      return t > now - 24 * 3600_000 && t < now + 72 * 3600_000;
    })
    .slice(0, 20)
    .map((e) => `- ${e.time.slice(0, 16).replace("T", " ")} UTC | ${e.currency} | ${e.impact} | ${e.title}${e.forecast ? ` (fcst ${e.forecast}, prev ${e.previous})` : ""}${e.effect ? effectNote(e, inst) : Date.parse(e.time) < now ? " [released]" : ""}`);
  const news = heads
    .filter((h) => h.tags.some((t) => keys.includes(t)) && Date.parse(h.time) > now - 36 * 3600_000)
    .slice(0, 15)
    .map((h) => `- ${h.time.slice(0, 16).replace("T", " ")} UTC | ${h.source} | ${h.impact} | ${h.title}`);
  return [
    `Current time: ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC (WIB = UTC+7)`,
    `Economic calendar (Medium/High impact, ${keys.join("/")}, last 24h → next 72h):`,
    events.length ? events.join("\n") : "- none found",
    `Recent headlines tagged ${keys.join("/")}:`,
    news.length ? news.join("\n") : "- none found",
  ].join("\n");
}
