import { createHash } from "node:crypto";
import { z } from "zod";
import { currentEmail, demoMode, resolveTier } from "@/lib/auth";
import { AI_IP_PER_MIN, AI_USER_PER_MIN, acquireSlot, consumeGlobalCap, guard, limitUser, readJson, refundGlobalCap } from "@/lib/guard";
import { serverT } from "@/lib/i18n-server";
import { TIER_INFO } from "@/lib/tiers";
import { contextBlock, systemPrompt, type ChatContext } from "@/lib/ai/prompt";
import { ProviderError, streamForTier, type ChatTurn } from "@/lib/ai/providers";
import { scrub as scrubbed, streamScrubber } from "@/lib/ai/sanitize";
import { mtfBlock } from "@/lib/ai/mtf";
import { recordPlans, trackRecord } from "@/lib/ai/track";
import { getInstrument, newsKeys } from "@/lib/market/symbols";
import { newsDigest } from "@/lib/news";
import { consumeDemoCap, consumeUsage, refundDemoCap, refundUsage } from "@/lib/users";

export const maxDuration = 300;

const num = z.number().nullable();
/** Page context the client sends with each question. Validated so a malformed body is a 400, never a crash. */
const Context = z.object({
  symbol: z.string().max(20),
  symbolName: z.string().max(80),
  interval: z.string().max(10),
  source: z.string().max(80).optional(),
  sourceNote: z.string().max(300).optional(),
  lastPrice: z.number().nullish().transform((v) => v ?? undefined),
  candles: z.array(z.tuple([z.number(), num, num, num, num])).max(300).optional(),
  indicators: z.record(z.string().max(30), num).optional(),
  swings: z
    .object({
      highs: z.array(z.object({ time: z.number(), price: z.number() })).max(50),
      lows: z.array(z.object({ time: z.number(), price: z.number() })).max(50),
    })
    .optional(),
  drawings: z.array(z.unknown()).max(60).optional(),
  journal: z
    .object({
      summary: z.string().transform((s) => s.slice(0, 500)),
      trades: z.array(z.string().transform((s) => s.slice(0, 240))).transform((a) => a.slice(-30)),
    })
    .optional(),
  risk: z.object({ balance: z.number(), riskPct: z.number(), currency: z.string().max(8), pipValue: z.number().positive().finite().optional() }).optional(),
  page: z.string().max(30).optional(),
});

const Body = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8000) }))
    .min(1)
    .max(30),
  image: z
    .string()
    .regex(/^data:image\/(jpeg|png|webp);base64,/)
    .max(2_000_000)
    .optional(),
  imageSource: z.enum(["chart", "upload"]).optional(),
  context: Context.optional(),
});

/** True when the reply's tail is one short chunk repeated over and over (a degenerate loop). */
function isLooping(text: string) {
  const tail = text.slice(-400);
  for (let p = 2; p <= 40; p++) {
    const unit = tail.slice(-p);
    if (!unit.trim()) continue;
    let reps = 1;
    while (reps * p + p <= tail.length && tail.slice(-(reps + 1) * p, -reps * p) === unit) reps++;
    if (reps >= 8 && reps * p >= 120) return true;
  }
  return false;
}

/** Marker the client looks for to show an error bubble instead of text. */
const ERR = "\u0000ERR:";
/** Sent after a complete reply — if the client never sees it, the response was cut off (e.g. a host timeout). */
const END = "\u0000END";

/** Does this reply talk about price levels near the current price (so it should come with chart drawings)? */
function mentionsLevels(text: string, last?: number) {
  if (!last) return false;
  const nums = (text.match(/\d[\d.,]*\d/g) ?? []).map((s) => Number(s.replace(/[.,](?=\d{3}\b)/g, "").replace(",", ".")));
  return nums.filter((n) => Math.abs(n - last) / last < 0.15).length >= 2;
}

/** The biggest legitimate body is a 2 MB chart image plus 300 candles of context. */
const MAX_BODY = 3_000_000;

export async function POST(req: Request) {
  // Layers 1–3: same origin, BotID, per-IP rate limit (src/lib/guard.ts).
  const blocked = await guard(req, { bucket: "ai", limit: AI_IP_PER_MIN(), strict: true });
  if (blocked) return blocked;

  const { lang, t } = await serverT();
  const email = await currentEmail();
  if (!email) return Response.json({ error: t("srv.signInAi") }, { status: 401 });

  // Layers 4–5: per-user burst limit, and only one reply being generated per user at a time.
  const burst = await limitUser("ai", email, AI_USER_PER_MIN());
  if (burst) return burst;
  const release = await acquireSlot(email);
  if (!release) return Response.json({ error: t("srv.inFlight") }, { status: 429 });

  // The slot is handed to the stream, which frees it when the reply ends. Any earlier exit frees it here.
  let handedOff = false;
  try {
    return await answer(req, email, lang, t, () => {
      handedOff = true;
      return release;
    });
  } finally {
    if (!handedOff) await release();
  }
}

type ServerT = Awaited<ReturnType<typeof serverT>>;

async function answer(req: Request, email: string, lang: ServerT["lang"], t: ServerT["t"], handoff: () => () => Promise<void>) {
  const raw0 = await readJson(req, MAX_BODY);
  if (!raw0.ok) return Response.json({ error: t(raw0.status === 413 ? "srv.tooLarge" : "srv.invalid") }, { status: raw0.status });
  const parsed = Body.safeParse(raw0.data);
  if (!parsed.success) return Response.json({ error: t("srv.invalid") }, { status: 400 });
  const { messages } = parsed.data;
  let image = parsed.data.image;
  const ctx: ChatContext | undefined = parsed.data.context;
  if (messages[messages.length - 1].role !== "user") return Response.json({ error: t("srv.invalid") }, { status: 400 });

  const { tier } = await resolveTier(email);
  // The free model is text-only unless configured otherwise; it still gets candles, indicators and drawings.
  if (tier === "free" && process.env.FREE_MODEL_VISION !== "true") image = undefined;
  // Reading and marking up the user's own uploaded screenshots is a Pro feature.
  if (tier === "free" && parsed.data.imageSource === "upload") image = undefined;
  const imageKind = image ? (parsed.data.imageSource === "upload" ? "upload" : "chart") : false;
  // Reviewing the user's own drawings is a Pro feature: Free only sees the AI's own drawings.
  if (tier === "free" && ctx?.drawings) ctx.drawings = (ctx.drawings as { by?: string }[]).filter((d) => d.by === "ai");
  // Demo-trading journal review is Pro/Ultra only.
  if (tier === "free" && ctx) delete ctx.journal;
  // Lot sizing is Pro/Ultra too: without the pip value the context carries no step-by-step lot recipe.
  if (tier === "free" && ctx?.risk) delete ctx.risk.pipValue;
  if (demoMode() && !(await consumeDemoCap())) return Response.json({ error: t("srv.demoCap"), code: "limit" }, { status: 429 });
  // App-wide daily ceiling (AI_GLOBAL_DAILY_CAP), a backstop if many accounts are farmed or leaked.
  if (!(await consumeGlobalCap())) {
    if (demoMode()) await refundDemoCap();
    return Response.json({ error: t("srv.globalCap") }, { status: 503 });
  }
  const usage = await consumeUsage(email, tier);
  if (!usage.ok) {
    if (demoMode()) await refundDemoCap();
    await refundGlobalCap();
    return Response.json(
      { error: t(tier !== "free" ? "srv.dailyLimit" : usage.period === "daily" ? "srv.freeLimitToday" : "srv.freeLimit", { n: usage.limit }), code: "limit" },
      { status: 429 },
    );
  }

  const inst = ctx?.symbol ? getInstrument(ctx.symbol) : undefined;
  const [news, track, mtf] = await Promise.all([
    newsDigest(inst ? newsKeys(inst) : ["USD", "EUR", "XAU", "BTC"], inst).catch(() => "News digest unavailable."),
    // Free gets no trade plans, so it doesn't see past entries/SL/TP either.
    inst && tier !== "free" ? trackRecord(inst.id) : "",
    // Higher-timeframe view (Pro: 2 frames above the chart's, Ultra: 3). Not for an uploaded picture, which may show another pair.
    inst && tier !== "free" && ctx && imageKind !== "upload" ? mtfBlock(inst.id, ctx.interval, tier) : "",
  ]);

  // Keep the last 8 turns (bounds cost); attach app context + screenshot to the newest user turn only.
  const recent = messages.slice(-8);
  const turns: ChatTurn[] = recent.map((m, i) =>
    i === recent.length - 1
      ? { role: "user", text: `${contextBlock(ctx, news, imageKind, lang, track, mtf)}\n\n${m.content}`, image }
      : { role: m.role, text: m.content },
  );
  const system = systemPrompt(tier);
  const notices = { refusal: t("srv.refusal"), cutShort: t("srv.cutShort") };
  // Anonymous, stable per-user session id for providers that track conversations (never the email itself).
  const sessionId = createHash("sha256").update(`sobatfx:${email}`).digest("hex").slice(0, 32);

  const releaseSlot = handoff();
  const encoder = new TextEncoder();
  const started = Date.now();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const scrub = streamScrubber();
      let sent = 0;
      // Our own abort handle, so a reply stuck in a repetition loop can be cut off.
      const ctl = new AbortController();
      req.signal.addEventListener("abort", () => ctl.abort());
      let raw = "";
      let looped = false;
      const emit = (t: string) => {
        if (looped) return;
        raw += t;
        if (isLooping(raw)) {
          looped = true;
          ctl.abort();
          return;
        }
        const out = scrub.push(t);
        if (out) {
          sent += out.length;
          controller.enqueue(encoder.encode(out));
        }
      };
      try {
        try {
          await streamForTier(tier, { system, turns, signal: ctl.signal, onText: emit, notices, sessionId });
        } catch (e) {
          if (looped) {
            // fall through to the normal ending below
          } else if (e instanceof ProviderError && e.retryWithoutImage && image && sent === 0) {
            // Model may not accept images → retry once text-only (only if nothing streamed yet).
            turns[turns.length - 1] = { role: "user", text: turns[turns.length - 1].text.replace("is attached.", "could not be processed; use the candle data.") };
            await streamForTier(tier, { system, turns, signal: ctl.signal, onText: emit, notices, sessionId });
          } else throw e;
        }
        // Safety net: a chart analysis must come with drawings. If the model described levels but sent
        // no sobatfx-draw block, ask it once more for just the block (not counted as a user request).
        const onChartPage = (ctx?.page ?? "chart") === "chart" && Boolean(ctx?.candles?.length);
        const noDrawAsked = /jangan (di)?gambar|tanpa gambar|don'?t draw|no drawing/i.test(messages[messages.length - 1].content);
        if (!looped && !noDrawAsked && imageKind !== "upload" && onChartPage && !/sobatfx[-_ ]draw/i.test(raw) && mentionsLevels(raw, ctx?.lastPrice)) {
          console.warn(`[ai] ${tier} reply without draw block (${raw.length} chars, ${Date.now() - started}ms) — asking for drawings`);
          let block = "";
          try {
            await streamForTier(tier, {
              system,
              // Text only — no need to resend the chart image for this.
              turns: [...turns.map(({ role, text }) => ({ role, text })), { role: "assistant", text: raw }, { role: "user", text: "Now output ONLY the ```sobatfx-draw``` fenced block for the levels, zones, trendlines and trade plan you described above — no other text." }],
              signal: ctl.signal,
              onText: (x) => (block += x),
              notices,
              sessionId,
            });
          } catch (e) {
            console.warn("[ai] draw-block follow-up failed", (e as Error).message);
          }
          const m = /```\s*sobatfx[-_ ]draw[\s\S]*?```/i.exec(block);
          const found = m ?? /sobatfx[-_ ]draw[\s`:]*(?:json\s*)?([{[][\s\S]*[}\]])/i.exec(block);
          if (m) emit(`\n\n${m[0]}`);
          else if (found) emit(`\n\n\`\`\`sobatfx-draw\n${found[1]}\n\`\`\``);
          else console.warn("[ai] follow-up returned no draw block");
        }
        const rest = scrub.flush();
        if (rest) controller.enqueue(encoder.encode(rest));
        if (looped) controller.enqueue(encoder.encode(`\n\n_${t("srv.loopCut")}_`));
        controller.enqueue(encoder.encode(END));
        // After the reply is complete: keep this reply's trade plans so they can be scored against real prices later.
        if (!looped && tier !== "free" && onChartPage && imageKind !== "upload") await recordPlans(scrubbed(raw), ctx, tier);
      } catch (e) {
        if (sent === 0) {
          await refundUsage(email, tier);
          await refundGlobalCap();
          if (demoMode()) await refundDemoCap();
        }
        const msg = e instanceof ProviderError ? t(`srv.${e.code}`, { tier: TIER_INFO[tier].label }) : t("srv.unavailable");
        if (!(e instanceof ProviderError)) console.error("[ai] unexpected", e);
        controller.enqueue(encoder.encode(ERR + msg));
      } finally {
        await releaseSlot();
        controller.close();
      }
    },
    // The client hung up: free the slot right away (release is idempotent).
    cancel: () => releaseSlot(),
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Usage-Used": String(usage.used),
      "X-Usage-Limit": String(usage.limit),
      "X-Tier": tier,
    },
  });
}
