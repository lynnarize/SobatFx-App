import { cookies } from "next/headers";
import { TIER_COOKIE, canSwitchTier } from "@/lib/auth";

// Chat-box tier switch — only in the demo and local testing. Real users get their tier from payments.
export async function POST(req: Request) {
  if (!canSwitchTier()) return Response.json({ error: "Not available" }, { status: 403 });
  const { tier } = await req.json().catch(() => ({}));
  if (tier !== "free" && tier !== "pro" && tier !== "ultimate") return Response.json({ error: "Unknown tier" }, { status: 400 });
  (await cookies()).set(TIER_COOKIE, tier, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  return Response.json({ ok: true, tier });
}
