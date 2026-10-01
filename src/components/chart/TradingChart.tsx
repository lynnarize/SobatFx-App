"use client";

import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import {
  ArrowUpRight,
  Eraser,
  GitCommitHorizontal,
  Layers,
  Magnet,
  Minus,
  MousePointer2,
  MoveUpRight,
  Redo2,
  Rows3,
  Ruler,
  SeparatorVertical,
  Slash,
  Square,
  Trash2,
  TrendingDown,
  TrendingUp,
  Type,
  Undo2,
  Waves,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Drawing } from "@/lib/drawings";
import { ema } from "@/lib/market/indicators";
import { type FeedStatus, feedStatus, subscribeCandles, subscribePrice, subscribeStatus, venueOf } from "@/lib/market/live";
import { fmtMoney, positionSize } from "@/lib/market/risk";
import { type Candle, getInstrument, intervalSec } from "@/lib/market/symbols";
import { kindKey } from "@/lib/paper";
import type { DrawingTool, MagnetMode } from "@/lib/opencharts/constants";
import { DrawingToolsManager } from "@/lib/opencharts/drawing-tools/manager";
import { useT } from "../i18n";
import { useWs } from "../workspace";
import { SelectedPanel } from "./SelectedPanel";
import { useTradeLevels } from "./useTradeLevels";

type ToolId = Exclude<DrawingTool, "position" | "ellipse" | "triangle" | "extended">;
// Labels: `tool.<id>` in src/lib/i18n.ts
const TOOLS: { id: ToolId; icon: typeof Minus }[] = [
  { id: "none", icon: MousePointer2 },
  { id: "trendline", icon: Slash },
  { id: "ray", icon: MoveUpRight },
  { id: "horizontal", icon: Minus },
  { id: "vertical", icon: SeparatorVertical },
  { id: "channel", icon: Rows3 },
  { id: "rectangle", icon: Square },
  { id: "fibonacci", icon: Waves },
  { id: "fibextension", icon: Layers },
  { id: "long-position", icon: TrendingUp },
  { id: "short-position", icon: TrendingDown },
  { id: "measure", icon: Ruler },
  { id: "arrow", icon: ArrowUpRight },
  { id: "text", icon: Type },
];

const HINT = { none: "hint.none", "long-position": "hint.position", "short-position": "hint.position", measure: "hint.measure" } as const;

/** Round every price field to the instrument's precision (drag math produces long decimals). */
function roundPrices(d: Drawing, digits: number): Drawing {
  const r = (v: number | undefined) => (v == null ? v : +v.toFixed(digits));
  return { ...d, price: r(d.price)!, price2: r(d.price2), price3: r(d.price3), stopPrice: r(d.stopPrice), targetPrice: r(d.targetPrice) };
}

const toBar = (c: Candle) => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close });
const volBar = (c: Candle) => ({ time: c.time as UTCTimestamp, value: c.volume ?? 0, color: c.close >= c.open ? "rgba(34,179,107,0.25)" : "rgba(224,69,60,0.25)" });

export function TradingChart() {
  const ws = useWs();
  const { symbol, interval, candles, setCandles, setSource, drawings, setDrawings, risk, rates, registerChart, paper, prices, modifyPaperTrade } = ws;
  const inst = getInstrument(symbol)!;
  const barSec = intervalSec(interval);
  const venue = venueOf(inst);
  const { t, locale } = useT();

  const box = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const emaRefs = useRef<ISeriesApi<"Line">[]>([]);
  const managerRef = useRef<DrawingToolsManager | null>(null);
  const candlesRef = useRef<Candle[]>([]);
  const dirty = useRef(false);
  const [tool, setTool] = useState<ToolId>("none");
  const [magnet, setMagnet] = useState<MagnetMode>("none");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showEma, setShowEma] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const status = useSyncExternalStore(
    useCallback((cb: () => void) => (venue ? subscribeStatus(venue, cb) : () => {}), [venue]),
    () => (venue ? feedStatus(venue) : ("offline" as FeedStatus)),
    () => "offline" as FeedStatus,
  );
  const lastTick = useRef<number | null>(null);
  const [stale, setStale] = useState(false);

  // Latest values for callbacks created once with the chart.
  const latest = useRef({ drawings, setDrawings, barSec, digits: inst.digits });
  useEffect(() => {
    latest.current = { drawings, setDrawings, barSec, digits: inst.digits };
  });

  // Undo / redo history of the drawing list.
  const past = useRef<Drawing[][]>([]);
  const future = useRef<Drawing[][]>([]);
  const mutate = (fn: (d: Drawing[]) => Drawing[]) => {
    past.current = [...past.current.slice(-49), latest.current.drawings];
    future.current = [];
    latest.current.setDrawings(fn);
  };
  const undo = () => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(latest.current.drawings);
    latest.current.setDrawings(() => prev);
  };
  const redo = () => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(latest.current.drawings);
    latest.current.setDrawings(() => next);
  };
  const actions = useRef({ mutate, undo, redo });
  useEffect(() => {
    actions.current = { mutate, undo, redo };
  });

  // ── create chart + OpenCharts drawing manager once ──
  useEffect(() => {
    const el = box.current!;
    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "#111113" }, textColor: "#858077", fontFamily: "var(--font-geist-mono), ui-monospace, monospace", attributionLogo: true },
      grid: { vertLines: { color: "rgba(244,241,234,0.04)" }, horzLines: { color: "rgba(244,241,234,0.04)" } },
      rightPriceScale: { borderColor: "rgba(244,241,234,0.08)" },
      timeScale: { borderColor: "rgba(244,241,234,0.08)", timeVisible: true, rightOffset: 8 },
      crosshair: { mode: CrosshairMode.Normal, vertLine: { color: "rgba(212,182,124,0.4)", labelBackgroundColor: "#b8944f" }, horzLine: { color: "rgba(212,182,124,0.4)", labelBackgroundColor: "#b8944f" } },
      localization: { timeFormatter: (t: number) => new Date(t * 1000).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) },
    });
    const series = chart.addSeries(CandlestickSeries, { upColor: "#22b36b", downColor: "#e0453c", borderVisible: false, wickUpColor: "#22b36b", wickDownColor: "#e0453c" });
    const vol = chart.addSeries(HistogramSeries, { priceScaleId: "vol", priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
    const e20 = chart.addSeries(LineSeries, { color: "#5b8def", lineWidth: 1, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false });
    const e50 = chart.addSeries(LineSeries, { color: "#d4b67c", lineWidth: 1, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false });
    chartRef.current = chart;
    seriesRef.current = series;
    volRef.current = vol;
    emaRefs.current = [e20, e50];

    const manager = new DrawingToolsManager({
      chart,
      series,
      container: el,
      intervalSec: latest.current.barSec,
      timeframe: "",
      callbacks: {
        onAdd: (d) => actions.current.mutate((all) => [...all, roundPrices({ ...d, by: "user" }, latest.current.digits)]),
        // Moving an AI drawing makes it the user's: AI redraws and "Clear AI" no longer touch it.
        onUpdate: (d) => actions.current.mutate((all) => all.map((x) => (x.id === d.id ? roundPrices({ ...x, ...d, by: "user" }, latest.current.digits) : x))),
        onRemove: (id) => actions.current.mutate((all) => all.filter((x) => x.id !== id)),
        onToolFinished: () => setTool("none"),
        onSelectionChange: (ids) => setSelectedId(ids[ids.length - 1] ?? null),
        onSelectTool: (next) => setTool(next as ToolId),
        onRequestSettings: (id) => setSelectedId(id),
        onUndo: () => actions.current.undo(),
        onRedo: () => actions.current.redo(),
      },
    });
    managerRef.current = manager;

    // Screenshot for the AI: drawings are series primitives, so they're in the canvas already.
    registerChart({
      screenshot() {
        const shot = chart.takeScreenshot(true, false);
        const out = document.createElement("canvas");
        const k = Math.min(1, 1280 / shot.width);
        out.width = Math.round(shot.width * k);
        out.height = Math.round(shot.height * k);
        const ctx = out.getContext("2d")!;
        ctx.drawImage(shot, 0, 0, out.width, out.height);
        ctx.font = `600 ${Math.round(13 * (out.width / el.clientWidth))}px ui-sans-serif, system-ui`;
        ctx.fillStyle = "rgba(212,182,124,0.9)";
        ctx.textBaseline = "top";
        const L = latest.current;
        ctx.fillText(`${el.dataset.label ?? ""} · ${L.barSec >= 86400 ? "1D" : L.barSec >= 3600 ? `${L.barSec / 3600}H` : `${L.barSec / 60}m`}`, 10, 8);
        return out.toDataURL("image/jpeg", 0.85);
      },
    });

    return () => {
      manager.destroy();
      managerRef.current = null;
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      registerChart(null);
    };
  }, [registerChart]);

  // ── keep the drawing manager in sync ──
  useEffect(() => {
    managerRef.current?.setDrawings(drawings);
  }, [drawings]);
  useEffect(() => {
    managerRef.current?.setTool(tool);
  }, [tool]);
  useEffect(() => {
    managerRef.current?.setMagnetMode(magnet);
  }, [magnet]);
  useEffect(() => {
    managerRef.current?.updateTimeframe(interval, barSec);
  }, [interval, barSec]);
  useEffect(() => {
    const m = managerRef.current;
    if (!m) return;
    m.setPipSize(inst.pip);
    // Position tool readout in forex terms: lots, pips and account-currency risk.
    m.setPositionReadout((d) => {
      if (d.stopPrice == null || d.targetPrice == null) return null;
      const r = positionSize(inst, risk, d.price, d.stopPrice, d.targetPrice, rates);
      const f = (p: number) => p.toFixed(inst.digits);
      const side = t(d.side === "short" ? "pos.short" : "pos.long");
      const pips = t("calc.pips");
      if (!r) return [`${side} ${f(d.price)}`, `TP ${f(d.targetPrice)}`, `SL ${f(d.stopPrice)}`];
      return [
        `${d.by === "ai" ? "AI · " : ""}${side} ${f(d.price)} · ${r.lot.toFixed(2)} lot`,
        `TP ${f(d.targetPrice)}  +${r.tpPips?.toFixed(1)} ${pips}  ${r.rewardMoney != null ? fmtMoney(r.rewardMoney, risk.currency) : ""}`,
        `SL ${f(d.stopPrice)}  −${r.slPips.toFixed(1)} ${pips}  ${fmtMoney(r.riskMoney, risk.currency)}`,
        `R:R 1:${r.rr?.toFixed(2) ?? "—"} · ${t("pos.risk")} ${risk.riskPct}%${r.lot < 0.01 ? ` · ${t("pos.slTooWide")}` : ""}`,
      ];
    });
  }, [inst, risk, rates, t]);

  // Axis time labels follow the UI language.
  useEffect(() => {
    chartRef.current?.applyOptions({
      localization: { locale, timeFormatter: (ts: number) => new Date(ts * 1000).toLocaleString(locale, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) },
    });
  }, [locale]);

  useEffect(() => {
    emaRefs.current.forEach((s) => s.applyOptions({ visible: showEma }));
  }, [showEma]);

  // Open demo trades and pending orders on this symbol: entry / SL / TP as price lines on the chart.
  const openHere = useMemo(() => paper.trades.filter((x) => x.closedAt == null && x.symbol === symbol), [paper.trades, symbol]);
  // …and draggable like MetaTrader 5 trade levels (see useTradeLevels).
  useTradeLevels({
    box,
    chartRef,
    seriesRef,
    trades: openHere,
    toolActive: tool !== "none",
    inst,
    rates,
    livePrice: prices[symbol] ?? candles.at(-1)?.close,
    labels: { buy: t("trade.buy"), sell: t("trade.sell"), pending: (side, kind) => t(kindKey(side, kind)) },
    onModify: modifyPaperTrade,
  });

  // ── history over REST, then live ticks over WebSocket ──
  useEffect(() => {
    let stop = false;
    let first = true;
    let pollTimer = 0;
    const s = seriesRef.current!;
    candlesRef.current = [];

    const recalcEma = () => {
      const c = candlesRef.current;
      const closes = c.map((x) => x.close);
      [20, 50].forEach((p, i) => {
        const e = ema(closes, p);
        emaRefs.current[i]?.setData(c.flatMap((x, k) => (e[k] == null ? [] : [{ time: x.time as UTCTimestamp, value: e[k]! }])));
      });
    };

    const load = async () => {
      try {
        const r = await fetch(`/api/candles?symbol=${symbol}&interval=${interval}`);
        const j = await r.json();
        if (stop) return;
        if (!r.ok) throw new Error(j.error);
        setError(null);
        const next: Candle[] = j.candles;
        if (first) {
          candlesRef.current = next;
          s.setData(next.map(toBar));
          volRef.current?.setData(next.some((c) => c.volume) ? next.map(volBar) : []);
          s.applyOptions({ priceFormat: { type: "price", precision: inst.digits, minMove: 1 / 10 ** inst.digits } });
          chartRef.current?.timeScale().setVisibleLogicalRange({ from: Math.max(0, next.length - 150), to: next.length + 8 });
          first = false;
        } else {
          // Reconcile closed bars from the exchange; keep the live-built forming bar.
          const cur = candlesRef.current;
          const liveBar = cur[cur.length - 1];
          const merged = next.filter((c) => !liveBar || c.time < liveBar.time);
          if (liveBar) merged.push(liveBar);
          candlesRef.current = merged;
          s.setData(merged.map(toBar));
          if (merged.some((c) => c.volume)) volRef.current?.setData(merged.map(volBar));
        }
        recalcEma();
        dirty.current = true;
        setSource({ name: j.source, note: j.note });
      } catch (e) {
        if (!stop) setError((e as Error).message || "");
      }
    };

    // REST: history + reconciliation. Every 60s while streaming, every 5s if the stream is down.
    const schedule = () => {
      const wait = venue && feedStatus(venue) === "live" ? 60_000 : 5_000;
      pollTimer = window.setTimeout(async () => {
        await load();
        if (!stop) schedule();
      }, wait);
    };
    load().then(() => !stop && schedule());

    // Live: apply at most one update per animation frame.
    let pendingPrice: number | null = null;
    let pendingCandle: Candle | null = null;
    let raf = 0;
    const flush = () => {
      raf = 0;
      const c = candlesRef.current;
      if (!c.length) return;
      const last = c[c.length - 1];
      let bar: Candle | null = null;
      if (pendingCandle) {
        bar = pendingCandle;
        if (bar.time > last.time) c.push(bar);
        else if (bar.time === last.time) c[c.length - 1] = bar;
        else bar = null;
        if (bar?.volume != null) volRef.current?.update(volBar(bar));
      } else if (pendingPrice != null) {
        const p = pendingPrice;
        const bucket = Math.floor(Date.now() / 1000 / barSec) * barSec;
        if (bucket > last.time) {
          bar = { time: bucket, open: p, high: p, low: p, close: p };
          c.push(bar);
        } else if (bucket === last.time) {
          bar = { ...last, high: Math.max(last.high, p), low: Math.min(last.low, p), close: p };
          c[c.length - 1] = bar;
        }
      }
      pendingPrice = null;
      pendingCandle = null;
      if (!bar) return;
      s.update(toBar(bar));
      dirty.current = true;
    };
    const queue = () => {
      if (!raf) raf = requestAnimationFrame(flush);
      lastTick.current = Date.now();
    };
    const unsub =
      subscribeCandles(inst, interval, ({ candle }) => {
        pendingCandle = candle;
        queue();
      }) ??
      subscribePrice(inst, (t) => {
        pendingPrice = t.price;
        queue();
      });

    // Publish candles to the rest of the app (header, stats, AI) at most once a second.
    const pub = window.setInterval(() => {
      if (!dirty.current) return;
      dirty.current = false;
      setCandles([...candlesRef.current]);
      if (candlesRef.current.length % 5 === 0) recalcEma();
    }, 1000);

    return () => {
      stop = true;
      window.clearTimeout(pollTimer);
      window.clearInterval(pub);
      cancelAnimationFrame(raf);
      unsub();
    };
  }, [symbol, interval, inst, barSec, venue, setCandles, setSource]);

  // No ticks for 30s (weekend / quiet market) → say so instead of "LIVE".
  useEffect(() => {
    lastTick.current = null;
    const t = window.setInterval(() => setStale(lastTick.current != null && Date.now() - lastTick.current > 30_000), 5000);
    return () => window.clearInterval(t);
  }, [symbol]);


  const selected = useMemo(() => drawings.find((d) => d.id === selectedId) ?? null, [drawings, selectedId]);
  const aiCount = drawings.filter((d) => d.by === "ai").length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5" role="toolbar" aria-label={t("chart.toolbar")}>
        {TOOLS.map((b) => (
          <button key={b.id} className="icon-btn" title={t(`tool.${b.id}`)} aria-label={t(`tool.${b.id}`)} aria-pressed={tool === b.id} onClick={() => setTool(b.id)}>
            <b.icon size={16} />
          </button>
        ))}
        <span className="mx-1 h-6 w-px bg-line-2" />
        <button
          className="icon-btn"
          title={t("chart.magnet", { mode: t(`magnet.${magnet}`) })}
          aria-label={t("chart.magnetLabel")}
          aria-pressed={magnet !== "none"}
          onClick={() => setMagnet((m) => (m === "none" ? "weak" : m === "weak" ? "strong" : "none"))}
        >
          <Magnet size={16} className={magnet === "strong" ? "fill-current" : ""} />
        </button>
        <button className="icon-btn" title="EMA 20 / 50" aria-label={t("chart.emaToggle")} aria-pressed={showEma} onClick={() => setShowEma((v) => !v)}>
          <GitCommitHorizontal size={16} />
        </button>
        <button className="icon-btn" title={t("chart.undo")} aria-label={t("chart.undo")} onClick={undo}>
          <Undo2 size={16} />
        </button>
        <button className="icon-btn" title={t("chart.redo")} aria-label={t("chart.redo")} onClick={redo}>
          <Redo2 size={16} />
        </button>
        {aiCount > 0 && (
          <button className="btn h-9 text-xs" onClick={() => mutate((all) => all.filter((d) => d.by !== "ai"))} title={t("chart.clearAiTitle")}>
            <Eraser size={14} /> {t("chart.clearAi", { n: aiCount })}
          </button>
        )}
        {drawings.length > 0 && (
          <button
            className="icon-btn"
            title={t("chart.deleteAll")}
            aria-label={t("chart.deleteAll")}
            onClick={() => {
              if (confirm(t("chart.deleteAllConfirm"))) mutate(() => []);
            }}
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
      <p className="-mt-1 text-xs text-muted">{tool in HINT ? t(HINT[tool as keyof typeof HINT]) : t("hint.generic", { tool: t(`tool.${tool}`) })}</p>

      <div className="relative h-[440px] w-full overflow-hidden rounded-xl border border-line bg-panel @2xl:h-[520px]">
        <div ref={box} data-label={inst.label} className="absolute inset-0 z-0" />
        <LiveBadge status={venue ? status : "offline"} stale={stale} />
        {!candles.length && error === null && <div className="absolute inset-0 z-20 grid animate-pulse place-items-center text-sm text-muted">{t("chart.loading", { pair: inst.label })}</div>}
        {error !== null && <div className="absolute left-1/2 top-4 z-20 -translate-x-1/2 rounded-lg border border-down/40 bg-panel-2 px-3 py-1.5 text-xs text-down">{error || t("chart.dataError")}</div>}
      </div>

      {selected && (
        <SelectedPanel
          d={selected}
          // Editing an AI drawing makes it the user's (just hiding it doesn't).
          onChange={(p) => mutate((all) => all.map((x) => (x.id === selected.id ? ({ ...x, ...p, ...(Object.keys(p).some((k) => k !== "hidden") && { by: "user" }) } as Drawing) : x)))}
          onDelete={() => {
            mutate((all) => all.filter((x) => x.id !== selected.id));
            setSelectedId(null);
          }}
          onClose={() => {
            managerRef.current?.setSelection([]);
            setSelectedId(null);
          }}
        />
      )}
    </div>
  );
}

function LiveBadge({ status, stale }: { status: FeedStatus; stale: boolean }) {
  const { t } = useT();
  const live = status === "live" && !stale;
  const label = t(live ? "chart.live" : status === "connecting" ? "chart.connecting" : stale ? "chart.quiet" : "chart.delayed");
  return (
    <div className={`pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-semibold tracking-wide ${live ? "border-up/40 bg-up/10 text-up" : "border-gold-deep/40 bg-gold-soft text-gold"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${live ? "animate-pulse bg-up" : "bg-gold"}`} />
      {label}
    </div>
  );
}
