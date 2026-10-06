import { consumeGlobalCap, hit, refundGlobalCap } from "@/lib/guard";
import { envNum, partnerGate } from "@/lib/partner";
import { ProviderError, streamForTier } from "@/lib/ai/providers";
import { scrub } from "@/lib/ai/sanitize";
import { ASSETS, BRIEF_SYSTEM, fallbackBrief, parseBrief, upcomingEvents, type AssetBrief } from "@/lib/news-brief";
import { getCalendar, getHeadlines, newsDigest } from "@/lib/news";
import { getInstrument } from "@/lib/market/symbols";
import { kv } from "@/lib/store";
import type { Tier } from "@/lib/tiers";

// Server-to-server: today's gold & bitcoin news brief for the Telegram signal builder ("Sapaan" tab).
//
//   POST /api/partner/news
//   Authorization: Bearer <one of PARTNER_API_KEYS>
//
// Returns { date, source: "ai" | "auto", assets: [{ symbol, bias, headline, points[] }], events: [...] }.
// Cached for 15 minutes in Redis, so repeated taps cost one AI call. Uses PARTNER_AI_TIER and
// PARTNER_DAILY_LIMIT like /api/partner/levels.

export const maxDuration = 60;

const CACHE_SEC = 15 * 60;
/** Per AI attempt; the function as a whole has 60 s (maxDuration). */
const AI_TIMEOUT_MS = 25_000;
/** A retry only starts while at least this much of the 60 s is left. */
const RETRY_IF_LEFT_MS = 28_000;
const WIB_MS = 7 * 3600_000;

interface Brief {
  date: string;
  generatedAt: string;
  source: "ai" | "auto";
  assets: AssetBrief[];
  /** Today and tomorrow (WIB). */
  events: ReturnType<typeof upcomingEvents>;
}

function aiTier(): Tier | null {
  const t = process.env.PARTNER_AI_TIER || "pro";
  return t === "free" || t === "pro" || t === "ultimate" ? t : null;
}

async function askAi(tier: Tier, prompt: string) {
  let text = "";
  await streamForTier(tier, {
    system: BRIEF_SYSTEM,
    turns: [{ role: "user", text: prompt }],
    signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    onText: (t) => (text += t),
  });
  return text;
}

export async function POST(req: Request) {
  const gate = await partnerGate(req, "partner-news");
  if ("error" in gate) return gate.error;

  const now = Date.now();
  const date = new Date(now + WIB_MS).toISOString().slice(0, 10);
  const bucket = Math.floor(now / (CACHE_SEC * 1000));
  const cacheKey = `partner:news:${date}:${bucket}`;
  const cachedBrief = await kv.get<Brief>(cacheKey).catch(() => null);
  if (cachedBrief) return Response.json(cachedBrief, { headers: { "Cache-Control": "no-store" } });

  // One source being down (e.g. the calendar rate-limiting) still leaves a usable brief.
  const [calR, headsR] = await Promise.allSettled([getCalendar(), getHeadlines()]);
  if (calR.status === "rejected") console.warn("[partner/news] calendar", (calR.reason as Error).message);
  if (headsR.status === "rejected") console.warn("[partner/news] headlines", (headsR.reason as Error).message);
  if (calR.status === "rejected" && headsR.status === "rejected") return Response.json({ error: "news unavailable" }, { status: 502 });
  const cal = calR.status === "fulfilled" ? calR.value : [];
  const heads = headsR.status === "fulfilled" ? headsR.value : [];
  const dayStart = Date.parse(`${date}T00:00:00Z`) - WIB_MS;
  const events = upcomingEvents(cal, dayStart);

  let assets: AssetBrief[] = fallbackBrief(heads, now);
  let source: Brief["source"] = "auto";

  const tier = aiTier();
  const daily = tier ? await hit(`partner-day:${gate.key}`, envNum(process.env.PARTNER_DAILY_LIMIT, 200), 86_400) : null;
  if (tier && daily?.ok && (await consumeGlobalCap())) {
    try {
      const digests = await Promise.all(
        ASSETS.map(async (a) => {
          const inst = getInstrument(a.symbol)!;
          return `### ${a.label}\n${await newsDigest([...a.keys], inst)}`;
        }),
      );
      const prompt = `Today in WIB: ${date}. Write the brief for today.\n\n${digests.join("\n\n")}`;
      // Models occasionally answer off-format; one retry is cheaper than a headline-only fallback.
      let parsed = parseBrief(scrub(await askAi(tier, prompt)));
      if (!parsed && Date.now() - now < 60_000 - RETRY_IF_LEFT_MS) parsed = parseBrief(scrub(await askAi(tier, `${prompt}\n\nReply with ONLY the JSON object described in your instructions.`)));
      if (parsed) {
        assets = parsed;
        source = "ai";
      } else console.warn("[partner/news] AI reply had no usable brief");
    } catch (e) {
      await refundGlobalCap();
      console.error("[partner/news] AI failed", e instanceof ProviderError ? e.code : (e as Error).message);
    }
  }

  const brief: Brief = { date, generatedAt: new Date(now).toISOString(), source, assets, events };
  // Only an AI brief is worth keeping: a fallback should be retried on the next tap.
  if (source === "ai") await kv.set(cacheKey, brief, { ex: CACHE_SEC + 60 }).catch(() => {});
  return Response.json(brief, { headers: { "Cache-Control": "no-store" } });
}
