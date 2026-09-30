// Client-safe tier metadata. Model/provider details live only in src/lib/ai/providers.ts.

export type Tier = "free" | "pro" | "ultimate";
export type PaidTier = Exclude<Tier, "free">;

export const TIER_ORDER: Tier[] = ["free", "pro", "ultimate"];

// Tier names are the same in every language (the "ultimate" id is shown as "Ultra"); taglines/features live in src/lib/i18n.ts (tier.*).
export const TIER_INFO: Record<Tier, { label: string }> = {
  free: { label: "Free" },
  pro: { label: "Pro" },
  ultimate: { label: "Ultra" },
};

export function isPaidTier(t: string): t is PaidTier {
  return t === "pro" || t === "ultimate";
}
