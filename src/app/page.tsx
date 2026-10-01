"use client";

import { Bookmark, BookmarkCheck, CalendarClock, Info, Newspaper, Share2, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { SymbolBadge } from "@/components/AppShell";
import { TradingChart } from "@/components/chart/TradingChart";
import { OrderTicket } from "@/components/trade/OrderTicket";
import { OpenPositions } from "@/components/trade/Positions";
import { EventRow, HeadlineRow, useNews } from "@/components/news";
import { useT } from "@/components/i18n";
import { FlashNumber } from "@/components/FlashNumber";
import { fmtPrice, useNow, useWs } from "@/components/workspace";
import { instrumentName } from "@/lib/i18n";
import { atr, ema, rsi } from "@/lib/market/indicators";
import { fmtMoney, pipValueUsd } from "@/lib/market/risk";
import { type Candle, INTERVALS, getInstrument, newsKeys } from "@/lib/market/symbols";

export default function Dashboard() {
  const { symbol, setSymbol, interval, setInterval, candles, source, watchlist, toggleWatch, askAI, rates, risk, me } = useWs();
  const inst = getInstrument(symbol)!;
  const { t, lang } = useT();
  const tfLabel = INTERVALS.find((i) => i.id === interval)?.label ?? interval;
  const [dailyFor, setDailyFor] = useState<{ symbol: string; candles: Candle[] }>({ symbol: "", candles: [] });
  const daily = dailyFor.symbol === symbol ? dailyFor.candles : [];
  const now = useNow(60_000);
  const [copied, setCopied] = useState(false);

  // Deep link: /?s=EURUSD
  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("s");
    if (s) setSymbol(s);
  }, [setSymbol]);

  useEffect(() => {
    let stop = false;
    const load = () =>
      fetch(`/api/candles?symbol=${symbol}&interval=1d`)
        .then((r) => r.json())
        .then((j) => !stop && j.candles && setDailyFor({ symbol, candles: j.candles }))
        .catch(() => {});
    load();
    const t = window.setInterval(load, 60_000);
    return () => {
      stop = true;
      window.clearInterval(t);
    };
  }, [symbol]);

  const last = candles.at(-1)?.close ?? daily.at(-1)?.close;
  const today = daily.at(-1);
  const prev = daily.at(-2);
  const change = last != null && prev ? last - prev.close : null;
  const changePct = change != null && prev ? (change / prev.close) * 100 : null;
  const yearAgo = daily.filter((c) => c.time > now / 1000 - 365 * 86400);

  const stats = useMemo(() => {
    const closes = candles.map((c) => c.close);
    const a = atr(candles);
    return {
      ema20: ema(closes, 20).at(-1),
      ema50: ema(closes, 50).at(-1),
      rsi: rsi(closes),
      atrPips: a != null ? a / inst.pip : null,
    };
  }, [candles, inst.pip]);

  const pv = last ? pipValueUsd(inst, last, rates) : NaN;

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-24 pt-4 @2xl:px-8">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-line pb-4">
        <div className="text-sm">
          <span className="text-muted">{t("nav.dashboard")}</span>
          <span className="mx-2 text-muted">/</span>
          <span>{inst.label}</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button className="btn btn-gold" onClick={() => askAI(t((me?.tier ?? "free") === "free" ? "dash.analyzeFreePrompt" : "dash.analyzePrompt", { pair: inst.label, tf: tfLabel }))}>
            <Sparkles size={16} /> {t("dash.analyze")}
          </button>
          <button className="icon-btn" aria-label={t(watchlist.includes(symbol) ? "dash.watchRemove" : "dash.watchAdd")} aria-pressed={watchlist.includes(symbol)} onClick={() => toggleWatch(symbol)}>
            {watchlist.includes(symbol) ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
          </button>
          <button
            className="icon-btn"
            aria-label={t("dash.copyLink")}
            title={t(copied ? "dash.copied" : "dash.copyLink")}
            onClick={() => {
              navigator.clipboard?.writeText(`${location.origin}/?s=${symbol}`);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            <Share2 size={16} className={copied ? "text-gold" : ""} />
          </button>
        </div>
      </div>

      {/* Symbol header */}
      <div className="flex items-center gap-3 border-b border-line py-5">
        <SymbolBadge id={symbol} size={34} />
        <h1 className="text-xl font-medium">
          {instrumentName(inst.name, lang)} <span className="text-muted">•</span> ({inst.label})
        </h1>
      </div>

      {/* Price + ATR on the left; source + timeframe on the right, or on their own row once space runs out. */}
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 py-5">
        <div className="flex flex-wrap items-end gap-x-10 gap-y-3">
          <div>
            <div className="flex items-baseline gap-2">
              <FlashNumber value={last} text={fmtPrice(last, inst.digits)} className="num -mx-1 px-1 text-3xl font-medium" />
              {change != null && (
                <span className={`num text-sm ${change >= 0 ? "text-up" : "text-down"}`}>
                  {change >= 0 ? "+" : ""}
                  {change.toFixed(inst.digits)} ({changePct!.toFixed(2)}%)
                </span>
              )}
            </div>
            <div className="mt-1 text-xs text-muted">{t("dash.vsPrev", { p: prev ? fmtPrice(prev.close, inst.digits) : "" })}</div>
            <div className="mt-0.5 flex items-center gap-1 text-[11px] text-gold/80">
              <Info size={11} /> {t("dash.brokerNote")}
            </div>
          </div>
          <div>
            <div className="num text-2xl font-medium text-ink-2">{stats.atrPips != null ? stats.atrPips.toFixed(1) : "—"}</div>
            <div className="mt-1 text-xs text-muted">{t("dash.atr", { tf: tfLabel })}</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {source && (
            <div className="flex items-center gap-1 text-[11px] text-muted" title={source.note && t(`note.${source.note}`)}>
              {source.note && <Info size={11} />} {t("dash.data", { src: source.name })}
            </div>
          )}
          <div className="flex rounded-xl border border-line-2 bg-panel-2 p-1" role="tablist" aria-label={t("dash.timeframe")}>
            {INTERVALS.map((i) => (
              <button
                key={i.id}
                role="tab"
                aria-selected={interval === i.id}
                onClick={() => setInterval(i.id)}
                className={`rounded-lg px-3 py-1.5 text-xs ${interval === i.id ? "bg-panel-3 text-gold" : "text-muted hover:text-ink"}`}
              >
                {i.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <TradingChart />

      <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 bg-blue" /> EMA 20
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 bg-gold" /> EMA 50
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0 w-4 border-t border-dashed border-gold" /> {t("dash.aiDrawings")}
        </span>
        {source?.note && <span className="text-gold/80">ⓘ {t(`note.${source.note}`)}</span>}
      </div>

      {/* Demo trading (virtual money) */}
      <div className="stagger mt-6 grid gap-4 @4xl:grid-cols-[340px_minmax(0,1fr)]">
        <OrderTicket />
        <OpenPositions showJournalLink />
      </div>

      {/* Stat cards */}
      <div className="stagger mt-6 grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
        <StatCard
          rows={[
            [t("stat.prevClose"), fmtPrice(prev?.close, inst.digits)],
            [t("stat.open"), fmtPrice(today?.open, inst.digits)],
            [t("stat.dayHigh"), fmtPrice(today?.high, inst.digits)],
            [t("stat.dayLow"), fmtPrice(today?.low, inst.digits)],
          ]}
        />
        <StatCard
          rows={[
            [t("stat.dayRange"), today ? `${fmtPrice(today.low, inst.digits)} – ${fmtPrice(today.high, inst.digits)}` : "—"],
            [t("stat.yearRange"), yearAgo.length ? `${fmtPrice(Math.min(...yearAgo.map((c) => c.low)), inst.digits)} – ${fmtPrice(Math.max(...yearAgo.map((c) => c.high)), inst.digits)}` : "—"],
            [t("stat.dayRangePips"), today ? ((today.high - today.low) / inst.pip).toFixed(1) : "—"],
            [t("stat.source"), source?.name ?? "—"],
          ]}
        />
        <StatCard
          rows={[
            ["EMA 20", fmtPrice(stats.ema20, inst.digits)],
            ["EMA 50", fmtPrice(stats.ema50, inst.digits)],
            ["RSI (14)", stats.rsi != null ? stats.rsi.toFixed(1) : "—"],
            [t("stat.trend"), stats.ema20 != null && stats.ema50 != null ? t(stats.ema20 > stats.ema50 ? "stat.bullish" : "stat.bearish") : "—"],
          ]}
        />
        <StatCard
          rows={[
            [t("stat.pipSize"), String(inst.pip)],
            [t("stat.pipValue"), Number.isFinite(pv) ? fmtMoney(pv * (risk.currency === "IDR" ? risk.usdIdr : 1), risk.currency) : "—"],
            [t("stat.contract"), `${inst.contract.toLocaleString()} ${inst.base}`],
            [t("stat.riskPerTrade"), fmtMoney((risk.balance * risk.riskPct) / 100, risk.currency)],
          ]}
          footer={
            <Link href="/calculator" className="text-xs text-gold hover:underline">
              {t("stat.openCalc")}
            </Link>
          }
        />
      </div>

      <MarketOverview />
    </div>
  );
}

function StatCard({ rows, footer }: { rows: [string, string][]; footer?: React.ReactNode }) {
  return (
    // Container query: label/value side by side when the card is wide enough, stacked when narrow
    // (e.g. with the AI panel open) so ranges like "4,146.60 – 4,258.20" never get squeezed.
    <div className="card @container space-y-2.5 px-5 py-4">
      {rows.map(([k, v]) => (
        <div key={k} className="flex flex-col gap-0.5 text-sm @[270px]:flex-row @[270px]:items-baseline @[270px]:justify-between @[270px]:gap-3">
          <span className="leading-snug text-muted">{k}</span>
          <span className="num whitespace-nowrap @[270px]:text-right">{v}</span>
        </div>
      ))}
      {footer}
    </div>
  );
}

function MarketOverview() {
  const { symbol } = useWs();
  const { t } = useT();
  const inst = getInstrument(symbol)!;
  const keys = newsKeys(inst);
  const { data } = useNews();
  const now = useNow();
  const events = (data?.calendar ?? [])
    .filter((e) => keys.includes(e.currency) && (e.impact === "High" || e.impact === "Medium") && Date.parse(e.time) > now - 6 * 3600_000)
    .slice(0, 8);
  const heads = (data?.headlines ?? []).filter((h) => h.tags.some((t) => keys.includes(t))).slice(0, 8);

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-base text-ink-2">{t("ov.title", { pair: inst.label })}</h2>
      <div className="stagger grid gap-4 @5xl:grid-cols-2">
        <div className="card min-w-0 p-5">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg border border-line-2">
              <CalendarClock size={15} />
            </span>
            <h3 className="font-medium">{t("ov.calendar")}</h3>
            <span className="ml-auto text-xs text-muted">{keys.join(" · ")} · {t("ov.medHigh")}</span>
          </div>
          {!data ? (
            <p className="py-6 text-sm text-muted">{t("app.loading")}</p>
          ) : events.length ? (
            <ul className="divide-y divide-line">
              {events.map((e) => (
                <EventRow key={e.id} e={e} />
              ))}
            </ul>
          ) : (
            <p className="py-6 text-sm text-muted">{t("ov.noEvents")}</p>
          )}
          <Link href="/news" className="mt-2 inline-block text-xs text-gold hover:underline">
            {t("ov.fullCalendar")}
          </Link>
        </div>
        <div className="card min-w-0 p-5">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg border border-line-2">
              <Newspaper size={15} />
            </span>
            <h3 className="font-medium">{t("ov.headlines")}</h3>
            <span className="ml-auto text-xs text-muted">{t("ov.tagged", { keys: keys.join(", ") })}</span>
          </div>
          {!data ? (
            <p className="py-6 text-sm text-muted">{t("app.loading")}</p>
          ) : heads.length ? (
            <ul className="divide-y divide-line">
              {heads.map((h) => (
                <HeadlineRow key={h.id} h={h} compact />
              ))}
            </ul>
          ) : (
            <p className="py-6 text-sm text-muted">{t("ov.noHeadlines")}</p>
          )}
          <Link href="/news" className="mt-2 inline-block text-xs text-gold hover:underline">
            {t("ov.allNews")}
          </Link>
        </div>
      </div>
    </section>
  );
}
