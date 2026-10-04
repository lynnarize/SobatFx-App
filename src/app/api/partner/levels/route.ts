import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { consumeGlobalCap, hit, readJson, refundGlobalCap } from "@/lib/guard";
import { ProviderError, streamForTier } from "@/lib/ai/providers";
import { scrub } from "@/lib/ai/sanitize";
import { LEVELS_SYSTEM, autoLevels, levelsPrompt, parseAiLevels, type Level } from "@/lib/levels";
import { getCandles } from "@/lib/market/data";
import { getInstrument, type Interval } from "@/lib/market/symbols";
import type { Tier } from "@/lib/tiers";

// Server-to-server endpoint for the SobatFX Telegram signal builder (Mini-Signal-SobatFX).
// Returns recent candles plus AI-marked support/resistance, so the caller can draw the chart itself.
//
//   POST /api/partner/levels
//   Authorization: Bearer <one of PARTNER_API_KEYS>
//   { "symbol": "XAUUSD", "interval": "1h", "side": "BUY", "entryLow": 4139, "entryHigh": 4143, "sl": 4133 }
//
// Env: PARTNER_API_KEYS (comma-separated; unset = endpoint off), PARTNER_AI_TIER (free|pro|ultimate|off, default pro),
//      PARTNER_PER_MIN (default 10), PARTNER_DAILY_LIMIT (AI calls per key per day, default 200).

export const maxDuration = 60;

const AI_TIMEOUT_MS = 40_000;
/** Candles the levels are read from (and validated against). */
const WINDOW = 200;
/** Candles returned for the chart. */
const CANDLES_OUT = 120;

const Body = z.object({
  symbol: z.string().max(20),
  interval: z.enum(["15m", "1h", "4h", "1d"]).default("1h"),
  side: z.enum(["BUY", "SELL"]).optional(),
  entryLow: z.number().positive().finite().optional(),
  entryHigh: z.number().positive().finite().optional(),
  sl: z.number().positive().finite().optional(),
});

const num = (v: string | undefined, d: number) => (v && Number.isFinite(+v) ? +v : d);

/** The caller's key, or null. Compared in constant time against every configured key. */
function partnerKey(req: Request) {
  const keys = (process.env.PARTNER_API_KEYS || "").split(",").map((s) => s.trim()).filter((s) => s.length >= 24);
  const given = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") ?? "")?.[1]?.trim();
  if (!keys.length || !given) return null;
  const g = createHash("sha256").update(given).digest();
  const match = keys.find((k) => timingSafeEqual(createHash("sha256").update(k).digest(), g));
  return match ? createHash("sha256").update(match).digest("hex").slice(0, 16) : null;
}

function aiTier(): Tier | null {
  const t = process.env.PARTNER_AI_TIER || "pro";
  return t === "free" || t === "pro" || t === "ultimate" ? t : null;
}

async function askAi(tier: Tier, prompt: string) {
  let text = "";
  await streamForTier(tier, {
    system: LEVELS_SYSTEM,
    turns: [{ role: "user", text: prompt }],
    signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    onText: (t) => (text += t),
  });
  return text;
}

export async function POST(req: Request) {
  if (!process.env.PARTNER_API_KEYS) return Response.json({ error: "not found" }, { status: 404 });
  const key = partnerKey(req);
  if (!key) return Response.json({ error: "unauthorized" }, { status: 401 });

  const burst = await hit(`partner:${key}`, num(process.env.PARTNER_PER_MIN, 10), 60);
  if (!burst.ok) return Response.json({ error: "rate limited" }, { status: 429, headers: { "Retry-After": String(burst.retryAfter) } });

  const raw = await readJson(req, 4096);
  if (!raw.ok) return Response.json({ error: "invalid body" }, { status: raw.status });
  const parsed = Body.safeParse(raw.data);
  if (!parsed.success) return Response.json({ error: "invalid body" }, { status: 400 });
  const { symbol, interval, ...signal } = parsed.data;

  const inst = getInstrument(symbol);
  if (!inst) return Response.json({ error: "unsupported symbol", code: "symbol" }, { status: 422 });

  let candles;
  try {
    // The forming candle is dropped: its high/low are not final.
    candles = (await getCandles(inst.id, interval as Interval)).candles.slice(0, -1);
  } catch (e) {
    console.error("[partner/levels] market data", (e as Error).message);
    return Response.json({ error: "market data unavailable" }, { status: 502 });
  }
  if (candles.length < 30) return Response.json({ error: "not enough market data" }, { status: 502 });

  const recent = candles.slice(-WINDOW);
  const hints = autoLevels(recent);
  let levels: Level[] = hints;
  let note: string | undefined;
  let source: "ai" | "auto" = "auto";

  const tier = aiTier();
  const daily = tier ? await hit(`partner-day:${key}`, num(process.env.PARTNER_DAILY_LIMIT, 200), 86_400) : null;
  if (tier && daily?.ok && (await consumeGlobalCap())) {
    try {
      const text = await askAi(tier, levelsPrompt({ symbol: inst.id, interval, digits: inst.digits, candles: recent, hints, signal }));
      const ai = parseAiLevels(scrub(text), recent);
      if (ai) {
        levels = ai.levels;
        note = ai.note;
        source = "ai";
      } else console.warn("[partner/levels] AI reply had no usable levels");
    } catch (e) {
      await refundGlobalCap();
      console.error("[partner/levels] AI failed", e instanceof ProviderError ? e.code : (e as Error).message);
    }
  }

  const d = inst.digits;
  return Response.json(
    {
      symbol: inst.id,
      interval,
      digits: d,
      lastPrice: candles.at(-1)!.close,
      candles: candles.slice(-CANDLES_OUT).map((c) => [c.time, c.open, c.high, c.low, c.close]),
      levels: levels.map((l) => ({ ...l, price: Number(l.price.toFixed(d)) })),
      note,
      source,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
