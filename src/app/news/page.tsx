"use client";

import { Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { EventRow, HeadlineRow, useNews } from "@/components/news";
import { useT } from "@/components/i18n";
import { useNow, useWs } from "@/components/workspace";

const CURRENCIES = ["All", "USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "NZD", "XAU", "BTC"];

export default function NewsPage() {
  const { data, error } = useNews();
  const { askAI } = useWs();
  const { t, locale } = useT();
  const [cur, setCur] = useState("All");
  const [impact, setImpact] = useState<"High" | "Medium+" | "All">("Medium+");
  const [upcomingOnly, setUpcomingOnly] = useState(true);

  const now = useNow();
  const events = useMemo(() => {
    return (data?.calendar ?? []).filter(
      (e) =>
        (cur === "All" || e.currency === cur || (cur === "XAU" && e.currency === "USD")) &&
        (impact === "All" || e.impact === "High" || (impact === "Medium+" && e.impact === "Medium")) &&
        (!upcomingOnly || Date.parse(e.time) > now - 2 * 3600_000),
    );
  }, [data, cur, impact, upcomingOnly, now]);

  const byDay = useMemo(() => {
    const m = new Map<string, typeof events>();
    for (const e of events) {
      const k = new Date(e.time).toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" });
      m.set(k, [...(m.get(k) ?? []), e]);
    }
    return [...m];
  }, [events, locale]);

  const heads = (data?.headlines ?? []).filter((h) => cur === "All" || h.tags.includes(cur));

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-24 pt-6 @2xl:px-8">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <h1 className="text-2xl font-medium">{t("news.title")}</h1>
          <p className="mt-1 text-sm text-muted">{t("news.sub")}</p>
        </div>
        <button
          className="btn btn-gold ml-auto"
          onClick={() => askAI(t("news.briefingPrompt", { cur: cur === "All" ? t("news.briefingDefault") : cur }), { withChart: false })}
        >
          <Sparkles size={16} /> {t("news.briefing")}
        </button>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {CURRENCIES.map((c) => (
          <button key={c} onClick={() => setCur(c)} className={`rounded-full border px-3 py-1 text-xs ${cur === c ? "border-gold-deep bg-gold-soft text-gold" : "border-line-2 text-ink-2 hover:text-ink"}`}>
            {c === "All" ? t("news.all") : c}
          </button>
        ))}
        <span className="mx-2 h-5 w-px bg-line-2" />
        <select className="field h-8 w-auto text-xs" value={impact} onChange={(e) => setImpact(e.target.value as typeof impact)} aria-label={t("news.impactFilter")}>
          <option value="High">{t("imp.high")}</option>
          <option value="Medium+">{t("imp.medHigh")}</option>
          <option value="All">{t("imp.all")}</option>
        </select>
        <label className="flex items-center gap-1.5 text-xs text-ink-2">
          <input type="checkbox" checked={upcomingOnly} onChange={(e) => setUpcomingOnly(e.target.checked)} className="accent-[var(--gold)]" /> {t("news.upcoming")}
        </label>
      </div>

      {error && <p className="mt-6 text-sm text-down">{t("news.unavailable")}</p>}

      <div className="stagger mt-6 grid gap-6 @5xl:grid-cols-[1.1fr_1fr]">
        <section className="card min-w-0 p-5">
          <h2 className="mb-1 font-medium">{t("news.calendarWeek")}</h2>
          <p className="mb-3 flex gap-3 text-[11px] text-muted">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-down" /> {t("impact.High")}</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-gold" /> {t("impact.Medium")}</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-muted" /> {t("impact.Low")}</span>
            <span>{t("news.fpLegend")}</span>
          </p>
          {!data ? (
            <p className="py-8 text-sm text-muted">{t("app.loading")}</p>
          ) : byDay.length === 0 ? (
            <p className="py-8 text-sm text-muted">{t("news.noEvents")}</p>
          ) : (
            byDay.map(([day, list]) => (
              <div key={day} className="mb-4">
                <div className="sticky top-0 bg-panel-2 py-1 text-xs font-semibold uppercase tracking-wide text-gold">{day}</div>
                <ul className="divide-y divide-line">
                  {list.map((e) => (
                    <EventRow key={e.id} e={e} />
                  ))}
                </ul>
              </div>
            ))
          )}
          <p className="mt-2 text-[11px] text-muted">{t("news.calSource")}</p>
        </section>

        <section className="card min-w-0 p-5">
          <h2 className="mb-3 font-medium">{t("news.latest")}</h2>
          {!data ? (
            <p className="py-8 text-sm text-muted">{t("app.loading")}</p>
          ) : heads.length === 0 ? (
            <p className="py-8 text-sm text-muted">{t("news.noHeadlinesFor", { cur: cur === "All" ? t("news.all") : cur })}</p>
          ) : (
            <ul className="divide-y divide-line">
              {heads.slice(0, 50).map((h) => (
                <HeadlineRow key={h.id} h={h} />
              ))}
            </ul>
          )}
          <p className="mt-2 text-[11px] text-muted">{t("news.sources")}</p>
        </section>
      </div>
    </div>
  );
}
