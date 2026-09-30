"use client";

import { useEffect, useMemo, useRef } from "react";
import { subscribePrice } from "@/lib/market/live";
import { type Candle, type Interval, getInstrument } from "@/lib/market/symbols";
import { entryReached, fillTrade, firstFillInCandles, firstHitInCandles, hitInRange } from "@/lib/paper";
import { useWs } from "../workspace";

// Background engine for demo trading: live prices for the open-trade symbols (and the chart symbol),
// instant fills of pending orders and SL/TP closes on ticks, and a candle catch-up so wicks between
// ticks — or fills and hits while the app was closed — are still caught.

export function PaperEngine() {
  const { paper, symbol, setPrice, closePaperTrade, fillPaperTrade } = useWs();
  const open = useMemo(() => paper.trades.filter((t) => t.closedAt == null), [paper.trades]);
  const openRef = useRef(open);
  const closeRef = useRef(closePaperTrade);
  const fillRef = useRef(fillPaperTrade);
  useEffect(() => {
    openRef.current = open;
    closeRef.current = closePaperTrade;
    fillRef.current = fillPaperTrade;
  });

  const symbols = useMemo(() => [...new Set([symbol, ...open.map((t) => t.symbol)])].sort().join(","), [symbol, open]);

  // Live ticks.
  useEffect(() => {
    const unsubs = symbols.split(",").flatMap((s) => {
      const inst = getInstrument(s);
      if (!inst) return [];
      return [
        subscribePrice(inst, ({ price, time }) => {
          setPrice(s, price);
          for (const t of openRef.current) {
            if (t.symbol !== s) continue;
            if (t.pending) {
              if (entryReached(t, price, price)) fillRef.current(t.id, time);
              continue;
            }
            const hit = hitInRange(t, price, price);
            if (hit) closeRef.current(t.id, price, hit, time);
          }
        }),
      ];
    });
    return () => unsubs.forEach((u) => u());
  }, [symbols, setPrice]);

  // Candle catch-up: on load and every minute.
  const openKey = open.map((t) => t.id).join(",");
  useEffect(() => {
    if (!openKey) return;
    let stop = false;
    const check = async () => {
      for (const t of openRef.current) {
        const ageH = (Date.now() - t.openedAt) / 3_600_000;
        const iv: Interval = ageH < 10 ? "1m" : ageH < 55 ? "5m" : "1h";
        try {
          const j = await fetch(`/api/candles?symbol=${t.symbol}&interval=${iv}`).then((r) => r.json());
          if (stop || !j.candles) return;
          const candles = j.candles as Candle[];
          let live = t;
          if (t.pending) {
            const fill = firstFillInCandles(t, candles);
            if (!fill) continue;
            fillRef.current(t.id, fill.at);
            live = fillTrade(t, fill.at);
          }
          const hit = firstHitInCandles(live, candles);
          if (hit) closeRef.current(t.id, hit.result === "tp" ? t.tp! : t.sl!, hit.result, hit.at);
        } catch {}
      }
    };
    check();
    const timer = window.setInterval(check, 60_000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [openKey]);

  return null;
}
