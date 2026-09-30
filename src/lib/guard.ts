import { checkBotId } from "botid/server";
import { serverT } from "./i18n-server";
import { kv } from "./store";

// Layers that keep the AI (and other paid/upstream calls) from being leaked or drained.
// Cheapest first, so abusive traffic is dropped before it costs a Redis call or a model call:
//   1. same-origin check    — a script on another site (or curl) can't borrow the endpoint
//   2. Vercel BotID         — invisible challenge; headless browsers and scripts fail it
//   3. per-IP rate limit    — Redis fixed window, shared across serverless instances
//   4. per-user rate limit  — (AI route) a signed-in account can't burst either
//   5. one request at a time per user, and a global daily cap  (AI route)
// The per-tier daily quota in users.ts stays the hard limit per account.

/** Client IP. On Vercel the platform sets these headers itself, so a caller can't spoof them. */
export function clientIp(req: Request) {
  return (
    req.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

const hostOf = (v: string | null) => {
  try {
    return v ? new URL(v).host : null;
  } catch {
    return null;
  }
};

/** Browser POSTs always carry Origin (or at least Referer); it must be this site. ALLOWED_ORIGINS adds more. */
export function isSameOrigin(req: Request) {
  const from = hostOf(req.headers.get("origin")) ?? hostOf(req.headers.get("referer"));
  if (!from) return process.env.NODE_ENV !== "production"; // curl/scripts send neither; allowed locally for testing
  const own = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const extra = (process.env.ALLOWED_ORIGINS || "").split(",").map((s) => hostOf(s.trim()) ?? s.trim()).filter(Boolean);
  return from === own || extra.includes(from);
}

/** Fixed-window counter in Redis (in-memory locally). Fails open if the store is down: the quotas still apply. */
export async function hit(key: string, limit: number, windowSec: number) {
  const now = Math.floor(Date.now() / 1000);
  const slot = Math.floor(now / windowSec);
  const k = `rl:${key}:${slot}`;
  try {
    const n = await kv.incr(k);
    if (n === 1) await kv.expire(k, windowSec + 5);
    return { ok: n <= limit, retryAfter: Math.max(1, (slot + 1) * windowSec - now) };
  } catch (e) {
    console.error("[guard] rate-limit store unavailable", (e as Error).message);
    return { ok: true, retryAfter: 0 };
  }
}

/** BotID only runs on Vercel (set BOTID=off to skip it there). A BotID outage fails open, the other layers still hold. */
async function isBot() {
  if (!process.env.VERCEL || process.env.BOTID === "off") return false;
  try {
    return (await checkBotId()).isBot;
  } catch (e) {
    console.error("[guard] BotID check failed", (e as Error).message);
    return false;
  }
}

const num = (v: string | undefined, d: number) => (v && !Number.isNaN(+v) ? +v : d);

export interface GuardOptions {
  /** Counter name, e.g. "ai", "qris", "data". */
  bucket: string;
  /** Requests allowed per IP per `windowSec`. */
  limit: number;
  windowSec?: number;
  /** Run the same-origin check and BotID (for POSTs from our own pages). Off for public GET data. */
  strict?: boolean;
}

/** Returns a ready 4xx response when the request should be dropped, or null to carry on. */
export async function guard(req: Request, o: GuardOptions): Promise<Response | null> {
  const { t } = await serverT();
  if (o.strict) {
    if (!isSameOrigin(req)) return Response.json({ error: t("srv.notAccepted") }, { status: 403 });
    if (await isBot()) return Response.json({ error: t("srv.botBlocked") }, { status: 403 });
  }
  const r = await hit(`${o.bucket}:ip:${clientIp(req)}`, o.limit, o.windowSec ?? 60);
  if (!r.ok) return Response.json({ error: t("srv.tooMany") }, { status: 429, headers: { "Retry-After": String(r.retryAfter) } });
  return null;
}

/** Per-signed-in-user burst limit. Far harder to dodge than an IP. */
export async function limitUser(bucket: string, email: string, limit: number, windowSec = 60): Promise<Response | null> {
  const r = await hit(`${bucket}:user:${email}`, limit, windowSec);
  if (r.ok) return null;
  const { t } = await serverT();
  return Response.json({ error: t("srv.tooMany") }, { status: 429, headers: { "Retry-After": String(r.retryAfter) } });
}

export const AI_USER_PER_MIN = () => num(process.env.AI_USER_PER_MIN, 6);
export const AI_IP_PER_MIN = () => num(process.env.AI_IP_PER_MIN, 20);

// ─── One AI request at a time per user ───────────────────────────────────

const LOCK_TTL = 330; // a little over the route's maxDuration (300s), so a crashed request can't lock a user out for long

/** Takes the user's single AI slot. Returns a release function, or null if a reply is already being generated. */
export async function acquireSlot(email: string): Promise<(() => Promise<void>) | null> {
  const key = `ai:busy:${email}`;
  try {
    const n = await kv.incr(key);
    await kv.expire(key, LOCK_TTL);
    if (n > 1) {
      await kv.decr(key);
      return null;
    }
  } catch (e) {
    console.error("[guard] slot store unavailable", (e as Error).message);
    return async () => {};
  }
  let released = false;
  return async () => {
    if (released) return;
    released = true;
    await kv.decr(key).catch(() => {});
  };
}

// ─── Global daily cap (all users together) ───────────────────────────────

const utcDay = () => new Date().toISOString().slice(0, 10);

/** AI_GLOBAL_DAILY_CAP requests per day for the whole app, so a leaked or farmed account set can't run up the bill. 0 = off. */
export async function consumeGlobalCap(): Promise<boolean> {
  const cap = num(process.env.AI_GLOBAL_DAILY_CAP, 0);
  if (!cap) return true;
  const key = `ai:global:${utcDay()}`;
  const n = await kv.incr(key);
  if (n === 1) await kv.expire(key, 2 * 86_400);
  if (n > cap) {
    await kv.decr(key);
    return false;
  }
  return true;
}

export async function refundGlobalCap() {
  if (!num(process.env.AI_GLOBAL_DAILY_CAP, 0)) return;
  await kv.decr(`ai:global:${utcDay()}`).catch(() => {});
}

// ─── Body size ───────────────────────────────────────────────────────────

/** Parses a JSON body but stops reading once it passes `max` bytes (Content-Length can be missing or a lie). */
export async function readJson(req: Request, max: number): Promise<{ ok: true; data: unknown } | { ok: false; status: 400 | 413 }> {
  const declared = Number(req.headers.get("content-length"));
  if (declared > max) return { ok: false, status: 413 };
  if (!req.body) return { ok: false, status: 400 };
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return { ok: false, status: 413 };
    }
    chunks.push(value);
  }
  try {
    return { ok: true, data: JSON.parse(Buffer.concat(chunks).toString("utf8")) };
  } catch {
    return { ok: false, status: 400 };
  }
}
