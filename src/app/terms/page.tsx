import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { getLang } from "@/lib/i18n-server";
import { PRIVACY, TERMS, TERMS_UPDATED } from "@/lib/legal";

// Public on purpose: linked from Google's OAuth consent screen and from the sign-in button.

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  return { title: `${TERMS[lang].title} — SobatFX AI` };
}

export default async function TermsPage() {
  const lang = await getLang();
  return <LegalPage doc={TERMS[lang]} updated={TERMS_UPDATED} lang={lang} other={{ href: "/privacy", label: PRIVACY[lang].title }} />;
}
