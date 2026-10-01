import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { getLang } from "@/lib/i18n-server";
import { PRIVACY, PRIVACY_UPDATED, TERMS } from "@/lib/legal";

// Public on purpose: Google's OAuth consent screen links here, so it must open without signing in.

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  return { title: `${PRIVACY[lang].title} — SobatFX AI` };
}

export default async function PrivacyPage() {
  const lang = await getLang();
  return <LegalPage doc={PRIVACY[lang]} updated={PRIVACY_UPDATED} lang={lang} other={{ href: "/terms", label: TERMS[lang].title }} />;
}
