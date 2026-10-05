import { getInstrument } from "../market/symbols";
import type { ChatContext } from "./prompt";

// Pro's "plan guardrails": the trade-plan rules' numbers worked out by the app (minimum stop distance, ATR
// buffers, how stretched price is, the nearest levels with their distance in ATR), so the model copies them
// instead of deriving them. Measured with scripts/eval-trade.ts (see APP_LOT in prompt.ts). Pure.

/** Swing levels of one higher timeframe (closed candles), from summarizeTf. */
export interface HtfLevels {
  iv: string;
  highs: number[];
  lows: number[];
}

export function planGuardrails(ctx: ChatContext, htf: HtfLevels[] = []) {
  const ind = ctx.indicators ?? {}, a = Number(ind.ATR14), last = ctx.lastPrice;
  const inst = getInstrument(ctx.symbol);
  if (!inst || !last || !(a > 0) || !ctx.candles?.length) return "";
  const f = (v: number) => +v.toFixed(inst.digits);
  const x = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v / a).toFixed(1)} ATR`;
  const cs = ctx.candles.slice(-5).map((c) => ({ o: c[1]!, h: c[2]!, l: c[3]!, c: c[4]! }));
  const ups = cs.filter((c) => c.c > c.o).length;
  const rising = (k: "h" | "l") => cs.slice(1).filter((c, i) => c[k] > cs[i][k]).length;
  const lv: { p: number; src: string }[] = [
    ...(ctx.swings?.highs ?? []).map((h) => ({ p: h.price, src: `${ctx.interval} swing high` })),
    ...(ctx.swings?.lows ?? []).map((l) => ({ p: l.price, src: `${ctx.interval} swing low` })),
    ...htf.flatMap((t) => [...t.highs.map((p) => ({ p, src: `${t.iv} swing high` })), ...t.lows.map((p) => ({ p, src: `${t.iv} swing low` }))]),
    ...(ind.EMA50 != null ? [{ p: Number(ind.EMA50), src: `${ctx.interval} EMA50` }] : []),
  ];
  // Up to 4 levels each side, nearest first, skipping ones within 0.2 ATR of a level already listed.
  const pick = (above: boolean) => {
    const out: typeof lv = [];
    for (const l of lv.filter((l) => (above ? l.p > last : l.p < last)).sort((p, q) => Math.abs(p.p - last) - Math.abs(q.p - last)))
      if (!out.some((o) => Math.abs(o.p - l.p) < 0.2 * a) && out.length < 4) out.push(l);
    return out.map((l) => `${l.p} (${l.src}, ${x(l.p - last)})`).join(" · ") || "none in range";
  };
  const stretch = ind.EMA20 != null && ind.EMA50 != null ? `Stretch: last price vs EMA20 ${x(last - Number(ind.EMA20))}, vs EMA50 ${x(last - Number(ind.EMA50))} (stretched beyond ±2 ATR). ` : "";
  return [
    `Plan guardrails (computed by the app, ${ctx.interval}): ATR14 = ${a} → minimum SL distance ${f(a)} (1 ATR); structure buffer ≈ ${f(0.25 * a)} (0.25 ATR); TP buffer in front of a level ≈ ${f(0.1 * a)}–${f(0.2 * a)} (0.1–0.2 ATR).`,
    `${stretch}Last ${cs.length} candles: ${ups} up / ${cs.length - ups} down, ${rising("h")}/${cs.length - 1} higher highs, ${rising("l")}/${cs.length - 1} higher lows.`,
    `Nearest levels above ${last}: ${pick(true)}`,
    `Nearest levels below ${last}: ${pick(false)}`,
  ].join("\n");
}
