"use client";

import { ChevronDown, ExternalLink, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { eventSpec } from "@/lib/event-specs";
import { type Instrument, getInstrument } from "@/lib/market/symbols";
import type { CalendarEvent, Headline } from "@/lib/news";
import { HOT_AFTER_MS, anyHot, isHot, msUntilHot } from "@/lib/release-window";
import { pairDirection } from "@/lib/usual-effect";
import { useT } from "./i18n";
import { useNow, useWs } from "./workspace";

type NewsData = { calendar: CalendarEvent[]; headlines: Headline[] };
let cache: { at: number; data: NewsData } | null = null;
let inflight: Promise<NewsData> | null = null;

const POLL_MS = 120_000;
/** While a Medium/High release is within 5 min (or just out, awaiting its actual). */
const HOT_POLL_MS = 15_000;

const pollMs = (cal: CalendarEvent[]) => {
  const now = Date.now();
  if (document.hidden) return POLL_MS;
  if (anyHot(cal, now)) return HOT_POLL_MS;
  // Wake up right when the next release window opens rather than up to 2 min late.
  return Math.max(1000, Math.min(POLL_MS, msUntilHot(cal, now)));
};

function fetchNews() {
  return (inflight ??= fetch("/api/news")
    .then((r) => {
      if (!r.ok) throw new Error(`news ${r.status}`);
      return r.json() as Promise<NewsData>;
    })
    .then((d) => ((cache = { at: Date.now(), data: d }), d))
    .finally(() => (inflight = null)));
}

export function useNews() {
  const [data, setData] = useState(cache?.data ?? null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    let timer = 0;
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(load, pollMs(cache?.data.calendar ?? []));
    };
    const load = () => {
      // Another mounted useNews (or a recent page) may have just fetched.
      if (cache && Date.now() - cache.at < pollMs(cache.data.calendar) - 1000) {
        setData(cache.data);
        return schedule();
      }
      fetchNews()
        .then((d) => alive && (setData(d), setError(false)))
        .catch(() => alive && setError(true))
        .finally(() => alive && schedule());
    };
    const onVisible = () => !document.hidden && load();
    load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return { data, error };
}

export const impactColor = (i: string) => (i === "High" ? "bg-down" : i === "Medium" ? "bg-gold" : i === "Low" ? "bg-muted" : "bg-blue");

type T = ReturnType<typeof useT>["t"];

export function fmtWhen(iso: string, locale: string) {
  const d = new Date(iso);
  return d.toLocaleString(locale, { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Exact local clock time, 24h (e.g. 14:30) — calendar convention. */
export function fmtClock(iso: string, locale: string) {
  return new Date(iso).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}

/** Live countdown "m:ss" for the last minutes before a release. */
const countdown = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function relTime(iso: string, t: T) {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 0) {
    const m = -s / 60;
    return m < 60 ? t("time.inM", { n: Math.round(m) }) : m < 1440 ? t("time.inH", { n: Math.round(m / 60) }) : t("time.inD", { n: Math.round(m / 1440) });
  }
  return s < 3600 ? t("time.agoM", { n: Math.max(1, Math.round(s / 60)) }) : s < 86400 ? t("time.agoH", { n: Math.round(s / 3600) }) : t("time.agoD", { n: Math.round(s / 86400) });
}

const actualColor = (better: CalendarEvent["better"]) => (better === 1 ? "text-up" : better === -1 ? "text-down" : "text-ink");

/** Column labels matching EventRow's layout; render it at the same width as the list so the container breakpoints line up. */
export function EventHeader() {
  const { t } = useT();
  return (
    <div className="@container">
      <div className="flex items-center gap-3 border-b border-line pb-1.5 text-[11px] font-semibold text-muted">
        <span className="w-2 shrink-0" />
        <span className="w-10 shrink-0">{t("news.colTime")}</span>
        <span className="w-10 shrink-0 truncate">{t("news.colCur")}</span>
        <span className="min-w-0 flex-1 truncate">{t("news.colEvent")}</span>
        <span className="hidden w-16 shrink-0 justify-end whitespace-nowrap @lg:flex">{t("news.colActual")}</span>
        <span className="hidden w-16 shrink-0 justify-end whitespace-nowrap @lg:flex">{t("news.colForecast")}</span>
        <span className="hidden w-16 shrink-0 justify-end whitespace-nowrap @lg:flex">{t("news.colPrevious")}</span>
        <span className="w-3.5 shrink-0" />
      </div>
    </div>
  );
}

export function EventRow({ e }: { e: CalendarEvent }) {
  const { t, locale } = useT();
  // Tick every second only for rows close to release; the rest stay on the shared 30 s clock.
  const slowNow = useNow();
  const t0 = Date.parse(e.time);
  const near = t0 - slowNow < 6 * 60_000 && t0 - slowNow > -HOT_AFTER_MS;
  const fastNow = useNow(near ? 1000 : 3_600_000);
  const now = near ? Math.max(fastNow, slowNow) : slowNow;
  const [open, setOpen] = useState(false);
  const past = t0 < now;
  const hot = isHot(e, now);
  const awaiting = hot && past && Boolean(e.forecast || e.previous);
  const spec = eventSpec(e.title, e.currency);
  return (
    <li className="@container py-2 text-sm">
      <button
        type="button"
        className={`flex w-full items-center gap-3 text-left ${past && !open && !awaiting ? "opacity-50" : ""} ${spec ? "cursor-pointer hover:text-gold" : "cursor-default"}`}
        onClick={() => spec && setOpen((o) => !o)}
        aria-expanded={spec ? open : undefined}
        title={spec ? t(open ? "spec.hide" : "spec.show") : undefined}
        disabled={!spec}
      >
        <span className={`h-2 w-2 shrink-0 rounded-full ${impactColor(e.impact)}`} title={t("news.impactTitle", { x: t(`impact.${e.impact}`) })} />
        <time dateTime={e.time} className="num w-10 shrink-0 text-xs font-semibold text-ink" title={fmtWhen(e.time, locale)}>{fmtClock(e.time, locale)}</time>
        <span className="num w-10 shrink-0 text-xs font-semibold text-ink-2">{e.currency}</span>
        <span className="min-w-0 flex-1">
          <span className="block">{e.title}</span>
          <span className="num block text-[11px] text-muted">
            {hot && !past ? (
              <b className="font-semibold text-gold" title={fmtWhen(e.time, locale)}>{t("time.inClock", { t: countdown(t0 - now) })}</b>
            ) : awaiting ? (
              <span className="animate-pulse text-gold">{t("news.awaitingActual")}</span>
            ) : (
              <span title={fmtWhen(e.time, locale)}>{relTime(e.time, t)}</span>
            )}
            {/* Narrow containers: figures inline here instead of in columns. */}
            <span className="@lg:hidden">
              {e.actual && <b className={`font-semibold ${actualColor(e.better)}`}> · A {e.actual}</b>}
              {e.forecast && ` · F ${e.forecast}`}
              {e.previous && ` · P ${e.previous}`}
            </span>
          </span>
        </span>
        <span className={`num hidden w-16 shrink-0 text-right text-xs font-semibold @lg:block ${actualColor(e.better)}`}>{e.actual}</span>
        <span className="num hidden w-16 shrink-0 text-right text-xs text-ink-2 @lg:block">{e.forecast}</span>
        <span className="num hidden w-16 shrink-0 text-right text-xs text-ink-2 @lg:block">{e.previous}</span>
        <span className="w-3.5 shrink-0">{spec && <ChevronDown size={14} className={`text-muted transition-transform ${open ? "rotate-180" : ""}`} />}</span>
      </button>
      {open && spec && <EventDetail e={e} spec={spec} />}
    </li>
  );
}

/** Expanded calendar event: what it is, who publishes it, how it usually moves the currency and the chart's pair. */
function EventDetail({ e, spec }: { e: CalendarEvent; spec: NonNullable<ReturnType<typeof eventSpec>> }) {
  const { t, locale } = useT();
  const { askAI, symbol } = useWs();
  const inst = getInstrument(symbol);
  const dir = inst ? pairDirection(e.currency, inst) : 0;
  const cur = e.currency;
  const freq = spec.frequency.kind === "meetings" ? t("spec.freq.meetings", { n: spec.frequency.n }) : t(`spec.freq.${spec.frequency.kind}`);
  const rows: [string, string, string?][] = [
    ...(spec.source ? [[t("spec.source"), spec.source] as [string, string]] : []),
    [t("spec.measures"), t(`spec.${spec.kind}.m`, { cur })],
    [t("spec.effect"), t(spec.effect ? `spec.eff.${spec.effect}` : "spec.eff.none", { cur })],
    ...(dir && spec.effect && inst ? [[t("spec.forPair", { pair: inst.label }), t(dir > 0 ? "spec.pair.up" : "spec.pair.down", { cur, pair: inst.label })] as [string, string]] : []),
    ...(e.actual && e.better != null
      ? [[t("spec.result"), t(e.better === 1 ? "spec.res.better" : e.better === -1 ? "spec.res.worse" : "spec.res.inline", { actual: e.actual, forecast: e.forecast || e.previous, cur }), e.better === 1 ? "text-up" : e.better === -1 ? "text-down" : undefined] as [string, string, string?]]
      : []),
    [t("spec.frequency"), freq],
    [t("spec.why"), t(`spec.${spec.kind}.w`, { cur })],
    ...spec.notes.map((n) => [t("spec.note"), t(`spec.note.${n}`)] as [string, string]),
  ];
  const when = fmtWhen(e.time, locale);
  return (
    <div className="mt-2 mb-1 rounded-lg border border-line bg-panel-3/40 p-3 text-[13px]">
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-[9rem_1fr]">
        {rows.map(([k, v, cls], i) => (
          <div key={i} className="contents">
            <dt className="text-xs font-semibold text-muted sm:pt-px">{k}</dt>
            <dd className={`mb-1 sm:mb-0 ${cls ?? "text-ink-2"}`}>{v}</dd>
          </div>
        ))}
      </dl>
      {spec.effect !== "hawkish" && spec.effect !== null && <EventOutlook e={e} inst={inst} />}
      <button
        type="button"
        className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-xs text-ink-2 hover:border-gold hover:text-gold"
        onClick={() =>
          askAI(
            t("news.askEventPrompt", {
              cur,
              title: e.title,
              when,
              forecast: e.forecast || "—",
              previous: e.previous || "—",
              actual: e.actual ? t("news.askEventActual", { actual: e.actual }) : "",
              pair: inst?.label ?? symbol,
            }),
            { withChart: false },
          )
        }
      >
        <Sparkles size={13} /> {t("spec.askAi")}
      </button>
    </div>
  );
}

/** Pre-release lean with its reasons (or how it did, once released) and the pair's typical reaction. */
function EventOutlook({ e, inst }: { e: CalendarEvent; inst?: Instrument }) {
  const { t } = useT();
  const now = useNow();
  const cur = e.currency;
  const o = e.outlook;
  const released = Date.parse(e.time) < now;
  const lean = (l: number) => t(l > 0 ? "out.better" : l < 0 ? "out.worse" : "out.none", { cur });
  const r = inst && e.reactions?.[inst.id];
  // XAU/crypto pips are easier to read with the price move next to them.
  const pips = (v: number) => (inst && inst.kind !== "forex" ? `${v} (≈ ${(v * inst.pip).toFixed(inst.digits)})` : `${v}`);
  return (
    <div className="mt-3 border-t border-line pt-3">
      {o && (!released || (o.lean !== 0 && e.better != null)) && <p className="mb-1.5 text-xs font-semibold text-muted">{t("out.title")}</p>}
      {!o ? null : released ? (
        o.lean && e.better != null ? (
          <p className="text-ink-2">
            {t("out.was", { lean: lean(o.lean) })}{" "}
            {e.better !== 0 && <b className={o.lean === e.better ? "text-up" : "text-down"}>{t(o.lean === e.better ? "out.right" : "out.wrong")}</b>}
          </p>
        ) : null
      ) : (
        <>
          <p className={`font-medium ${o.lean > 0 ? "text-up" : o.lean < 0 ? "text-down" : "text-ink-2"}`}>
            {lean(o.lean)}
            {o.lean !== 0 && <span className="font-normal text-muted"> · {t(`out.conf.${o.confidence}`)}</span>}
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-ink-2">
            {o.reasons.length === 0 && <li className="list-none -ml-4 text-muted">{t("out.noSignals")}</li>}
            {o.reasons.map((x, i) => (
              <li key={i}>
                {x.kind === "preview"
                  ? t("out.preview", { value: x.value, forecast: x.forecast })
                  : x.kind === "lead"
                    ? t(x.better > 0 ? "out.lead.better" : x.better < 0 ? "out.lead.worse" : "out.lead.inline", { title: x.title, actual: x.actual })
                    : t("out.streak", { beats: x.beats, misses: x.misses, n: x.n })}
              </li>
            ))}
          </ul>
          {o.record && <p className="mt-1 text-xs text-muted">{t("out.record", { hits: o.record.hits, n: o.record.n })}</p>}
        </>
      )}
      {inst && pairDirection(cur, inst) !== 0 && (
        <p className="mt-2 text-ink-2">
          <span className="text-xs font-semibold text-muted">{t("out.reaction", { pair: inst.label })}: </span>
          {r ? (
            <>
              {t("out.react.text", { n: r.n, h1: pips(r.avgH1), m15: pips(r.avgM15) })}
              {r.surprised > 0 && ` ${t("out.react.usual", { usual: r.usual, surprised: r.surprised })}`}
            </>
          ) : (
            <span className="text-muted">{t("out.react.none")}</span>
          )}
        </p>
      )}
      {!released && <p className="mt-2 text-[11px] text-muted">{t("out.disclaimer")}</p>}
    </div>
  );
}

export function HeadlineRow({ h, compact }: { h: Headline; compact?: boolean }) {
  const { askAI } = useWs();
  const { t } = useT();
  return (
    <li className="group flex items-start gap-3 py-2.5">
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${impactColor(h.impact)}`} title={t("news.relevanceTitle", { x: t(`impact.${h.impact}`) })} />
      <div className="min-w-0 flex-1">
        <a href={h.link} target="_blank" rel="noopener noreferrer" className={`hover:text-gold ${compact ? "line-clamp-2 text-sm" : "text-[15px]"}`}>
          {h.title}
          <ExternalLink size={11} className="ml-1 inline opacity-0 group-hover:opacity-60" />
        </a>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
          <span>{h.source}</span>·<span>{relTime(h.time, t)}</span>
          {h.tags.map((tag) => (
            <span key={tag} className="rounded bg-panel-3 px-1.5 py-px text-ink-2">{tag}</span>
          ))}
        </div>
      </div>
      <button
        className="shrink-0 rounded-md p-1.5 text-muted opacity-60 hover:bg-panel-3 hover:text-gold group-hover:opacity-100"
        title={t("news.askTitle")}
        aria-label={t("news.askLabel")}
        onClick={() =>
          askAI(t("news.askPrompt", { tags: h.tags.length ? h.tags.join(", ") : t("news.theMarkets"), title: h.title, source: h.source, when: relTime(h.time, t) }), { withChart: false })
        }
      >
        <Sparkles size={14} />
      </button>
    </li>
  );
}
