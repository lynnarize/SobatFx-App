import type { Candle } from "./symbols";

export function ema(values: number[], period: number) {
  const k = 2 / (period + 1);
  const out: (number | null)[] = [];
  let prev: number | null = null;
  values.forEach((v, i) => {
    if (i < period - 1) return out.push(null);
    if (prev === null) prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
    else prev = v * k + prev * (1 - k);
    out.push(prev);
  });
  return out;
}

export function rsi(values: number[], period = 14) {
  if (values.length <= period) return null;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  gain /= period; loss /= period;
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
  }
  return loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
}

export function atr(c: Candle[], period = 14) {
  if (c.length <= period) return null;
  const tr = c.slice(1).map((x, i) => Math.max(x.high - x.low, Math.abs(x.high - c[i].close), Math.abs(x.low - c[i].close)));
  let a = tr.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < tr.length; i++) a = (a * (period - 1) + tr[i]) / period;
  return a;
}

/** Simple swing highs/lows (fractal of `n` bars each side) — used as hints for the AI. */
export function swings(c: Candle[], n = 3) {
  const highs: { time: number; price: number }[] = [];
  const lows: { time: number; price: number }[] = [];
  for (let i = n; i < c.length - n; i++) {
    const win = c.slice(i - n, i + n + 1);
    if (win.every((x) => x.high <= c[i].high)) highs.push({ time: c[i].time, price: c[i].high });
    if (win.every((x) => x.low >= c[i].low)) lows.push({ time: c[i].time, price: c[i].low });
  }
  return { highs: highs.slice(-6), lows: lows.slice(-6) };
}

// ── Extra state features, after FinRL's default set (MACD, Bollinger, DX/ADX) ──

export function macd(values: number[], fast = 12, slow = 26, signal = 9) {
  const f = ema(values, fast), s = ema(values, slow);
  const line = values.map((_, i) => (f[i] != null && s[i] != null ? f[i]! - s[i]! : null)).filter((v): v is number => v != null);
  if (line.length < signal) return null;
  const sig = ema(line, signal).at(-1)!;
  return { macd: line.at(-1)!, signal: sig, hist: line.at(-1)! - sig };
}

export function bollinger(values: number[], period = 20, k = 2) {
  if (values.length < period) return null;
  const w = values.slice(-period);
  const mid = w.reduce((a, b) => a + b, 0) / period;
  const sd = Math.sqrt(w.reduce((a, b) => a + (b - mid) ** 2, 0) / period);
  return { upper: mid + k * sd, mid, lower: mid - k * sd };
}

/** Wilder's ADX: trend strength 0–100 (>25 trending, <20 ranging), direction-agnostic. */
export function adx(c: Candle[], period = 14) {
  if (c.length < period * 2 + 1) return null;
  let tr = 0, pdm = 0, ndm = 0, adxV = 0;
  const dxs: number[] = [];
  for (let i = 1; i < c.length; i++) {
    const up = c[i].high - c[i - 1].high, dn = c[i - 1].low - c[i].low;
    const t = Math.max(c[i].high - c[i].low, Math.abs(c[i].high - c[i - 1].close), Math.abs(c[i].low - c[i - 1].close));
    const p = up > dn && up > 0 ? up : 0, n = dn > up && dn > 0 ? dn : 0;
    if (i <= period) {
      tr += t; pdm += p; ndm += n;
      if (i < period) continue;
    } else {
      tr = tr - tr / period + t; pdm = pdm - pdm / period + p; ndm = ndm - ndm / period + n;
    }
    const pdi = tr ? (100 * pdm) / tr : 0, ndi = tr ? (100 * ndm) / tr : 0;
    const dx = pdi + ndi ? (100 * Math.abs(pdi - ndi)) / (pdi + ndi) : 0;
    dxs.push(dx);
    if (dxs.length === period) adxV = dxs.reduce((a, b) => a + b, 0) / period;
    else if (dxs.length > period) adxV = (adxV * (period - 1) + dx) / period;
  }
  return dxs.length >= period ? adxV : null;
}

/**
 * Turbulence index (FinRL's risk gate, from Kritzman & Li): Mahalanobis distance of today's
 * [log return, log range] from their mean/covariance over the preceding `lookback` bars.
 * High = the market is behaving unlike its recent history (news shock, liquidation cascade).
 * Returns the latest value (3-bar mean) and its percentile within its own recent history.
 * Pass CLOSED candles only — the forming candle's range is incomplete.
 */
export function turbulence(c: Candle[], lookback = 250) {
  if (c.length < 80) return null;
  const feat: [number, number][] = [];
  for (let i = 1; i < c.length; i++) {
    if (!(c[i].close > 0 && c[i - 1].close > 0 && c[i].low > 0)) continue;
    feat.push([Math.log(c[i].close / c[i - 1].close), Math.log(c[i].high / c[i].low)]);
  }
  const lb = Math.min(lookback, Math.floor(feat.length * 0.6));
  const series: number[] = [];
  for (let t = lb; t < feat.length; t++) {
    const win = feat.slice(t - lb, t);
    const m0 = win.reduce((a, x) => a + x[0], 0) / lb, m1 = win.reduce((a, x) => a + x[1], 0) / lb;
    let s00 = 0, s01 = 0, s11 = 0;
    for (const [a, b] of win) {
      s00 += (a - m0) ** 2; s01 += (a - m0) * (b - m1); s11 += (b - m1) ** 2;
    }
    s00 /= lb - 1; s01 /= lb - 1; s11 /= lb - 1;
    const det = s00 * s11 - s01 * s01;
    if (!(det > 0)) continue;
    const d0 = feat[t][0] - m0, d1 = feat[t][1] - m1;
    series.push((d0 * d0 * s11 - 2 * d0 * d1 * s01 + d1 * d1 * s00) / det);
  }
  if (series.length < 20) return null;
  const smooth = series.map((_, i) => (i < 2 ? null : (series[i] + series[i - 1] + series[i - 2]) / 3)).filter((v): v is number => v != null);
  const now = smooth.at(-1)!;
  const pct = (100 * smooth.filter((v) => v <= now).length) / smooth.length;
  return { value: now, pct };
}

export type Regime = "calm" | "normal" | "turbulent";
/** FinRL gates trading above the ~90th percentile of in-sample turbulence. */
export const regimeOf = (pct: number | null | undefined): Regime | null => (pct == null ? null : pct >= 90 ? "turbulent" : pct <= 50 ? "calm" : "normal");
