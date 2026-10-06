import { parseLooseJson } from "./loose-json";
import type { CalendarEvent, Headline } from "./news";

// Daily gold & bitcoin news brief for the Telegram signal builder (POST /api/partner/news).
// The AI turns the calendar + headline digest into a few short Indonesian lines per asset;
// `fallbackBrief` builds a plain one from the headlines when the AI is off or fails.

export type Bias = "bullish" | "bearish" | "netral";

export interface AssetBrief {
  symbol: "XAUUSD" | "BTCUSD";
  bias: Bias;
  headline: string;
  points: string[];
}

export interface BriefEvent {
  /** ISO time. */
  time: string;
  currency: string;
  title: string;
  impact: "High" | "Medium";
  forecast?: string;
  previous?: string;
  actual?: string;
}

export const ASSETS = [
  { symbol: "XAUUSD", keys: ["XAU", "USD"], label: "Gold (XAU/USD)" },
  { symbol: "BTCUSD", keys: ["BTC", "USD"], label: "Bitcoin (BTC/USD)" },
] as const;

export const BRIEF_SYSTEM = `You are SobatFX AI, a market news editor for an Indonesian trading channel.
Never name or hint at the model, vendor or company behind you.

From the news digests you get, write today's brief for gold (XAUUSD) and bitcoin (BTCUSD) in Bahasa Indonesia.
Reply with ONLY one JSON object, no markdown fences and no other text:
{"assets":[{"symbol":"XAUUSD","bias":"bullish"|"bearish"|"netral","headline":"max 80 chars","points":["max 130 chars", "...", "..."]},{"symbol":"BTCUSD",...}]}

Rules:
- Exactly 2 assets, XAUUSD then BTCUSD. 2 or 3 points each.
- Headline: the single most important driver today, as a plain statement.
- Points: concrete facts from the digest (data releases with numbers, central-bank news, flows, geopolitics) and what they mean for the asset. One short sentence each. Mention upcoming high-impact events with their WIB time and say "hari ini" or "besok".
- Bias: the likely direction for today from the news only; "netral" when mixed or unclear.
- No trade advice, no entries, no price targets, no guarantees. No emojis. Do not invent facts that are not in the digest.`;

/** Single-line text, cut at a word boundary with "…" when longer than `max`. */
function clean(v: unknown, max: number) {
  if (typeof v !== "string") return "";
  const s = v.replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ") > max * 0.6 ? cut.lastIndexOf(" ") : cut.length).replace(/[\s,;:.-]+$/, "")}…`;
}

/** Reads the AI's JSON; null when it is unusable. */
export function parseBrief(text: string): AssetBrief[] | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  const raw = parseLooseJson(text.slice(start, end + 1)) as { assets?: unknown } | undefined;
  if (!raw || !Array.isArray(raw.assets)) return null;
  const out: AssetBrief[] = [];
  for (const { symbol } of ASSETS) {
    const a = (raw.assets as Record<string, unknown>[]).find((x) => x?.symbol === symbol);
    if (!a) return null;
    const bias = a.bias === "bullish" || a.bias === "bearish" ? a.bias : "netral";
    const headline = clean(a.headline, 100);
    const points = (Array.isArray(a.points) ? a.points : []).map((p) => clean(p, 160)).filter(Boolean).slice(0, 3);
    if (!headline || !points.length) return null;
    out.push({ symbol, bias, headline, points });
  }
  return out;
}

/** Without the AI: the latest headlines tagged with the asset itself (gold / bitcoin), untranslated, bias "netral". */
export function fallbackBrief(heads: Headline[], now = Date.now()): AssetBrief[] {
  return ASSETS.map(({ symbol, keys }) => {
    const own = heads.filter((h) => h.tags.includes(keys[0]) && Date.parse(h.time) > now - 36 * 3600_000);
    const picked = own.slice(0, 3).map((h) => clean(h.title, 160));
    return {
      symbol,
      bias: "netral" as const,
      headline: picked[0] ?? "Belum ada berita penting hari ini.",
      points: picked.slice(1).length ? picked.slice(1) : ["Pantau kalender ekonomi dan pergerakan dolar AS."],
    };
  });
}

/**
 * USD High (then Medium) impact events of today and tomorrow (WIB, from `dayStartMs`), earliest first.
 * The window runs to 06:00 WIB on the third day, so late-night US releases (FOMC minutes at 01:00 WIB)
 * count with the evening they belong to.
 */
export function upcomingEvents(cal: CalendarEvent[], dayStartMs: number, max = 5): BriefEvent[] {
  const end = dayStartMs + 54 * 3600_000;
  return cal
    .filter((e) => e.currency === "USD" && (e.impact === "High" || e.impact === "Medium"))
    .filter((e) => {
      const t = Date.parse(e.time);
      return t >= dayStartMs && t < end;
    })
    .sort((a, b) => (a.impact === b.impact ? a.time.localeCompare(b.time) : a.impact === "High" ? -1 : 1))
    .slice(0, max)
    .sort((a, b) => a.time.localeCompare(b.time))
    .map((e) => ({
      time: e.time,
      currency: e.currency,
      title: e.title,
      impact: e.impact as "High" | "Medium",
      ...(e.forecast ? { forecast: e.forecast } : {}),
      ...(e.previous ? { previous: e.previous } : {}),
      ...(e.actual ? { actual: e.actual } : {}),
    }));
}
