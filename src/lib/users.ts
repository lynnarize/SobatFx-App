import { kv } from "./store";
import type { PaidTier, Tier } from "./tiers";

export interface UserRecord {
  email: string;
  name?: string | null;
  image?: string | null;
  createdAt: number;
  proUntil?: number;
  ultimateUntil?: number;
}

const userKey = (email: string) => `user:${email.toLowerCase()}`;

const adminEmails = () =>
  (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

export async function getUser(email: string) {
  return kv.get<UserRecord>(userKey(email));
}

export async function upsertUser(u: { email: string; name?: string | null; image?: string | null }) {
  const existing = await getUser(u.email);
  const rec: UserRecord = { ...existing, email: u.email.toLowerCase(), name: u.name, image: u.image, createdAt: existing?.createdAt ?? Date.now() };
  await kv.set(userKey(u.email), rec);
  return rec;
}

/** Local testing only: DEV_TIER=pro|ultimate sets the tier of the dev login (needs DEV_SKIP_AUTH, never in production). */
function devTier(): Tier | null {
  if (process.env.NODE_ENV === "production" || process.env.DEV_SKIP_AUTH !== "true") return null;
  const t = process.env.DEV_TIER;
  return t === "pro" || t === "ultimate" ? t : null;
}

export function effectiveTier(u: UserRecord | null): { tier: Tier; until?: number } {
  const dev = devTier();
  if (dev && (!u || u.email === "dev@sobatfx.local")) return { tier: dev };
  if (!u) return { tier: "free" };
  if (adminEmails().includes(u.email.toLowerCase())) return { tier: "ultimate" };
  const now = Date.now();
  if (u.ultimateUntil && u.ultimateUntil > now) return { tier: "ultimate", until: u.ultimateUntil };
  if (u.proUntil && u.proUntil > now) return { tier: "pro", until: u.proUntil };
  return { tier: "free" };
}

/** Extends the tier from max(now, current expiry). */
export async function grantTier(email: string, tier: PaidTier, days: number) {
  const u = (await getUser(email)) ?? (await upsertUser({ email }));
  const field = tier === "ultimate" ? "ultimateUntil" : "proUntil";
  const from = Math.max(Date.now(), u[field] ?? 0);
  u[field] = from + days * 86_400_000;
  await kv.set(userKey(email), u);
  return u;
}

// ─── Usage limits ────────────────────────────────────────────────────────

export function tierLimit(tier: Tier) {
  const n = (v: string | undefined, d: number) => (v && !Number.isNaN(+v) ? +v : d);
  if (tier === "ultimate") return { limit: n(process.env.ULTIMATE_DAILY_LIMIT, 40), period: "daily" as const };
  if (tier === "pro") return { limit: n(process.env.PRO_DAILY_LIMIT, 10), period: "daily" as const };
  const period = process.env.FREE_LIMIT_PERIOD === "lifetime" ? ("lifetime" as const) : ("daily" as const);
  return { limit: n(process.env.FREE_REQUEST_LIMIT, 5), period };
}

// Days roll over at 00:00 WIB (UTC+7) — most SobatFX users are in Indonesia.
function wibDay() {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}
function nextWibMidnight() {
  const d = new Date(`${wibDay()}T00:00:00+07:00`);
  return d.getTime() + 86_400_000;
}

function usageKey(email: string, tier: Tier) {
  const { period } = tierLimit(tier);
  return period === "lifetime" ? `usage:${email}:${tier}:all` : `usage:${email}:${tier}:${wibDay()}`;
}

export async function getUsage(email: string, tier: Tier) {
  const { limit, period } = tierLimit(tier);
  const used = Number((await kv.get<number>(usageKey(email, tier))) ?? 0);
  return { used, limit, period, resetsAt: period === "daily" ? nextWibMidnight() : null };
}

/** Atomically reserves one request. Call refundUsage() if the model call fails. */
export async function consumeUsage(email: string, tier: Tier) {
  const key = usageKey(email, tier);
  const { limit, period } = tierLimit(tier);
  const used = await kv.incr(key);
  if (used === 1 && period === "daily") await kv.expire(key, 2 * 86_400);
  if (used > limit) {
    await kv.decr(key);
    return { ok: false as const, used: limit, limit, period };
  }
  return { ok: true as const, used, limit, period };
}

/** Demo only: one shared daily budget across all demo visitors (DEMO_DAILY_CAP, default 300). */
export async function consumeDemoCap() {
  const cap = Number(process.env.DEMO_DAILY_CAP || 300);
  const key = `demo:all:${wibDay()}`;
  const n = await kv.incr(key);
  if (n === 1) await kv.expire(key, 2 * 86_400);
  if (n > cap) {
    await kv.decr(key);
    return false;
  }
  return true;
}

export async function refundDemoCap() {
  await kv.decr(`demo:all:${wibDay()}`);
}

export async function refundUsage(email: string, tier: Tier) {
  await kv.decr(usageKey(email, tier));
}
