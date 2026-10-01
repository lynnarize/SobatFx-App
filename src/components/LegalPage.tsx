import Link from "next/link";
import type { LegalDoc } from "@/lib/legal";
import { type Lang, localeOf } from "@/lib/i18n";

/** Server component shared by /privacy and /terms. The contact email comes from CONTACT_EMAIL. */
export function LegalPage({ doc, updated, lang, other }: { doc: LegalDoc; updated: string; lang: Lang; other: { href: string; label: string } }) {
  const contact = process.env.CONTACT_EMAIL?.trim();
  const date = new Date(updated).toLocaleDateString(localeOf(lang), { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <article className="mx-auto max-w-3xl px-5 py-8 sm:py-12">
      <h1 className="text-3xl font-semibold tracking-tight">{doc.title}</h1>
      <p className="mt-2 text-sm text-muted">
        {doc.updatedLabel}: {date}
      </p>
      <div className="mt-6 space-y-3 text-[15px] leading-relaxed text-ink-2">
        {doc.intro.map((p) => (
          <p key={p}>{p}</p>
        ))}
      </div>
      {doc.sections.map((s) => (
        <section key={s.h} className="mt-8">
          <h2 className="text-lg font-semibold text-ink">{s.h}</h2>
          <div className="mt-2 space-y-3 text-[15px] leading-relaxed text-ink-2">
            {s.p?.map((p) => <p key={p}>{p}</p>)}
            {s.ul && (
              <ul className="list-disc space-y-2 pl-5 marker:text-gold">
                {s.ul.map((li) => (
                  <li key={li}>{li}</li>
                ))}
              </ul>
            )}
          </div>
        </section>
      ))}
      <section className="mt-8">
        <h2 className="text-lg font-semibold text-ink">{doc.contactH}</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
          {contact ? (
            <>
              {doc.contactWith}{" "}
              <a className="text-gold underline underline-offset-2" href={`mailto:${contact}`}>
                {contact}
              </a>
              .
            </>
          ) : (
            doc.contactWithout
          )}
        </p>
      </section>
      <p className="mt-10 border-t border-line pt-4 text-sm">
        <Link href={other.href} className="text-gold underline underline-offset-2">
          {other.label}
        </Link>
      </p>
    </article>
  );
}
