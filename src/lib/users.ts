import { kv, withLock } from "./store";
import type { PaidTier, Tier } from "./tiers";

export interface UserRecord {
  email: string;
  name?: string | null;
  image?: string | null;
  createdAt: number;
  proUntil?: number;
  ultimateUntil?: number;
  /** Recent order ids already granted, so a retried grant never extends the plan twice. */
  grants?: string[];
}

const userKey = (email: string) => `user:${email.toLowerCase()}`;

const emailList = (v: string | undefined) =>
  (v || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
const adminEmails = () => emailList(process.env.ADMIN_EMAILS);
/** Testers keep their own tier (so they can try Free/Pro as users see it) but get the staff AI limit. */
const testerEmails = () => emailList(process.env.TESTER_EMAILS);
const isStaff = (email: string) => {
  const e = email.toLowerCase();
  return adminEmails().includes(e) || testerEmails().includes(e);
};

export async function getUser(email: string) {
  return kv.get<UserRecord>(userKey(email));
}

// Every write of a user record takes this lock: grants and sign-ins each rewrite the whole record, and an
// unserialized pair would silently drop the other's change (a paid extension, or a just-granted plan).
const userLock = (email: string) => `userlock:${email.toLowerCase()}`;

export async function upsertUser(u: { email: string; name?: string | null; image?: string | null }) {
  const done = await withLock(userLock(u.email), 15, 5000, async () => {
    const existing = await getUser(u.email);
    const rec: UserRecord = { ...existing, email: u.email.toLowerCase(), name: u.name, image: u.image, createdAt: existing?.createdAt ?? Date.now() };
    await kv.set(userKey(u.email), rec);
    return rec;
  });
  if (done) return done.value;
  // Still busy: skip the name/image refresh rather than block the sign-in.
  console.warn("[users] record busy, profile not refreshed");
  return (await getUser(u.email)) ?? { email: u.email.toLowerCase(), createdAt: Date.now() };
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

/** Extends the tier from max(now, current expiry). With `orderId`, once per order: the extension and the id are saved together. */
export async function grantTier(email: string, tier: PaidTier, days: number, orderId?: string) {
  const done = await withLock(userLock(email), 15, 10_000, async () => {
    const u: UserRecord = (await getUser(email)) ?? { email: email.toLowerCase(), createdAt: Date.now() };
    if (orderId && u.grants?.includes(orderId)) return u;
    const field = tier === "ultimate" ? "ultimateUntil" : "proUntil";
    const from = Math.max(Date.now(), u[field] ?? 0);
    u[field] = from + days * 86_400_000;
    if (orderId) u.grants = [...(u.grants ?? []), orderId].slice(-50);
    await kv.set(userKey(email), u);
    return u;
  });
  // Throwing lets the caller retry (webhook redelivery, status poll, admin tap); the order id keeps it to one extension.
  if (!done) throw new Error("User record busy, grant not applied");
  return done.value;
}

// ─── Usage limits ────────────────────────────────────────────────────────

const n = (v: string | undefined, d: number) => (v && !Number.isNaN(+v) ? +v : d);

export function tierLimit(tier: Tier) {
  if (tier === "ultimate") return { limit: n(process.env.ULTIMATE_DAILY_LIMIT, 40), period: "daily" as const };
  if (tier === "pro") return { limit: n(process.env.PRO_DAILY_LIMIT, 10), period: "daily" as const };
  const period = process.env.FREE_LIMIT_PERIOD === "lifetime" ? ("lifetime" as const) : ("daily" as const);
  return { limit: n(process.env.FREE_REQUEST_LIMIT, 5), period };
}

/** The account's AI limit: admins and testers (ADMIN_EMAILS, TESTER_EMAILS) get STAFF_DAILY_LIMIT (default 80) a day on any tier. */
function userLimit(email: string, tier: Tier) {
  if (isStaff(email)) return { limit: n(process.env.STAFF_DAILY_LIMIT, 80), period: "daily" as const };
  return tierLimit(tier);
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
  const { period } = userLimit(email, tier);
  return period === "lifetime" ? `usage:${email}:${tier}:all` : `usage:${email}:${tier}:${wibDay()}`;
}

export async function getUsage(email: string, tier: Tier) {
  const { limit, period } = userLimit(email, tier);
  const used = Number((await kv.get<number>(usageKey(email, tier))) ?? 0);
  return { used, limit, period, resetsAt: period === "daily" ? nextWibMidnight() : null };
}

/** Atomically reserves one request. Call refundUsage() if the model call fails. */
export async function consumeUsage(email: string, tier: Tier) {
  const key = usageKey(email, tier);
  const { limit, period } = userLimit(email, tier);
  const used = await kv.incr(key);
  if (used === 1 && period === "daily") await kv.expire(key, 2 * 86_400);
  if (used > limit) {
    await kv.decr(key);
    return { ok: false as const, used: limit, limit, period };
  }
  return { ok: true as const, used, limit, period };
}

/**
 * Demo only: daily budgets shared by all demo visitors. DEMO_DAILY_CAP (default 300) counts every request; Ultra also
 * counts against DEMO_ULTIMATE_DAILY_CAP (default 30), because anyone can pick the most expensive model in the demo.
 */
function demoCaps(tier: Tier): { name: "all" | "ultimate"; key: string; cap: number }[] {
  const all = { name: "all" as const, key: `demo:all:${wibDay()}`, cap: Number(process.env.DEMO_DAILY_CAP || 300) };
  if (tier !== "ultimate") return [all];
  return [all, { name: "ultimate", key: `demo:ultimate:${wibDay()}`, cap: Number(process.env.DEMO_ULTIMATE_DAILY_CAP || 30) }];
}

/** Takes one request from the demo budgets. Returns null when allowed, else which budget is used up. */
export async function consumeDemoCap(tier: Tier): Promise<"all" | "ultimate" | null> {
  const taken: string[] = [];
  for (const { name, key, cap } of demoCaps(tier)) {
    const n = await kv.incr(key);
    if (n === 1) await kv.expire(key, 2 * 86_400);
    if (n > cap) {
      await Promise.all([key, ...taken].map((k) => kv.decr(k)));
      return name;
    }
    taken.push(key);
  }
  return null;
}

export async function refundDemoCap(tier: Tier) {
  await Promise.all(demoCaps(tier).map(({ key }) => kv.decr(key)));
}

export async function refundUsage(email: string, tier: Tier) {
  await kv.decr(usageKey(email, tier));
}
