"use client";

import { SessionProvider } from "next-auth/react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { type Drawing, uid } from "@/lib/drawings";
import { type CloseReason, DEFAULT_PAPER, type PaperAccount, type PaperTrade, closeTrade, fillTrade } from "@/lib/paper";
import { DEFAULT_RISK, type RiskSettings } from "@/lib/market/risk";
import { type Candle, DEFAULT_WATCHLIST, type Interval, type SourceNote, getInstrument } from "@/lib/market/symbols";
import type { SyncData } from "@/lib/sync";
import type { Tier } from "@/lib/tiers";
import { SignInConsentProvider } from "./SignInConsent";
import { useCloudSync } from "./useCloudSync";

// App-wide client state: current instrument, candles, drawings, risk settings,
// AI panel, and the signed-in user's tier/usage.

export interface Me {
  signedIn: boolean;
  email?: string;
  tier?: Tier;
  tierUntil?: number | null;
  usage?: { used: number; limit: number; period: "daily" | "lifetime"; resetsAt: number | null };
  /** Temporary public demo: no Google login. */
  demo?: boolean;
  /** Demo / local testing: the tier can be picked in the chat box. */
  canSwitchTier?: boolean;
}

export interface ChartHandle {
  /** JPEG data URL of the chart including drawings. */
  screenshot(): string | null;
}

interface Ws {
  symbol: string;
  setSymbol(s: string): void;
  interval: Interval;
  setInterval(i: Interval): void;
  candles: Candle[];
  setCandles(c: Candle[]): void;
  source: { name: string; note?: SourceNote } | null;
  setSource(s: { name: string; note?: SourceNote } | null): void;
  drawings: Drawing[];
  setDrawings(fn: (d: Drawing[]) => Drawing[]): void;
  watchlist: string[];
  toggleWatch(id: string): void;
  risk: RiskSettings;
  setRisk(r: Partial<RiskSettings>): void;
  rates: Record<string, number>;
  chart: React.RefObject<ChartHandle | null>;
  registerChart(h: ChartHandle | null): void;
  aiOpen: boolean;
  setAiOpen(o: boolean): void;
  askAI(prompt: string, opts?: { withChart?: boolean }): void;
  pendingAsk: { prompt: string; withChart: boolean; n: number } | null;
  me: Me | null;
  refreshMe(): void;
  /** Demo trading (virtual money), saved in this browser and synced to the Google account. */
  paper: PaperAccount;
  openPaperTrade(t: Omit<PaperTrade, "id" | "openedAt">): void;
  closePaperTrade(id: string, price: number, reason: CloseReason, at?: number): void;
  /** A pending order reached its entry price: it becomes an open position. */
  fillPaperTrade(id: string, at?: number): void;
  /** Remove a pending order that has not filled yet. */
  cancelPaperTrade(id: string): void;
  /** Move / add / remove SL or TP of an open demo trade (e.g. by dragging it on the chart). */
  modifyPaperTrade(id: string, patch: Partial<Pick<PaperTrade, "sl" | "tp">>): void;
  resetPaper(startBalance: number): void;
  /** Latest live price per symbol (fed by the chart and the paper-trading engine). */
  prices: Record<string, number>;
  setPrice(symbol: string, price: number): void;
}

const Ctx = createContext<Ws | null>(null);
export const useWs = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useWs outside provider");
  return c;
};

function useStored<T>(key: string, initial: T) {
  const [v, setRaw] = useState<T>(initial);
  // State (not a ref) so saving only starts on the render that already holds the hydrated value —
  // otherwise React's dev double-effect run writes `initial` over the stored data first.
  const [hydrated, setHydrated] = useState(false);
  // Child effects run before this provider's, so an explicit set (e.g. a ?s= deep link) must win over hydration.
  const touched = useRef(false);
  const setV = useCallback((x: T | ((prev: T) => T)) => {
    touched.current = true;
    setRaw(x);
  }, []);
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- hydrate from localStorage after mount (SSR-safe) */
    try {
      const raw = localStorage.getItem(key);
      if (raw && !touched.current) setRaw(JSON.parse(raw));
    } catch {}
    setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [key]);
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch {}
  }, [key, v, hydrated]);
  return [v, setV, hydrated] as const;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <SignInConsentProvider>
        <WorkspaceProvider>{children}</WorkspaceProvider>
      </SignInConsentProvider>
    </SessionProvider>
  );
}

function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [symbol, setSymbolRaw] = useStored("sfx.symbol", "XAUUSD");
  const [interval, setInterval] = useStored<Interval>("sfx.interval", "1h");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [source, setSource] = useState<{ name: string; note?: SourceNote } | null>(null);
  const [allDrawings, setAllDrawings, drawingsReady] = useStored<Record<string, Drawing[]>>("sfx.drawings.v2", {});
  const [watchlist, setWatchlist] = useStored("sfx.watchlist", DEFAULT_WATCHLIST);
  const [risk, setRiskRaw] = useStored("sfx.risk", DEFAULT_RISK);
  const [paper, setPaper, paperReady] = useStored<PaperAccount>("sfx.paper", DEFAULT_PAPER);
  const [prices, setPrices] = useState<Record<string, number>>({});
  // Prices arrive many times a second; batch them into one state update per second.
  const priceBuf = useRef<Record<string, number>>({});
  useEffect(() => {
    const t = window.setInterval(() => {
      const b = priceBuf.current;
      if (!Object.keys(b).length) return;
      priceBuf.current = {};
      setPrices((p) => ({ ...p, ...b }));
    }, 1000);
    return () => window.clearInterval(t);
  }, []);
  const setPrice = useCallback((s: string, p: number) => {
    priceBuf.current[s] = p;
  }, []);
  const [rates, setRates] = useState<Record<string, number>>({});
  const [aiOpen, setAiOpen] = useState(false);
  const [pendingAsk, setPendingAsk] = useState<Ws["pendingAsk"]>(null);
  const [me, setMe] = useState<Me | null>(null);
  const chart = useRef<ChartHandle | null>(null);

  const setSymbol = useCallback(
    (s: string) => {
      if (getInstrument(s)) {
        setCandles([]);
        setSymbolRaw(s);
      }
    },
    [setSymbolRaw],
  );

  const drawings = useMemo(() => allDrawings[symbol] ?? [], [allDrawings, symbol]);
  const setDrawings = useCallback(
    (fn: (d: Drawing[]) => Drawing[]) => setAllDrawings((all) => ({ ...all, [symbol]: fn(all[symbol] ?? []) })),
    [setAllDrawings, symbol],
  );

  const refreshMe = useCallback(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then(setMe)
      .catch(() => setMe({ signedIn: false }));
  }, []);
  useEffect(refreshMe, [refreshMe]);

  // Drawings and demo trades follow the Google account across devices (not in the anonymous demo).
  const syncData = useMemo<SyncData>(() => ({ drawings: allDrawings, paper }), [allDrawings, paper]);
  const applySynced = useCallback(
    (d: SyncData) => {
      setAllDrawings(d.drawings);
      setPaper(d.paper);
    },
    [setAllDrawings, setPaper],
  );
  useCloudSync(me?.signedIn && !me.demo && me.email ? me.email : null, drawingsReady && paperReady, syncData, applySynced);

  // USD conversion rates for pip values on crosses / IDR accounts.
  useEffect(() => {
    const load = () =>
      fetch("/api/quotes?symbols=USDJPY,GBPUSD,EURUSD,USDCAD,USDCHF")
        .then((r) => r.json())
        .then((rows: { id: string; price: number | null }[]) => setRates(Object.fromEntries(rows.filter((r) => r.price).map((r) => [r.id, r.price!]))))
        .catch(() => {});
    load();
    const t = window.setInterval(load, 120_000);
    return () => window.clearInterval(t);
  }, []);

  const askAI = useCallback((prompt: string, opts?: { withChart?: boolean }) => {
    setAiOpen(true);
    setPendingAsk((p) => ({ prompt, withChart: opts?.withChart ?? true, n: (p?.n ?? 0) + 1 }));
  }, []);

  const value: Ws = {
    symbol,
    setSymbol,
    interval,
    setInterval,
    candles,
    setCandles,
    source,
    setSource,
    drawings,
    setDrawings,
    watchlist,
    toggleWatch: (id) => setWatchlist((w) => (w.includes(id) ? w.filter((x) => x !== id) : [...w, id])),
    risk,
    setRisk: (r) => setRiskRaw((x) => ({ ...x, ...r })),
    rates,
    chart,
    registerChart: useCallback((h: ChartHandle | null) => {
      chart.current = h;
    }, []),
    aiOpen,
    setAiOpen,
    askAI,
    pendingAsk,
    me,
    refreshMe,
    paper,
    openPaperTrade: (t) => setPaper((a) => ({ ...a, trades: [...a.trades, { ...t, id: uid(), openedAt: Date.now() }] })),
    closePaperTrade: (id, price, reason, at) =>
      setPaper((a) => ({ ...a, trades: a.trades.map((x) => (x.id === id && x.closedAt == null && !x.pending ? closeTrade(x, price, reason, at ?? Date.now(), rates) : x)) })),
    fillPaperTrade: (id, at) => setPaper((a) => ({ ...a, trades: a.trades.map((x) => (x.id === id && x.pending ? fillTrade(x, at ?? Date.now()) : x)) })),
    cancelPaperTrade: (id) => setPaper((a) => ({ ...a, trades: a.trades.filter((x) => !(x.id === id && x.pending)) })),
    modifyPaperTrade: (id, patch) => setPaper((a) => ({ ...a, trades: a.trades.map((x) => (x.id === id && x.closedAt == null ? { ...x, ...patch } : x)) })),
    resetPaper: (startBalance) => setPaper({ startBalance, trades: [] }),
    prices,
    setPrice,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Current time that re-renders every `ms` — keeps Date.now() out of render. */
export function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}

export function fmtPrice(p: number | null | undefined, digits: number) {
  if (p == null || !Number.isFinite(p)) return "—";
  return p.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
