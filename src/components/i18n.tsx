"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { type Key, LANG_COOKIE, type Lang, type Vars, localeOf, translate } from "@/lib/i18n";

interface I18n {
  lang: Lang;
  locale: string;
  setLang(l: Lang): void;
  t(key: Key, vars?: Vars): string;
}

const Ctx = createContext<I18n | null>(null);

/** The server reads the language cookie, so the first paint is already in the right language. */
export function I18nProvider({ initial, children }: { initial: Lang; children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initial);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    document.cookie = `${LANG_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = l;
    document.title = translate(l, "meta.title");
  }, []);
  const value = useMemo<I18n>(() => ({ lang, locale: localeOf(lang), setLang, t: (k, v) => translate(lang, k, v) }), [lang, setLang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useT() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useT outside I18nProvider");
  return c;
}

export function LanguageSwitch({ className = "" }: { className?: string }) {
  const { lang, setLang, t } = useT();
  return (
    <div className={`flex rounded-lg border border-line-2 bg-panel p-0.5 text-[11px] font-semibold ${className}`} role="radiogroup" aria-label={t("app.language")}>
      {(["id", "en"] as const).map((l) => (
        <button
          key={l}
          role="radio"
          aria-checked={lang === l}
          lang={l}
          title={l === "id" ? "Bahasa Indonesia" : "English"}
          onClick={() => setLang(l)}
          className={`rounded-md px-2 py-1 ${lang === l ? "bg-gold-soft text-gold" : "text-muted hover:text-ink"}`}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
