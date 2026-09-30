"use client";

import { Calculator, CandlestickChart, Crown, LogIn, LogOut, Menu, Newspaper, NotebookPen, Rocket, Search, Sparkles, X } from "lucide-react";
import { signIn, signOut, useSession } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { subscribePrice } from "@/lib/market/live";
import { INSTRUMENTS } from "@/lib/market/symbols";
import { TIER_INFO } from "@/lib/tiers";
import { instrumentName } from "@/lib/i18n";
import { AIPanel, CHAT_KEY } from "./AIPanel";
import { FlashNumber } from "./FlashNumber";
import { PaperEngine } from "./trade/PaperEngine";
import { LanguageSwitch, useT } from "./i18n";
import { fmtPrice, useWs } from "./workspace";

const NAV = [
  { href: "/", label: "nav.dashboard", icon: CandlestickChart },
  { href: "/trade", label: "nav.trade", icon: NotebookPen },
  { href: "/news", label: "nav.news", icon: Newspaper },
  { href: "/calculator", label: "nav.calculator", icon: Calculator },
  { href: "/upgrade", label: "nav.plans", icon: Crown },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { aiOpen, setAiOpen } = useWs();
  const { t } = useT();
  const [navOpen, setNavOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* Sidebar */}
      <div className={`fixed inset-0 z-40 bg-black/60 lg:hidden ${navOpen ? "" : "hidden"}`} onClick={() => setNavOpen(false)} />
      <div className={`fixed inset-y-0 left-0 z-50 w-72 transition-transform lg:static lg:translate-x-0 ${navOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <Sidebar onClose={() => setNavOpen(false)} />
      </div>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-line px-4 py-3 lg:hidden">
          <button className="icon-btn" aria-label={t("app.openMenu")} onClick={() => setNavOpen(true)}>
            <Menu size={18} />
          </button>
          <Image src="/mark.jpg" alt="" width={28} height={28} className="rounded-md" />
          <span className="font-semibold">SobatFX</span>
          <LanguageSwitch className="ml-auto" />
        </div>
        <main className="@container min-h-0 flex-1 overflow-y-auto">
          {/* Keyed by route so each page fades up on navigation. */}
          <div key={pathname} className="page-enter">
            {children}
          </div>
        </main>
      </div>

      {/* AI panel */}
      <PaperEngine />
      {/* Always mounted (only hidden when closed) so the conversation and any in-flight reply survive closing. */}
      <div className={`slide-panel fixed inset-0 z-50 sm:inset-y-0 sm:left-auto sm:w-[420px] xl:static xl:z-auto xl:w-[400px] xl:shrink-0 ${aiOpen ? "" : "hidden"}`} aria-hidden={!aiOpen}>
        <AIPanel />
      </div>
      {!aiOpen && (
        <button className="btn btn-gold pop fixed bottom-5 right-5 z-30 h-11 rounded-full px-5 shadow-lg shadow-black/50" onClick={() => setAiOpen(true)}>
          <Sparkles size={16} /> SobatFX AI
        </button>
      )}
    </div>
  );
}

function Sidebar({ onClose }: { onClose(): void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const { me, watchlist, setSymbol, symbol } = useWs();
  const { t, lang } = useT();
  const [q, setQ] = useState("");
  const [hideUpsell, setHideUpsell] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  const [quotes, setQuotes] = useState<Record<string, { price: number | null; change: number | null; dir?: 1 | -1 }>>({});

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        search.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!watchlist.length) return;
    const load = () =>
      fetch(`/api/quotes?symbols=${watchlist.join(",")}`)
        .then((r) => r.json())
        .then((rows: { id: string; price: number | null; change: number | null }[]) => setQuotes(Object.fromEntries(rows.map((r) => [r.id, r]))))
        .catch(() => {});
    load();
    // REST gives the 24h baseline; live ticks keep prices moving in between.
    const t = window.setInterval(load, 120_000);
    const buf: Record<string, { price: number; change24?: number }> = {};
    const unsubs = watchlist.flatMap((id) => {
      const inst = INSTRUMENTS.find((i) => i.id === id);
      return inst ? [subscribePrice(inst, (tk) => (buf[id] = { price: tk.price, change24: tk.change24 }))] : [];
    });
    const flush = window.setInterval(() => {
      const batch = Object.entries(buf);
      if (!batch.length) return;
      for (const [id] of batch) delete buf[id];
      // Updater must stay pure (React may call it twice).
      setQuotes((q) => {
        const next = { ...q };
        for (const [id, { price, change24 }] of batch) {
          const prev = q[id];
          const dir = prev?.price != null && price !== prev.price ? (price > prev.price ? 1 : -1) : prev?.dir;
          next[id] = { price, change: change24 ?? prev?.change ?? null, dir };
        }
        return next;
      });
    }, 500);
    return () => {
      window.clearInterval(t);
      window.clearInterval(flush);
      unsubs.forEach((u) => u());
    };
  }, [watchlist]);

  const matches = q ? INSTRUMENTS.filter((i) => (i.id + i.name + instrumentName(i.name, "id") + i.label).toLowerCase().includes(q.toLowerCase())) : [];
  const open = (id: string) => {
    setSymbol(id);
    setQ("");
    if (pathname !== "/") router.push("/");
    onClose();
  };
  const tier = me?.tier ?? "free";

  return (
    <nav className="flex h-full flex-col gap-5 border-r border-line bg-panel px-4 py-5" aria-label={t("app.mainNav")}>
      <div className="flex items-center gap-2.5 px-1">
        <Image src="/mark.jpg" alt="" width={32} height={32} className="rounded-lg" />
        <span className="text-lg font-semibold tracking-tight">SobatFX</span>
        <span className="rounded bg-gold-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gold">AI</span>
        <button className="icon-btn ml-auto h-8 w-8 lg:hidden" aria-label={t("app.closeMenu")} onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          ref={search}
          className="field pl-9 pr-12"
          placeholder={t("side.search")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && matches[0] && open(matches[0].id)}
          aria-label={t("side.searchLabel")}
        />
        <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-line-2 px-1.5 text-[10px] text-muted">⌘K</kbd>
        {matches.length > 0 && (
          <ul className="pop absolute inset-x-0 top-11 z-10 max-h-72 overflow-auto rounded-xl border border-line-2 bg-panel-2 p-1 shadow-xl">
            {matches.map((i) => (
              <li key={i.id}>
                <button className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-panel-3" onClick={() => open(i.id)}>
                  <span>{i.label}</span>
                  <span className="text-xs text-muted">{instrumentName(i.name, lang)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ul className="space-y-1">
        {NAV.map((n) => {
          const active = pathname === n.href;
          return (
            <li key={n.href}>
              <Link
                href={n.href}
                onClick={onClose}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${active ? "border border-line-2 bg-panel-3 text-ink" : "text-ink-2 hover:bg-panel-2 hover:text-ink"}`}
                aria-current={active ? "page" : undefined}
              >
                <n.icon size={17} className={active ? "text-gold" : ""} />
                {t(n.label)}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{t("side.watchlist")}</div>
        <ul className="space-y-0.5">
          {watchlist.map((id) => {
            const inst = INSTRUMENTS.find((i) => i.id === id);
            if (!inst) return null;
            const qt = quotes[id];
            const up = (qt?.change ?? 0) >= 0;
            return (
              <li key={id}>
                <button
                  onClick={() => open(id)}
                  className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left hover:bg-panel-2 ${symbol === id && pathname === "/" ? "bg-panel-2" : ""}`}
                >
                  <SymbolBadge id={id} />
                  <span className="flex-1 text-sm">{inst.label}</span>
                  <span className="text-right leading-tight">
                    <FlashNumber value={qt?.price} text={fmtPrice(qt?.price, inst.digits)} className={`num block px-0.5 text-xs transition-colors ${qt?.dir === 1 ? "text-up" : qt?.dir === -1 ? "text-down" : "text-ink-2"}`} />
                    <span className={`num block text-[11px] ${up ? "text-up" : "text-down"}`}>{qt?.change != null ? `${up ? "+" : ""}${qt.change.toFixed(2)}%` : ""}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {tier === "free" && !hideUpsell && (
        <div className="relative rounded-2xl border border-line-2 bg-gradient-to-br from-panel-3 to-panel p-4">
          <button className="absolute right-3 top-3 text-muted hover:text-ink" aria-label={t("app.dismiss")} onClick={() => setHideUpsell(true)}>
            <X size={14} />
          </button>
          <div className="mb-3 grid h-10 w-10 place-items-center rounded-xl border border-line-2 bg-panel-3">
            <Rocket size={18} className="text-gold" />
          </div>
          <Link href="/upgrade" className="flex items-center gap-1 text-sm font-semibold hover:text-gold">
            {t("side.upsellTitle")}
          </Link>
          <p className="mt-1 text-xs text-muted">{t("side.upsellText")}</p>
        </div>
      )}

      <div className="flex items-center justify-between px-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">{t("app.language")}</span>
        <LanguageSwitch />
      </div>

      <div className="flex items-center gap-2.5 rounded-xl border border-line px-3 py-2.5">
        {me?.demo ? (
          <div className="min-w-0 leading-tight">
            <div className="text-sm font-semibold text-gold">{t("demo.badge")}</div>
            <div className="text-[11px] text-muted">{t("demo.note")}</div>
          </div>
        ) : session?.user ? (
          <>
            {session.user.image ? (
              <Image src={session.user.image} alt="" width={30} height={30} className="rounded-full" unoptimized />
            ) : (
              <div className="grid h-[30px] w-[30px] place-items-center rounded-full bg-panel-3 text-xs">{session.user.name?.[0]}</div>
            )}
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-sm">{session.user.name}</div>
              <div className={`text-[11px] ${tier === "free" ? "text-muted" : "text-gold"}`}>{t("app.plan", { tier: TIER_INFO[tier].label })}</div>
            </div>
            <button className="icon-btn h-8 w-8" aria-label={t("app.signOut")} title={t("app.signOut")} onClick={() => {
                try {
                  localStorage.removeItem(CHAT_KEY);
                } catch {}
                signOut();
              }}>
              <LogOut size={14} />
            </button>
          </>
        ) : (
          <button className="btn w-full justify-center" onClick={() => signIn("google")}>
            <LogIn size={15} /> {t("app.signIn")}
          </button>
        )}
      </div>
    </nav>
  );
}

const BADGE: Record<string, { bg: string; fg: string; t: string }> = {
  XAUUSD: { bg: "#3a2f18", fg: "#d4b67c", t: "Au" },
  BTCUSD: { bg: "#3a2a12", fg: "#f7931a", t: "₿" },
  ETHUSD: { bg: "#1f2340", fg: "#8c9cf7", t: "Ξ" },
};
export function SymbolBadge({ id, size = 30 }: { id: string; size?: number }) {
  const b = BADGE[id] ?? { bg: "#1c2433", fg: "#8fb3ff", t: id.slice(0, 3) === "USD" ? id.slice(3, 6) : id.slice(0, 3) };
  return (
    <span className="grid shrink-0 place-items-center rounded-lg text-[10px] font-bold" style={{ width: size, height: size, background: b.bg, color: b.fg, fontSize: b.t.length > 2 ? 10 : 14 }}>
      {b.t}
    </span>
  );
}
