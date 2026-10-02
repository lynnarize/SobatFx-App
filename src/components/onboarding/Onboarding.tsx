"use client";

import { ArrowLeft, ArrowRight, Calculator, CandlestickChart, Check, Monitor, Moon, Newspaper, NotebookPen, PartyPopper, PenLine, Sparkles, Sun, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { type ComponentType, useCallback, useEffect, useId, useRef, useState } from "react";
import type { Key } from "@/lib/i18n";
import { withCurrency } from "@/lib/market/risk";
import { THEMES } from "@/lib/theme";
import { useT } from "../i18n";
import { useTheme } from "../theme";
import { useWs } from "../workspace";
import { ArtAI, ArtCalc, ArtChart, ArtDone, ArtDraw, ArtNews, ArtTrade, ArtWelcome } from "./art";

// First-time setup: a few preferences, then a short illustrated tour of the app.
// Opens by itself on the first visit; Settings → General replays it.

const SEEN_KEY = "sfx.onboarded";
const START_EVENT = "sfx:onboarding";
/** Pages people reach from outside (Google's OAuth screen links the legal pages): no tour there. */
const NO_TOUR = ["/privacy", "/terms"];

export function startOnboarding() {
  window.dispatchEvent(new Event(START_EVENT));
}

type Topic = "welcome" | "chart" | "draw" | "ai" | "trade" | "news" | "calc" | "done";
const STEPS: { id: Topic; icon: ComponentType<{ size?: number; className?: string }>; Art: ComponentType; points: boolean }[] = [
  { id: "welcome", icon: Sparkles, Art: ArtWelcome, points: false },
  { id: "chart", icon: CandlestickChart, Art: ArtChart, points: true },
  { id: "draw", icon: PenLine, Art: ArtDraw, points: true },
  { id: "ai", icon: Sparkles, Art: ArtAI, points: true },
  { id: "trade", icon: NotebookPen, Art: ArtTrade, points: true },
  { id: "news", icon: Newspaper, Art: ArtNews, points: true },
  { id: "calc", icon: Calculator, Art: ArtCalc, points: true },
  { id: "done", icon: PartyPopper, Art: ArtDone, points: true },
];

export function Onboarding() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<"next" | "prev">("next");

  useEffect(() => {
    const start = () => {
      setDir("next");
      setStep(0);
      setOpen(true);
    };
    window.addEventListener(START_EVENT, start);
    return () => window.removeEventListener(START_EVENT, start);
  }, []);
  // First visit only, checked once after mount (localStorage is browser-only).
  const checked = useRef(false);
  useEffect(() => {
    if (checked.current) return;
    checked.current = true;
    let seen = true;
    try {
      seen = Boolean(localStorage.getItem(SEEN_KEY));
    } catch {}
    if (!seen && !NO_TOUR.includes(pathname)) setOpen(true);
  }, [pathname]);

  const close = useCallback(() => {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {}
    setOpen(false);
  }, []);
  const go = useCallback(
    (to: number) => {
      setDir(to >= step ? "next" : "prev");
      setStep(Math.max(0, Math.min(STEPS.length - 1, to)));
    },
    [step],
  );

  if (!open) return null;
  return <Tour step={step} dir={dir} go={go} close={close} />;
}

function Tour({ step, dir, go, close }: { step: number; dir: "next" | "prev"; go(n: number): void; close(): void }) {
  const { t } = useT();
  const titleId = useId();
  const S = STEPS[step];
  const last = step === STEPS.length - 1;
  const k = (s: string) => `ob.${S.id}.${s}` as Key;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      // Arrow keys page through the tour unless a form control has focus.
      if ((e.target as HTMLElement)?.closest?.("input, select, textarea, [role=radiogroup]")) return;
      if (e.key === "ArrowRight") go(step + 1);
      if (e.key === "ArrowLeft") go(step - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, go, close]);

  return (
    <div className="backdrop-fade fixed inset-0 z-[70] grid place-items-center bg-black/65 p-0 backdrop-blur-sm sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={`${titleId}-d`}
        className="pop relative flex h-dvh w-full flex-col overflow-hidden border-line-2 bg-panel shadow-2xl outline-none sm:h-auto sm:max-h-[92dvh] sm:max-w-[920px] sm:rounded-3xl sm:border md:grid md:grid-cols-[1.05fr_1fr]"
        style={{ boxShadow: "0 30px 80px -20px var(--shadow)" }}
      >
        {/* Illustration */}
        <div className="relative shrink-0 overflow-hidden border-b border-line bg-panel-2 md:border-b-0 md:border-r">
          <div aria-hidden className="pointer-events-none absolute inset-0 opacity-60" style={{ backgroundImage: "radial-gradient(var(--line-2) 1px, transparent 1px)", backgroundSize: "18px 18px", maskImage: "radial-gradient(ellipse at center, black 30%, transparent 75%)" }} />
          <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 h-64 w-64 rounded-full bg-gold-soft blur-3xl" />
          <div className="relative mx-auto aspect-[3/2] w-full max-w-[460px] p-3 sm:p-5 md:flex md:h-full md:max-w-none md:items-center">
            {/* Keyed so the animations replay on every visit to a step. */}
            <div key={S.id} className="h-full w-full">
              <S.Art />
            </div>
          </div>
          <button className="icon-btn absolute right-3 top-3 h-8 w-8 md:hidden" aria-label={t("ob.skip")} onClick={close}>
            <X size={15} />
          </button>
        </div>

        {/* Text + controls */}
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center gap-2 px-6 pt-5 sm:px-8 sm:pt-7">
            <span className="flex items-center gap-1.5 rounded-full border border-gold-deep/40 bg-gold-soft px-2.5 py-1 text-[11px] font-semibold text-gold">
              <S.icon size={12} /> {t("ob.step", { n: step + 1, total: STEPS.length })}
            </span>
            {!last && (
              <button className="ml-auto hidden rounded-lg px-2 py-1 text-xs text-muted hover:text-ink md:block" onClick={close}>
                {t("ob.skip")}
              </button>
            )}
          </div>

          <div key={S.id} className={`min-h-0 flex-1 overflow-y-auto px-6 pb-4 pt-4 sm:px-8 ${dir === "next" ? "ob-in-next" : "ob-in-prev"}`}>
            <h2 id={titleId} className="text-2xl font-semibold tracking-tight sm:text-[28px] sm:leading-tight">
              {t(k("title"))}
            </h2>
            <p id={`${titleId}-d`} className="mt-2 text-sm leading-relaxed text-ink-2 sm:text-[15px]">
              {t(k("text"))}
            </p>
            {S.id === "welcome" ? (
              <Preferences />
            ) : (
              S.points && (
                <ol className="mt-5 space-y-3">
                  {(["p1", "p2", "p3"] as const).map((p, i) => (
                    <li key={p} className="enter flex items-start gap-3" style={{ transitionDelay: `${120 + i * 90}ms` }}>
                      <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ${last ? "bg-up/15 text-up" : "bg-gold-soft text-gold"}`}>
                        {last ? <Check size={13} strokeWidth={3} /> : i + 1}
                      </span>
                      <span className="text-sm leading-relaxed text-ink">{t(k(p))}</span>
                    </li>
                  ))}
                </ol>
              )
            )}
          </div>

          <div className="flex items-center gap-3 border-t border-line px-6 py-4 sm:px-8">
            <div className="flex flex-1 items-center gap-1.5" role="group" aria-label={t("ob.dialog")}>
              {STEPS.map((s, i) => (
                <button
                  key={s.id}
                  aria-label={t("ob.goTo", { n: i + 1 })}
                  aria-current={i === step ? "step" : undefined}
                  onClick={() => go(i)}
                  className={`h-2 rounded-full transition-all duration-300 ${i === step ? "w-6 bg-gold" : i < step ? "w-2 bg-gold/45 hover:bg-gold/70" : "w-2 bg-line-2 hover:bg-muted"}`}
                />
              ))}
            </div>
            {step > 0 && (
              <button className="btn h-10 px-3" onClick={() => go(step - 1)} aria-label={t("ob.back")}>
                <ArrowLeft size={16} />
                <span className="hidden sm:inline">{t("ob.back")}</span>
              </button>
            )}
            <button className="btn btn-gold h-10 px-4" onClick={() => (last ? close() : go(step + 1))} autoFocus>
              {last ? t("ob.start") : step === 0 ? t("ob.letsGo") : t("ob.next")}
              {!last && <ArrowRight size={16} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Welcome step: language, theme and account currency, each applied immediately. */
function Preferences() {
  const { t, lang, setLang } = useT();
  const { pref, setPref } = useTheme();
  const { risk, setRisk } = useWs();
  const themeIcon = { dark: Moon, light: Sun, system: Monitor } as const;
  return (
    <div className="mt-5 space-y-4">
      <Choice
        label={t("set.language")}
        value={lang}
        onChange={setLang}
        options={[
          { v: "id", label: "Bahasa Indonesia", badge: "ID" },
          { v: "en", label: "English", badge: "EN" },
        ]}
      />
      <Choice
        label={t("ob.theme")}
        value={pref}
        onChange={setPref}
        options={THEMES.map((v) => {
          const Icon = themeIcon[v];
          return { v, label: t(`set.theme.${v}`), icon: <Icon size={14} /> };
        })}
      />
      <Choice
        label={t("set.currency")}
        value={risk.currency}
        onChange={(c) => setRisk(withCurrency(risk, c))}
        options={[
          { v: "USD", label: "USD", badge: "$" },
          { v: "IDR", label: "IDR", badge: "Rp" },
        ]}
      />
    </div>
  );
}

function Choice<V extends string>({ label, value, onChange, options }: { label: string; value: V; onChange(v: V): void; options: { v: V; label: string; badge?: string; icon?: React.ReactNode }[] }) {
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</div>
      <div role="radiogroup" aria-label={label} className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map((o) => {
          const on = o.v === value;
          return (
            <button
              key={o.v}
              role="radio"
              aria-checked={on}
              onClick={() => onChange(o.v)}
              className={`flex min-w-0 items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-sm transition ${on ? "border-gold-deep bg-gold-soft font-medium text-gold" : "border-line-2 bg-panel-2 text-ink-2 hover:border-gold-deep/50 hover:text-ink"}`}
            >
              {o.icon}
              {o.badge && <span className={`num text-[10px] font-bold ${on ? "" : "text-muted"}`}>{o.badge}</span>}
              <span className="truncate">{o.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
