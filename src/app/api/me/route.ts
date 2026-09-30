import { canSwitchTier, currentEmail, demoMode, resolveTier } from "@/lib/auth";
import { getUsage } from "@/lib/users";

export async function GET() {
  const email = await currentEmail();
  if (!email) return Response.json({ signedIn: false, demo: demoMode() });
  const { tier, until } = await resolveTier(email);
  return Response.json(
    { signedIn: true, email, tier, tierUntil: until ?? null, usage: await getUsage(email, tier), demo: demoMode(), canSwitchTier: canSwitchTier() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
