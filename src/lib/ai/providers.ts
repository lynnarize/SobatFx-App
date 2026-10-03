import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "node:crypto";
import OpenAI from "openai";
import type { Tier } from "../tiers";

// SERVER ONLY. Maps a tier to its backing model. Nothing here is ever sent to the browser.

export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
  /** JPEG/PNG data URL; only honoured on the latest user turn. */
  image?: string;
}

export interface StreamArgs {
  system: string;
  turns: ChatTurn[];
  signal?: AbortSignal;
  onText: (t: string) => void;
  /** Notes appended to the reply, already in the user's language. */
  notices?: { refusal: string; cutShort: string };
  /** Stable, anonymous id for the user's conversation (used by providers that track sessions). */
  sessionId?: string;
}

/** Error codes map to `srv.*` strings in src/lib/i18n.ts. */
export type ProviderErrorCode = "notConfigured" | "busyFree" | "busy" | "notAccepted" | "unavailable";

export class ProviderError extends Error {
  constructor(public code: ProviderErrorCode, public retryWithoutImage = false) {
    super(code);
  }
}

const EN_NOTICES = {
  refusal: "I can't help with that request. Let's keep it to trading and the markets.",
  cutShort: "_(answer was cut short — ask me to continue)_",
};

function parseDataUrl(url: string) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(url);
  if (!m) return null;
  return { media_type: m[1] as "image/jpeg" | "image/png" | "image/webp", data: m[2] };
}

// ─── Free & Pro: OpenAI-compatible chat API (OpenRouter by default) ─────────
const OPENROUTER = "https://openrouter.ai/api/v1";

interface CompatConfig {
  label: "free" | "pro";
  apiKey?: string;
  baseURL: string;
  model: string;
  fallbacks: string[];
  reasoning?: string;
  maxTokens: number;
}

const list = (v?: string) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

function compatConfig(tier: "free" | "pro"): CompatConfig {
  if (tier === "free") {
    return {
      label: "free",
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: OPENROUTER,
      model: process.env.FREE_MODEL || "inclusionai/ling-3.1-flash",
      fallbacks: list(process.env.FREE_FALLBACK_MODELS),
      reasoning: process.env.FREE_REASONING,
      maxTokens: 2000,
    };
  }
  // Pro: Qwen 3.8 Max via OpenRouter by default. Any OpenAI-compatible endpoint works
  // (e.g. Alibaba Model Studio: PRO_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1).
  return {
    label: "pro",
    apiKey: process.env.PRO_API_KEY || process.env.OPENROUTER_API_KEY,
    baseURL: process.env.PRO_BASE_URL || OPENROUTER,
    model: process.env.PRO_MODEL || "qwen/qwen3.8-max-0902",
    fallbacks: list(process.env.PRO_FALLBACK_MODELS),
    reasoning: process.env.PRO_REASONING,
    // Caps the worst-case cost per request (see PRO_DAILY_LIMIT); ~250-word answers and trade plans fit easily.
    maxTokens: 2500,
  };
}

/** OpenRouter reasoning control: off unless low/medium/high (thinking makes answers much slower). */
function reasoningParam(r?: string) {
  return r === "low" || r === "medium" || r === "high" ? { effort: r, exclude: true } : { enabled: false };
}

async function streamCompat(cfg: CompatConfig, { system, turns, signal, onText, notices }: StreamArgs) {
  if (!cfg.apiKey) throw new ProviderError("notConfigured");
  const isOpenRouter = cfg.baseURL.startsWith(OPENROUTER);
  const client = new OpenAI({
    apiKey: cfg.apiKey,
    baseURL: cfg.baseURL,
    ...(isOpenRouter ? { defaultHeaders: { "HTTP-Referer": process.env.NEXTAUTH_URL ?? "https://sobatfx.app", "X-Title": "SobatFX" } } : {}),
  });
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: system },
    ...turns.map((t): OpenAI.Chat.ChatCompletionMessageParam =>
      t.role === "user" && t.image
        ? { role: "user", content: [{ type: "image_url", image_url: { url: t.image } }, { type: "text", text: t.text }] }
        : { role: t.role, content: t.text },
    ),
  ];
  try {
    const stream = await client.chat.completions.create(
      {
        model: cfg.model,
        messages,
        stream: true,
        // No frequency/repetition penalties: on free models they can garble the output (broken words, mixed
        // languages, invented numbers). Runaway repetition is cut off by the loop guard in the chat route.
        max_tokens: cfg.maxTokens,
        // OpenRouter-only extras: fallback models and reasoning control.
        ...(isOpenRouter && cfg.fallbacks.length ? ({ models: cfg.fallbacks } as object) : {}),
        ...(isOpenRouter ? ({ reasoning: reasoningParam(cfg.reasoning) } as object) : {}),
        // Qwen (Alibaba Model Studio) thinks by default and can spend the whole budget before answering.
        ...(!isOpenRouter && /qwen/i.test(cfg.model) ? ({ enable_thinking: ["low", "medium", "high"].includes(cfg.reasoning ?? "") } as object) : {}),
      },
      { signal },
    );
    let finish: string | null = null;
    for await (const chunk of stream) {
      const t = chunk.choices[0]?.delta?.content;
      if (t) onText(t);
      finish = chunk.choices[0]?.finish_reason ?? finish;
    }
    if (finish === "length") onText(`\n\n${(notices ?? EN_NOTICES).cutShort}`);
  } catch (e) {
    if (e instanceof OpenAI.APIError) {
      console.error(`[ai:${cfg.label}]`, e.status, e.message);
      if (e.status === 429) throw new ProviderError(cfg.label === "free" ? "busyFree" : "busy");
      if (e.status === 400 || e.status === 404) throw new ProviderError("notAccepted", true);
      throw new ProviderError("unavailable");
    }
    throw e;
  }
}

// ─── Ultimate: Anthropic Messages API ───────────────────────────────────────
async function streamUltimate(args: StreamArgs) {
  const { system, turns, signal, onText } = args;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new ProviderError("notConfigured");
  const client = new Anthropic({ apiKey });

  const messages: Anthropic.MessageParam[] = turns.map((t) => {
    const img = t.role === "user" && t.image ? parseDataUrl(t.image) : null;
    return img
      ? { role: "user", content: [{ type: "image", source: { type: "base64", ...img } }, { type: "text", text: t.text }] }
      : { role: t.role, content: t.text };
  });

  const params: Anthropic.MessageCreateParams = {
    model: process.env.ULTIMATE_MODEL || "claude-opus-5-5",
    max_tokens: 16000,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages,
    output_config: { effort: (process.env.ULTIMATE_EFFORT as "low" | "medium" | "high" | "xhigh" | "max") || "medium" },
  };

  try {
    const stream = client.messages.stream(params, { signal });
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") onText(event.delta.text);
    }
    const final = await stream.finalMessage();
    const notices = args.notices ?? EN_NOTICES;
    if (final.stop_reason === "refusal") onText(`\n\n${notices.refusal}`);
    if (final.stop_reason === "max_tokens") onText(`\n\n${notices.cutShort}`);
  } catch (e) {
    if (e instanceof Anthropic.APIError) {
      console.error("[ai:ultimate]", e.status, e.message);
      if (e.status === 429 || e.status === 529) throw new ProviderError("busy");
      if (e.status === 400) throw new ProviderError("notAccepted", true);
      throw new ProviderError("unavailable");
    }
    throw e;
  }
}

// ─── Pro through your own OpenCode Go key — local testing and the temporary demo only ──
// OpenCode Go is meant for coding agents, so it is never used once the demo is off:
//  - local:  DEV_PRO_VIA_OPENCODE=true + DEV_SKIP_AUTH=true (not in production builds)
//  - demo:   DEMO_PRO_VIA_OPENCODE=true + DEMO_MODE=true
const proViaOpenCode = () =>
  Boolean(process.env.OPENCODE_GO_API_KEY) &&
  ((process.env.NODE_ENV !== "production" && process.env.DEV_SKIP_AUTH === "true" && process.env.DEV_PRO_VIA_OPENCODE === "true") ||
    (process.env.DEMO_MODE === "true" && process.env.DEMO_PRO_VIA_OPENCODE === "true"));

async function streamProOpenCode(args: StreamArgs) {
  const key = process.env.OPENCODE_GO_API_KEY!;
  const client = new Anthropic({
    apiKey: key,
    baseURL: "https://opencode.ai/zen/go",
    defaultHeaders: { Authorization: `Bearer ${key}`, "x-opencode-session": args.sessionId ?? randomUUID(), "User-Agent": process.env.DEMO_MODE === "true" ? "sobatfx-demo/1.0" : "sobatfx-dev-eval/1.0" },
  });
  const messages: Anthropic.MessageParam[] = args.turns.map((t) => {
    const img = t.role === "user" && t.image ? parseDataUrl(t.image) : null;
    return img ? { role: "user", content: [{ type: "image", source: { type: "base64", ...img } }, { type: "text", text: t.text }] } : { role: t.role, content: t.text };
  });
  try {
    const stream = client.messages.stream(
      { model: "qwen3.8-max", max_tokens: 2500, thinking: { type: "disabled" }, system: [{ type: "text", text: args.system, cache_control: { type: "ephemeral" } }], messages },
      { signal: args.signal },
    );
    for await (const ev of stream) if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") args.onText(ev.delta.text);
    if ((await stream.finalMessage()).stop_reason === "max_tokens") args.onText(`\n\n${(args.notices ?? EN_NOTICES).cutShort}`);
  } catch (e) {
    if (e instanceof Anthropic.APIError) {
      console.error("[ai:pro-opencode]", e.status, e.message);
      if (e.status === 429) throw new ProviderError("busy");
      if (e.status === 400) throw new ProviderError("notAccepted", true);
      throw new ProviderError("unavailable");
    }
    throw e;
  }
}

export function streamForTier(tier: Tier, args: StreamArgs) {
  if (tier === "ultimate") return streamUltimate(args);
  if (tier === "pro" && proViaOpenCode()) return streamProOpenCode(args);
  return streamCompat(compatConfig(tier), args);
}
