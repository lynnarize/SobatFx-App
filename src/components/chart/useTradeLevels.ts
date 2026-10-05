"use client";

import { type IChartApi, type IPriceLine, type ISeriesApi, LineStyle } from "lightweight-charts";
import { type RefObject, useEffect, useRef } from "react";
import type { Instrument } from "@/lib/market/symbols";
import { type PaperTrade, type PendingKind, type Side, exitPrice, tradePips, tradePnl, validateLevels } from "@/lib/paper";

// MetaTrader 5-style trade levels for open demo trades:
//  - drag the SL / TP line to move it,
//  - drag from the entry line to create a TP (towards profit) or SL (towards loss),
//  - drag SL / TP back onto the entry line to remove it,
//  - while dragging, the line shows price · pips · $ P/L and turns grey when the level is invalid.

type Level = "sl" | "tp";
const HIT_PX = 6;
const COLORS = { entry: "#5b8def", sl: "#e0453c", tp: "#22b36b", invalid: "#858077" };

interface Opts {
  box: RefObject<HTMLDivElement | null>;
  chartRef: RefObject<IChartApi | null>;
  seriesRef: RefObject<ISeriesApi<"Candlestick"> | null>;
  trades: PaperTrade[];
  /** Only active while no drawing tool is armed. */
  toolActive: boolean;
  inst: Instrument;
  rates: Record<string, number>;
  livePrice?: number;
  labels: { buy: string; sell: string; pending(side: Side, kind: PendingKind): string };
  onModify(id: string, patch: Partial<Pick<PaperTrade, "sl" | "tp">>): void;
}

const fmt$ = (v: number) => `${v < 0 ? "−" : "+"}$${Math.abs(v).toFixed(2)}`;

export function useTradeLevels(o: Opts) {
  const latest = useRef(o);
  useEffect(() => {
    latest.current = o;
  });
  // Lines per trade so a drag can move them without rebuilding everything.
  const linesRef = useRef(new Map<string, { entry: IPriceLine; sl?: IPriceLine; tp?: IPriceLine }>());

  const title = (x: PaperTrade, kind: "entry" | Level, price: number) => {
    const { inst, rates, labels } = latest.current;
    const name = x.pending ? labels.pending(x.side, x.pending) : x.side === "buy" ? labels.buy : labels.sell;
    const tag = `${name} ${x.lot.toFixed(2)}`;
    if (kind === "entry") return tag;
    const pips = tradePips(x, price, inst);
    return `${kind.toUpperCase()} · ${pips >= 0 ? "+" : ""}${pips.toFixed(1)} pips · ${fmt$(tradePnl(x, price, rates))}`;
  };

  // (Re)build the lines whenever the trades change.
  const { trades, seriesRef } = o;
  useEffect(() => {
    const s = seriesRef.current;
    if (!s) return;
    const map = linesRef.current;
    for (const x of trades) {
      const line = (kind: "entry" | Level, price: number) =>
        s.createPriceLine({
          price,
          color: COLORS[kind],
          lineWidth: kind === "entry" ? 1 : 2,
          lineStyle: kind === "entry" && !x.pending ? LineStyle.Solid : kind === "entry" ? LineStyle.Dotted : LineStyle.Dashed,
          axisLabelVisible: true,
          title: title(x, kind, price),
        });
      map.set(x.id, { entry: line("entry", x.entry), sl: x.sl != null ? line("sl", x.sl) : undefined, tp: x.tp != null ? line("tp", x.tp) : undefined });
    }
    return () => {
      for (const l of map.values()) [l.entry, l.sl, l.tp].forEach((p) => p && s.removePriceLine(p));
      map.clear();
    };
    // title() reads the latest labels/rates through a ref.
     
  }, [trades, seriesRef]);

  // Mouse / touch dragging.
  useEffect(() => {
    const el = o.box.current;
    if (!el) return;
    let drag: { trade: PaperTrade; from: "entry" | Level; target: Level | null; price: number; preview?: IPriceLine } | null = null;
    let cursorSet = false;

    const point = (clientX: number, clientY: number) => {
      const chart = latest.current.chartRef.current;
      if (!chart) return null;
      const r = el.getBoundingClientRect();
      const x = clientX - r.left, y = clientY - r.top;
      if (x < 0 || y < 0 || x > chart.timeScale().width() || y > r.height - chart.timeScale().height()) return null;
      return { x, y };
    };
    const yOf = (p: number) => latest.current.seriesRef.current?.priceToCoordinate(p) ?? null;

    const hitAt = (y: number) => {
      // SL/TP first (they are what people drag most), then the entry line.
      for (const kind of ["sl", "tp", "entry"] as const)
        for (const t of latest.current.trades) {
          const price = kind === "entry" ? t.entry : t[kind];
          const ly = price != null ? yOf(price) : null;
          if (ly != null && Math.abs(ly - y) <= HIT_PX) return { trade: t, from: kind };
        }
      return null;
    };

    const levelFor = (t: PaperTrade, price: number): Level => ((price > t.entry) === (t.side === "buy") ? "tp" : "sl");
    const valid = (t: PaperTrade, target: Level, price: number) => {
      // A pending order's levels are judged against its own entry; an open trade's against the price it would close at now.
      const { livePrice } = latest.current;
      const [ref, spread] = t.pending ? [t.entry, t.spread] : [livePrice != null ? exitPrice(t, livePrice) : t.entry, 0];
      return validateLevels(t.side, ref, target === "sl" ? price : undefined, target === "tp" ? price : undefined, spread) === null;
    };

    const start = (clientX: number, clientY: number, e: Event) => {
      // A drawing under the pointer already claimed this press (the drawing manager calls preventDefault).
      if (latest.current.toolActive || e.defaultPrevented) return;
      const p = point(clientX, clientY);
      const h = p && hitAt(p.y);
      if (!h) return;
      // Take the gesture over so the chart doesn't pan underneath.
      e.preventDefault();
      e.stopPropagation();
      drag = { trade: h.trade, from: h.from, target: h.from === "entry" ? null : h.from, price: h.from === "entry" ? h.trade.entry : h.trade[h.from]! };
      el.style.cursor = "ns-resize";
    };

    const move = (clientX: number, clientY: number, e?: Event) => {
      const p = point(clientX, clientY);
      if (!drag) {
        // Hover feedback only when over a trade line; leave the cursor alone otherwise.
        const over = p && !latest.current.toolActive && hitAt(p.y);
        if (over) {
          el.style.cursor = "ns-resize";
          cursorSet = true;
        } else if (cursorSet) {
          el.style.cursor = "";
          cursorSet = false;
        }
        return;
      }
      e?.preventDefault();
      if (!p) return;
      const s = latest.current.seriesRef.current;
      const raw = s?.coordinateToPrice(p.y);
      if (!s || raw == null) return;
      const { trade } = drag;
      const price = +(+raw).toFixed(latest.current.inst.digits);
      const target = drag.from === "entry" ? levelFor(trade, price) : drag.from;
      drag.price = price;
      drag.target = target;
      const lines = linesRef.current.get(trade.id);
      const existing = drag.from !== "entry" ? lines?.[drag.from] : undefined;
      const line = existing ?? (drag.preview ??= s.createPriceLine({ price, color: COLORS[target], lineWidth: 2, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "" }));
      const ok = valid(trade, target, price);
      line.applyOptions({ price, color: ok ? COLORS[target] : COLORS.invalid, title: ok ? title(trade, target, price) : `${target.toUpperCase()} ✕` });
    };

    const end = (cancel = false) => {
      if (!drag) return;
      const d = drag;
      drag = null;
      el.style.cursor = "";
      const s = latest.current.seriesRef.current;
      if (d.preview && s) s.removePriceLine(d.preview);
      const target = d.target;
      const entryY = yOf(d.trade.entry), y = yOf(d.price);
      const reset = () => {
        // Put a moved SL/TP line back where it was.
        const l = d.from !== "entry" ? linesRef.current.get(d.trade.id)?.[d.from] : undefined;
        const orig = d.from !== "entry" ? d.trade[d.from] : undefined;
        if (l && orig != null) l.applyOptions({ price: orig, color: COLORS[d.from as Level], title: title(d.trade, d.from as Level, orig) });
      };
      if (cancel || !target) return reset();
      // Dropped back on the entry line → remove that level (MT5 behaviour).
      if (entryY != null && y != null && Math.abs(entryY - y) <= HIT_PX && d.from !== "entry") return latest.current.onModify(d.trade.id, { [d.from]: undefined });
      if (!valid(d.trade, target, d.price)) return reset();
      latest.current.onModify(d.trade.id, { [target]: d.price });
    };

    const onMouseDown = (e: MouseEvent) => e.button === 0 && start(e.clientX, e.clientY, e);
    const onMouseMove = (e: MouseEvent) => move(e.clientX, e.clientY, e);
    const onMouseUp = () => end();
    const onTouchStart = (e: TouchEvent) => e.touches.length === 1 && start(e.touches[0].clientX, e.touches[0].clientY, e);
    const onTouchMove = (e: TouchEvent) => drag && e.touches.length === 1 && move(e.touches[0].clientX, e.touches[0].clientY, e);
    const onTouchEnd = () => end();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && end(true);

    el.addEventListener("mousedown", onMouseDown, true);
    el.addEventListener("touchstart", onTouchStart, { capture: true, passive: false });
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("keydown", onKey);
    return () => {
      el.removeEventListener("mousedown", onMouseDown, true);
      el.removeEventListener("touchstart", onTouchStart, true);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("keydown", onKey);
    };
    // Everything live is read through `latest`; attach once per chart box.
     
  }, [o.box]);
}
