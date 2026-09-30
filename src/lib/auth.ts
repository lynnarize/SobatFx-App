import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { cookies } from "next/headers";
import type { Tier } from "./tiers";
import { effectiveTier, getUser, upsertUser } from "./users";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;
      await upsertUser({ email: user.email, name: user.name, image: user.image });
      return true;
    },
  },
};

/** Local testing without Google: only when DEV_SKIP_AUTH=true AND not a production build. */
export const DEV_EMAIL = "dev@sobatfx.local";
export const devBypass = () => process.env.NODE_ENV !== "production" && process.env.DEV_SKIP_AUTH === "true";

/** Temporary public demo without Google login (DEMO_MODE=true, see src/proxy.ts). Works in production on purpose. */
export const demoMode = () => process.env.DEMO_MODE === "true";

/** Demo and local testing let the tier be picked from the chat box instead of paid for. */
export const canSwitchTier = () => demoMode() || devBypass();

export async function currentEmail() {
  if (devBypass()) return DEV_EMAIL;
  if (demoMode()) {
    // Anonymous per-visitor id set by the proxy — limits apply per visitor.
    const id = (await cookies()).get("sfx_demo")?.value;
    return id && /^[a-f0-9-]{36}$/.test(id) ? `demo-${id}@demo.sobatfx` : null;
  }
  const s = await getServerSession(authOptions);
  return s?.user?.email?.toLowerCase() ?? null;
}

export const TIER_COOKIE = "sfx_tier";

/** Tier for this request: the chat-box pick in demo/dev, otherwise the paid plan. */
export async function resolveTier(email: string): Promise<{ tier: Tier; until?: number }> {
  if (canSwitchTier()) {
    const picked = (await cookies()).get(TIER_COOKIE)?.value;
    if (picked === "free" || picked === "pro" || picked === "ultimate") return { tier: picked };
  }
  return effectiveTier(await getUser(email));
}
