import { createHash, timingSafeEqual } from "node:crypto";
import { hit } from "./guard";

// Shared by the server-to-server routes for the Telegram signal builder (src/app/api/partner/*).
// Env: PARTNER_API_KEYS (comma-separated, ≥ 24 chars each; unset = routes off), PARTNER_PER_MIN (default 10).

export const envNum = (v: string | undefined, d: number) => (v && Number.isFinite(+v) ? +v : d);

/** Short hash of the caller's key (for rate-limit buckets), or null. Compared in constant time against every configured key. */
export function partnerKey(req: Request) {
  const keys = (process.env.PARTNER_API_KEYS || "").split(",").map((s) => s.trim()).filter((s) => s.length >= 24);
  const given = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") ?? "")?.[1]?.trim();
  if (!keys.length || !given) return null;
  const g = createHash("sha256").update(given).digest();
  const match = keys.find((k) => timingSafeEqual(createHash("sha256").update(k).digest(), g));
  return match ? createHash("sha256").update(match).digest("hex").slice(0, 16) : null;
}

/** Off / bad key / per-minute limit. Returns the key hash, or the response to send. */
export async function partnerGate(req: Request, bucket: string, perMin = envNum(process.env.PARTNER_PER_MIN, 10)): Promise<{ key: string } | { error: Response }> {
  if (!process.env.PARTNER_API_KEYS) return { error: Response.json({ error: "not found" }, { status: 404 }) };
  const key = partnerKey(req);
  if (!key) return { error: Response.json({ error: "unauthorized" }, { status: 401 }) };
  const burst = await hit(`${bucket}:${key}`, perMin, 60);
  if (!burst.ok) return { error: Response.json({ error: "rate limited" }, { status: 429, headers: { "Retry-After": String(burst.retryAfter) } }) };
  return { key };
}
