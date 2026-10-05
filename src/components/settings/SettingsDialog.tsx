"use client";

import {
  CandlestickChart,
  ChevronRight,
  Cloud,
  Coins,
  Info,
  Languages,
  Mail,
  MessageSquareHeart,
  Monitor,
  Moon,
  Palette,
  PlayCircle,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Trash2,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { type ComponentType, type ReactNode, useEffect, useId, useState } from "react";
import { HISTORY_TTL_DAYS, clearHistory } from "@/lib/chat-history";
import type { Key, Lang } from "@/lib/i18n";
import { fmtMoney, withCurrency } from "@/lib/market/risk";
import { MT5_SPREAD_POINTS } from "@/lib/paper";
import { THEMES, type Theme } from "@/lib/theme";
import { useT } from "../i18n";
import { LiveRate } from "../LiveRate";
import { startOnboarding } from "../onboarding/Onboarding";
import { useTheme } from "../theme";
import { useWs } from "../workspace";

// Settings pop-up, laid out like Four Notes: one column of collapsible sections, each showing a one-line
// summary of its current value. Phones get a sheet that slides up; larger screens a centred dialog.
// Opened from the gear in the sidebar / mobile top bar with openSettings().

const OPEN_EVENT = "sfx:settings";
const OPEN_KEY = "sfx.settings-open";
const TOGGLE_ALL_EVENT = "sfx:settings-toggle-all";
const TELEGRAM_THANKS = "https://t.me/firmantuhepaly";
const DEV_EMAIL = "lynnarize@gmail.com";

// Filled in by next.config.ts at build time.
const BUILD = {
  version: process.env.NEXT_PUBLIC_APP_VERSION ?? "dev",
  number: process.env.NEXT_PUBLIC_BUILD_NUMBER ?? "local",
  time: process.env.NEXT_PUBLIC_BUILD_TIME,
  commit: process.env.NEXT_PUBLIC_COMMIT || "",
};

type SectionId = "appearance" | "general" | "language" | "currency" | "trading" | "privacy" | "about";

const readOpen = (): Record<string, boolean> => {
  try {
    return JSON.parse(localStorage.getItem(OPEN_KEY) ?? "{}");
  } catch {
    return {};
  }
};
const persistOpen = (id: string, open: boolean) => {
  try {
    localStorage.setItem(OPEN_KEY, JSON.stringify({ ...readOpen(), [id]: open }));
  } catch {}
};

/** Opens Settings, optionally with one section expanded and scrolled into view. */
export function openSettings(section?: SectionId) {
  if (section) persistOpen(section, true);
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: section }));
}

export function SettingsDialog() {
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState<SectionId | undefined>();
  useEffect(() => {
    const onOpen = (e: Event) => {
      setFocus((e as CustomEvent<SectionId | undefined>).detail);
      setOpen(true);
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);
  if (!open) return null;
  return <Sheet focus={focus} close={() => setOpen(false)} />;
}

function Sheet({ focus, close }: { focus?: SectionId; close(): void }) {
  const { t, lang } = useT();
  const { pref, theme } = useTheme();
  const { risk, usdIdr, paper } = useWs();
  const titleId = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);
  useEffect(() => {
    if (focus) document.getElementById(`settings-${focus}`)?.scrollIntoView({ block: "start" });
  }, [focus]);

  const themeName = (v: Theme | "system") => t(`set.theme.${v}`);
  const rate = usdIdr?.rate ?? risk.usdIdr;
  const toggleAll = (open: boolean) => window.dispatchEvent(new CustomEvent<boolean>(TOGGLE_ALL_EVENT, { detail: open }));
  const headBtn = "min-h-11 rounded-md px-2 text-muted transition hover:bg-panel-3 hover:text-ink sm:min-h-8";

  return (
    // Phones: a sheet that slides up from the bottom. Larger screens: a centred dialog.
    <div className="fixed inset-0 z-[65] flex items-end justify-center sm:items-start sm:px-4 sm:pt-[8vh]">
      <div className="backdrop-fade absolute inset-0 bg-black/50" onMouseDown={close} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="settings-sheet relative max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-2xl border border-line-2 bg-panel pb-[env(safe-area-inset-bottom)] sm:max-h-[84vh] sm:rounded-2xl sm:pb-0"
        style={{ boxShadow: "0 30px 80px -20px var(--shadow)" }}
      >
        {/* Grab handle (phones). */}
        <div className="flex justify-center pt-2 sm:hidden" aria-hidden>
          <span className="h-1 w-10 rounded-full bg-line-2" />
        </div>
        <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-panel py-1.5 pl-4 pr-1.5">
          <h2 id={titleId} className="min-w-0 flex-1 truncate font-semibold">
            {t("set.title")}
          </h2>
          <span className="flex shrink-0 items-center text-xs">
            <button className={headBtn} onClick={() => toggleAll(true)}>
              {t("set.expandAll")}
            </button>
            <button className={headBtn} onClick={() => toggleAll(false)}>
              {t("set.collapseAll")}
            </button>
          </span>
          <button className="grid h-11 w-11 place-items-center rounded-md text-ink-2 transition hover:bg-panel-3 hover:text-ink sm:h-9 sm:w-9" onClick={close} aria-label={t("app.close")} autoFocus>
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3 p-4 text-sm">
          <Section id="appearance" icon={Palette} title={t("set.appearance")} defaultOpen summary={pref === "system" ? `${themeName("system")} (${themeName(theme)})` : themeName(pref)}>
            <Appearance />
          </Section>

          <Section id="general" icon={SlidersHorizontal} title={t("set.general")} summary={t("set.generalSummary")}>
            <General close={close} />
          </Section>

          <Section id="language" icon={Languages} title={t("set.language")} summary={lang === "id" ? "Bahasa Indonesia" : "English"}>
            <Language />
          </Section>

          <Section
            id="currency"
            icon={Coins}
            title={t("set.currency")}
            summary={`${risk.currency} · ${fmtMoney(risk.balance, risk.currency)} · 1 USD = Rp ${rate.toLocaleString("id-ID", { maximumFractionDigits: 0 })}${usdIdr?.live ? ` (${t("set.live")})` : ""}`}
          >
            <Currency />
          </Section>

          <Section
            id="trading"
            icon={CandlestickChart}
            title={t("set.trading")}
            summary={`${t("trade.spread")}: ${t(paper.spreadMode === "mt5" ? "trade.spreadMt5" : "trade.spreadNone", { pts: MT5_SPREAD_POINTS })}`}
          >
            <Trading />
          </Section>

          <Section id="privacy" icon={ShieldCheck} title={t("set.privacy")} summary={t("set.privacySummary", { days: HISTORY_TTL_DAYS })}>
            <Privacy close={close} />
          </Section>

          <Section id="about" icon={Info} title={t("set.about")} summary={`${t("set.version")} ${BUILD.version} · ${t("set.build")} ${BUILD.number}`}>
            <About />
          </Section>

          <Feedback />
        </div>
      </div>
    </div>
  );
}

/** Collapsible settings group. Open/closed state is remembered per section. */
function Section({ id, title, icon: Icon, summary, defaultOpen = false, children }: { id: SectionId; title: string; icon: ComponentType<{ size?: number }>; summary?: ReactNode; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(() => {
    const saved = readOpen();
    return id in saved ? saved[id] : defaultOpen;
  });
  const contentId = useId();
  useEffect(() => {
    const onToggleAll = (e: Event) => {
      const next = (e as CustomEvent<boolean>).detail;
      setOpen(next);
      persistOpen(id, next);
    };
    window.addEventListener(TOGGLE_ALL_EVENT, onToggleAll);
    return () => window.removeEventListener(TOGGLE_ALL_EVENT, onToggleAll);
  }, [id]);
  const toggle = () => {
    persistOpen(id, !open);
    setOpen(!open);
  };

  return (
    <section id={`settings-${id}`} className="scroll-mt-14 rounded-xl border border-line">
      <h3>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={contentId}
          className={`flex w-full items-center gap-3 px-3.5 py-3 text-left transition hover:bg-panel-2 ${open ? "rounded-t-xl" : "rounded-xl"}`}
        >
          <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg transition ${open ? "bg-gold-soft text-gold" : "bg-panel-3 text-muted"}`}>
            <Icon size={16} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium text-ink">{title}</span>
            {summary && <span className="block truncate text-xs text-muted">{summary}</span>}
          </span>
          <ChevronRight size={16} className={`shrink-0 text-muted transition-transform ${open ? "rotate-90" : ""}`} />
        </button>
      </h3>
      {open && (
        <div id={contentId} className="enter border-t border-line px-3.5 py-4">
          {children}
        </div>
      )}
    </section>
  );
}

/** Small selectable card shared by the theme, language and currency pickers. */
function Choice({ on, onClick, label, children }: { on: boolean; onClick(): void; label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className={`flex flex-col gap-2 rounded-lg border p-2 text-sm transition-colors ${on ? "border-gold ring-1 ring-gold" : "border-line-2 hover:bg-panel-2"}`}
    >
      {children}
    </button>
  );
}

const choiceLabel = (on: boolean) => `flex items-center justify-center gap-1.5 ${on ? "font-medium text-ink" : "text-muted"}`;

/* ───────────── Appearance ───────────── */

// Fixed colours on purpose: each card previews its theme regardless of the current one.
const PALETTE: Record<Theme, { bg: string; panel: string; line: string; text: string; gold: string; up: string; down: string }> = {
  dark: { bg: "#0a0a0b", panel: "#16161a", line: "#26262c", text: "#f4f1ea", gold: "#d4b67c", up: "#22b36b", down: "#e0453c" },
  light: { bg: "#ffffff", panel: "#f6f4ef", line: "#e7e3da", text: "#1a1814", gold: "#946b22", up: "#138a52", down: "#cf3a31" },
};

function Mini({ p }: { p: (typeof PALETTE)[Theme] }) {
  const bars = [
    [40, 70, 1],
    [30, 55, 0],
    [45, 75, 1],
    [20, 50, 1],
    [10, 35, 1],
  ] as const;
  return (
    <div className="flex h-full min-w-0 flex-1" style={{ background: p.bg }}>
      <div className="w-1/4 space-y-1 p-1" style={{ background: p.panel, borderRight: `1px solid ${p.line}` }}>
        <div className="h-1 rounded-sm" style={{ background: p.gold }} />
        <div className="h-1 rounded-sm" style={{ background: p.text, opacity: 0.4 }} />
        <div className="h-1 rounded-sm" style={{ background: p.text, opacity: 0.4 }} />
      </div>
      <div className="relative flex flex-1 items-end gap-[3px] p-1.5">
        {bars.map(([top, bottom, up], i) => (
          <span key={i} className="relative w-1.5 flex-none rounded-[1px]" style={{ height: `${bottom - top}%`, marginBottom: `${top / 3}%`, background: up ? p.up : p.down }} />
        ))}
        <span className="absolute right-1.5 top-1.5 h-1.5 w-4 rounded-full" style={{ background: p.gold }} />
      </div>
    </div>
  );
}

function Appearance() {
  const { t } = useT();
  const { pref, theme, setPref } = useTheme();
  const icon = { dark: Moon, light: Sun, system: Monitor } as const;
  return (
    <section>
      <div role="radiogroup" aria-label={t("set.appearance")} className="grid grid-cols-3 gap-2">
        {THEMES.map((v) => {
          const on = pref === v;
          const Icon = icon[v];
          return (
            <Choice key={v} on={on} onClick={() => setPref(v)} label={t(`set.theme.${v}`)}>
              <div className="flex h-14 overflow-hidden rounded-md border border-line" aria-hidden>
                {v === "system" ? (
                  <>
                    <Mini p={PALETTE.light} />
                    <Mini p={PALETTE.dark} />
                  </>
                ) : (
                  <Mini p={PALETTE[v]} />
                )}
              </div>
              <span className={choiceLabel(on)}>
                <Icon size={14} />
                {t(`set.theme.${v}`)}
              </span>
            </Choice>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted">{pref === "system" ? t("set.themeNoteSystem", { theme: t(`set.theme.${theme}`).toLowerCase() }) : t("set.themeNoteFixed", { theme: t(`set.theme.${pref}`).toLowerCase() })}</p>
    </section>
  );
}

/* ───────────── General ───────────── */

function General({ close }: { close(): void }) {
  const { t } = useT();
  return (
    <div className="space-y-2">
      <p className="text-xs leading-relaxed text-muted">{t("set.tourSub")}</p>
      <button
        className="flex items-center gap-1.5 rounded-md border border-line-2 px-3 py-1.5 transition hover:bg-panel-3"
        onClick={() => {
          close();
          startOnboarding();
        }}
      >
        <PlayCircle size={14} className="text-gold" /> {t("set.tourRunFull")}
      </button>
    </div>
  );
}

/* ───────────── Language ───────────── */

function Language() {
  const { t, lang, setLang } = useT();
  const opts: { v: Lang; name: string; sample: string }[] = [
    { v: "id", name: "Bahasa Indonesia", sample: "Halo, Sobat!" },
    { v: "en", name: "English", sample: "Hello, friend!" },
  ];
  return (
    <section>
      <div role="radiogroup" aria-label={t("set.language")} className="grid grid-cols-2 gap-2">
        {opts.map((o) => {
          const on = lang === o.v;
          return (
            <Choice key={o.v} on={on} onClick={() => setLang(o.v)} label={o.name}>
              <span className="flex items-center gap-2.5 px-1 py-0.5 text-left" lang={o.v}>
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-md text-xs font-bold ${on ? "bg-gold text-on-gold" : "bg-panel-3 text-muted"}`}>{o.v.toUpperCase()}</span>
                <span className="min-w-0">
                  <span className={`block truncate ${on ? "font-medium text-ink" : "text-ink-2"}`}>{o.name}</span>
                  <span className="block truncate text-xs text-muted">{o.sample}</span>
                </span>
              </span>
            </Choice>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted">{t("set.languageSub")}</p>
    </section>
  );
}

/* ───────────── Currency ───────────── */

function Currency() {
  const { t } = useT();
  const { risk, setRisk } = useWs();
  const opts = [
    { v: "USD", symbol: "$", name: t("set.usd") },
    { v: "IDR", symbol: "Rp", name: t("set.idr") },
  ] as const;
  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label={t("set.currency")} className="grid grid-cols-2 gap-2">
        {opts.map((o) => {
          const on = risk.currency === o.v;
          return (
            <Choice key={o.v} on={on} onClick={() => setRisk(withCurrency(risk, o.v))} label={`${o.v} · ${o.name}`}>
              <span className="flex items-center gap-2.5 px-1 py-0.5 text-left">
                <span className={`num grid h-8 w-8 shrink-0 place-items-center rounded-md text-xs font-bold ${on ? "bg-gold text-on-gold" : "bg-panel-3 text-muted"}`}>{o.symbol}</span>
                <span className="min-w-0">
                  <span className={`block ${on ? "font-medium text-ink" : "text-ink-2"}`}>{o.v}</span>
                  <span className="block truncate text-xs text-muted">{o.name}</span>
                </span>
              </span>
            </Choice>
          );
        })}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-muted">
          {t("set.balance")} ({risk.currency})
          <input className="field num h-10" type="number" min={0} value={risk.balance} onChange={(e) => setRisk({ balance: +e.target.value })} />
        </label>
        <div className="flex flex-col gap-1 text-xs text-muted">
          {t("set.liveRate")}
          <LiveRate />
        </div>
      </div>
      <p className="text-xs leading-relaxed text-muted">
        {t("set.currencySub")} {t("set.convertNote")}
      </p>
    </div>
  );
}

/* ───────────── Demo trading ───────────── */

function Trading() {
  const { t } = useT();
  const { paper, setSpreadMode } = useWs();
  const mode = paper.spreadMode ?? "none";
  const opts = [
    { v: "none", badge: "0", name: t("trade.spreadNone"), sub: t("set.spreadNoneSub") },
    { v: "mt5", badge: String(MT5_SPREAD_POINTS), name: t("trade.spreadMt5", { pts: MT5_SPREAD_POINTS }), sub: t("set.spreadMt5Sub", { pts: MT5_SPREAD_POINTS }) },
  ] as const;
  return (
    <div className="space-y-3">
      <div className="text-xs text-muted">{t("trade.spread")}</div>
      <div role="radiogroup" aria-label={t("trade.spread")} className="grid grid-cols-2 gap-2">
        {opts.map((o) => {
          const on = mode === o.v;
          return (
            <Choice key={o.v} on={on} onClick={() => setSpreadMode(o.v)} label={o.name}>
              <span className="flex items-center gap-2.5 px-1 py-0.5 text-left">
                <span className={`num grid h-8 w-8 shrink-0 place-items-center rounded-md text-xs font-bold ${on ? "bg-gold text-on-gold" : "bg-panel-3 text-muted"}`}>{o.badge}</span>
                <span className="min-w-0">
                  <span className={`block truncate ${on ? "font-medium text-ink" : "text-ink-2"}`}>{o.name}</span>
                  <span className="block text-xs text-muted">{o.sub}</span>
                </span>
              </span>
            </Choice>
          );
        })}
      </div>
      <p className="text-xs leading-relaxed text-muted">{t("set.spreadSub", { pts: MT5_SPREAD_POINTS })}</p>
    </div>
  );
}

/* ───────────── Privacy ───────────── */

const PRIVACY_POINTS: { icon: ComponentType<{ size?: number; className?: string }>; title: Key; text: Key }[] = [
  { icon: ShieldCheck, title: "set.pv.deviceT", text: "set.pv.device" },
  { icon: Sparkles, title: "set.pv.aiT", text: "set.pv.ai" },
  { icon: Cloud, title: "set.pv.syncT", text: "set.pv.sync" },
  { icon: MessageSquareHeart, title: "set.pv.chatT", text: "set.pv.chat" },
];

function Privacy({ close }: { close(): void }) {
  const { t } = useT();
  const [cleared, setCleared] = useState(false);
  const danger = { borderColor: "color-mix(in srgb, var(--down) 45%, transparent)" };
  return (
    <div className="space-y-4">
      <dl className="space-y-3">
        {PRIVACY_POINTS.map((p) => (
          <div key={p.title} className="flex gap-2.5">
            <p.icon size={16} className="mt-0.5 shrink-0 text-muted" />
            <div>
              <dt className="font-medium">{t(p.title, { days: HISTORY_TTL_DAYS })}</dt>
              <dd className="text-xs leading-relaxed text-muted">{t(p.text, { days: HISTORY_TTL_DAYS })}</dd>
            </div>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted">
        {t("set.fullDetails")}{" "}
        <Link href="/privacy" onClick={close} className="text-gold underline underline-offset-2">
          {t("legal.privacy")}
        </Link>{" "}
        ·{" "}
        <Link href="/terms" onClick={close} className="text-gold underline underline-offset-2">
          {t("consent.terms")}
        </Link>
      </p>

      <div className="space-y-2 rounded-lg border p-3" style={danger}>
        <p className="font-medium text-down">{t("set.chatData")}</p>
        <p className="text-xs leading-relaxed text-muted">{t("set.chatDataSub", { days: HISTORY_TTL_DAYS })}</p>
        <button
          className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-down transition hover:bg-panel-3 disabled:opacity-60"
          style={danger}
          disabled={cleared}
          onClick={() => {
            if (window.confirm(t("hist.clearConfirm"))) {
              clearHistory();
              setCleared(true);
            }
          }}
        >
          <Trash2 size={14} /> {t(cleared ? "set.chatCleared" : "hist.clearAll")}
        </button>
      </div>
    </div>
  );
}

/* ───────────── About ───────────── */

function About() {
  const { t, locale } = useT();
  const facts: [string, string][] = [
    [t("set.version"), BUILD.version],
    [t("set.build"), BUILD.number],
    ...(BUILD.commit ? [[t("set.commit"), BUILD.commit] as [string, string]] : []),
    ...(BUILD.time ? [[t("set.builtOn"), new Date(BUILD.time).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })] as [string, string]] : []),
  ];
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Image src="/mark.jpg" alt="" width={40} height={40} className="rounded-[10px] border border-line-2" />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 font-medium">
            SobatFX <span className="rounded bg-gold-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gold">AI</span>
          </div>
          <div className="text-xs text-muted">{t("set.aboutTagline")}</div>
        </div>
      </div>
      <div className="flex select-text flex-wrap gap-x-8 gap-y-2">
        {facts.map(([k, v]) => (
          <div key={k}>
            <div className="text-xs text-muted">{k}</div>
            <div className="num font-medium">{v}</div>
          </div>
        ))}
      </div>
      <div className="space-y-1 border-t border-line pt-3 text-xs text-ink-2">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{t("set.behind")}</div>
        <p className="flex flex-wrap items-center gap-1.5">
          <Send size={12} className="text-muted" />
          {t("set.thanks")}:
          <a href={TELEGRAM_THANKS} target="_blank" rel="noopener noreferrer" className="text-gold underline-offset-2 hover:underline">
            @firmantuhepaly
          </a>
        </p>
        <p className="flex flex-wrap items-center gap-1.5">
          <Mail size={12} className="text-muted" />
          {t("set.devContact")}:
          <a href={`mailto:${DEV_EMAIL}`} className="text-gold underline-offset-2 hover:underline">
            {DEV_EMAIL}
          </a>
        </p>
      </div>
      <p className="text-xs text-muted">{t("set.selfUpdate")}</p>
    </div>
  );
}

/* ───────────── Feedback (closing card) ───────────── */

function Feedback() {
  const { t } = useT();
  const soon = "inline-flex shrink-0 cursor-not-allowed items-center gap-2 rounded-lg border border-line-2 bg-panel px-3 py-2 text-xs text-muted";
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-panel-2 p-4">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gold-soft text-gold">
          <MessageSquareHeart size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium">{t("set.feedback")}</p>
          <p className="text-xs text-muted">{t("set.feedbackSub")}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <span className={soon} aria-disabled="true">
          <Mail size={14} /> Email · {t("set.soon")}
        </span>
        <span className={soon} aria-disabled="true">
          <Send size={14} /> Telegram · {t("set.soon")}
        </span>
      </div>
    </div>
  );
}
