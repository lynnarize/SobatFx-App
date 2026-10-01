import { cached } from "../cache";
import { type Candle, type Instrument, type Interval, type LiveVenue, type SourceNote, getInstrument, intervalSec } from "./symbols";

// Server-side candle fetching. Sources (all free/public):
//  - Binance public market-data mirror (data-api.binance.vision) for crypto
//  - Gold perps tracking spot XAU/USD: Binance USDⓈ-M XAUUSDT → OKX XAU-USDT-SWAP → Hyperliquid xyz:GOLD.
//    Binance and OKX refuse some regions (e.g. US servers), hence the chain.
//  - Twelve Data (optional free key) for FX + real XAU/USD
//  - Kraken public OHLC for FX majors (no key)
//  - Yahoo chart API as last resort

const UA = "Mozilla/5.0 (compatible; SobatFX/1.0)";

export interface CandleResult {
  candles: Candle[];
  source: string;
  note?: SourceNote;
  /** Live venue whose stream matches these candles (the browser switches to it). */
  feed?: LiveVenue;
}

async function getJSON(url: string, body?: unknown) {
  const r = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: { "user-agent": UA, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`${new URL(url).host} ${r.status}`);
  return r.json();
}

async function binance(sym: string, iv: Interval, futures = false): Promise<Candle[]> {
  const url = futures
    ? `https://fapi.binance.com/fapi/v1/klines?symbol=${sym}&interval=${iv}&limit=500`
    : `https://data-api.binance.vision/api/v3/klines?symbol=${sym}&interval=${iv}&limit=500`;
  const rows: unknown[][] = await getJSON(url);
  return rows.map((k) => ({ time: Math.floor(Number(k[0]) / 1000), open: +k[1]!, high: +k[2]!, low: +k[3]!, close: +k[4]!, volume: +k[5]! }));
}

// OKX bars are aligned to Hong Kong time (UTC+8): fine for 4H, but the day needs the UTC variant.
const OKX_IV: Record<Interval, string> = { "1m": "1m", "5m": "5m", "15m": "15m", "1h": "1H", "4h": "4H", "1d": "1Dutc" };
async function okx(instId: string, iv: Interval): Promise<Candle[]> {
  const j = await getJSON(`https://www.okx.com/api/v5/market/candles?instId=${instId}&bar=${OKX_IV[iv]}&limit=300`);
  if (j.code !== "0") throw new Error(`okx ${j.code} ${j.msg}`);
  // Newest first: [ts, o, h, l, c, vol (contracts), volCcy (base), volCcyQuote, confirm]
  return (j.data as string[][]).map((k) => ({ time: Math.floor(+k[0]! / 1000), open: +k[1]!, high: +k[2]!, low: +k[3]!, close: +k[4]!, volume: +k[6]! })).reverse();
}

async function hyperliquid(coin: string, iv: Interval): Promise<Candle[]> {
  const end = Date.now();
  const rows: { t: number; o: string; h: string; l: string; c: string; v: string }[] = await getJSON("https://api.hyperliquid.xyz/info", {
    type: "candleSnapshot",
    req: { coin, interval: iv, startTime: end - 500 * intervalSec(iv) * 1000, endTime: end },
  });
  return rows.map((k) => ({ time: Math.floor(k.t / 1000), open: +k.o, high: +k.h, low: +k.l, close: +k.c, volume: +k.v }));
}

const KRAKEN_IV: Record<Interval, number> = { "1m": 1, "5m": 5, "15m": 15, "1h": 60, "4h": 240, "1d": 1440 };
async function kraken(pair: string, iv: Interval): Promise<Candle[]> {
  const j = await getJSON(`https://api.kraken.com/0/public/OHLC?pair=${pair}&interval=${KRAKEN_IV[iv]}`);
  if (j.error?.length) throw new Error(`kraken ${j.error.join(",")}`);
  const key = Object.keys(j.result).find((k) => k !== "last")!;
  const rows: unknown[][] = j.result[key];
  // Kraken includes the still-forming candle last, like the others.
  return rows.map((k) => ({ time: Number(k[0]), open: +k[1]!, high: +k[2]!, low: +k[3]!, close: +k[4]!, volume: +k[6]! }));
}

async function krakenCross(a: string, b: string, iv: Interval): Promise<Candle[]> {
  const [ca, cb] = await Promise.all([kraken(a, iv), kraken(b, iv)]);
  const mb = new Map(cb.map((c) => [c.time, c]));
  return ca.flatMap((x) => {
    const y = mb.get(x.time);
    if (!y) return [];
    const open = x.open * y.open, close = x.close * y.close;
    // High/low of a product aren't exactly the product of highs/lows; clamp to stay consistent.
    return [{ time: x.time, open, close, high: Math.max(x.high * y.high, open, close), low: Math.min(x.low * y.low, open, close) }];
  });
}

const TWELVE_IV: Record<Interval, string> = { "1m": "1min", "5m": "5min", "15m": "15min", "1h": "1h", "4h": "4h", "1d": "1day" };
async function twelve(sym: string, iv: Interval): Promise<Candle[]> {
  const key = process.env.TWELVEDATA_API_KEY;
  const j = await getJSON(
    `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(sym)}&interval=${TWELVE_IV[iv]}&outputsize=500&timezone=UTC&apikey=${key}`,
  );
  if (j.status === "error") throw new Error(`twelvedata ${j.code}`);
  return (j.values as Record<string, string>[])
    .map((v) => ({ time: Math.floor(Date.parse(v.datetime.replace(" ", "T") + "Z") / 1000), open: +v.open, high: +v.high, low: +v.low, close: +v.close }))
    .reverse();
}

const YAHOO: Record<Interval, [string, string]> = { "1m": ["1m", "5d"], "5m": ["5m", "1mo"], "15m": ["15m", "1mo"], "1h": ["60m", "3mo"], "4h": ["60m", "6mo"], "1d": ["1d", "2y"] };
async function yahoo(sym: string, iv: Interval): Promise<Candle[]> {
  const [yi, range] = YAHOO[iv];
  const j = await getJSON(`https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=${yi}&range=${range}`);
  const r = j.chart?.result?.[0];
  if (!r) throw new Error("yahoo empty");
  const q = r.indicators.quote[0];
  const out: Candle[] = [];
  r.timestamp.forEach((t: number, i: number) => {
    if (q.open[i] == null || q.close[i] == null) return;
    out.push({ time: t, open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i], volume: q.volume?.[i] ?? undefined });
  });
  return iv === "4h" ? aggregate(out, 14400) : out;
}

function aggregate(c: Candle[], sec: number): Candle[] {
  const out: Candle[] = [];
  for (const x of c) {
    const t = Math.floor(x.time / sec) * sec;
    const last = out[out.length - 1];
    if (last && last.time === t) {
      last.high = Math.max(last.high, x.high);
      last.low = Math.min(last.low, x.low);
      last.close = x.close;
      last.volume = (last.volume ?? 0) + (x.volume ?? 0);
    } else out.push({ ...x, time: t });
  }
  return out;
}

async function load(inst: Instrument, iv: Interval): Promise<CandleResult> {
  const s = inst.src;
  const tries: [string, () => Promise<Candle[]>, SourceNote?, LiveVenue?][] = [];
  // Streamable sources first so the live WebSocket ticks (live.ts) extend the same series.
  if (s.binance) tries.push(["Binance", () => binance(s.binance!, iv), undefined, "binance"]);
  if (s.binanceFutures) tries.push(["Binance Futures", () => binance(s.binanceFutures!, iv, true), "perp", "binanceFutures"]);
  if (s.okx) tries.push(["OKX", () => okx(s.okx!, iv), "perp", "okx"]);
  if (s.hyperliquid) tries.push(["Hyperliquid", () => hyperliquid(s.hyperliquid!, iv), "perp", "hyperliquid"]);
  if (s.kraken) tries.push(["Kraken", () => kraken(s.kraken!, iv), undefined, "kraken"]);
  if (s.krakenCross) tries.push(["Kraken (cross)", () => krakenCross(s.krakenCross![0], s.krakenCross![1], iv), "cross", "kraken"]);
  if (s.krakenProxy) tries.push(["Kraken XAUT", () => kraken(s.krakenProxy!.pair, iv), s.krakenProxy.note, "kraken"]);
  if (s.twelve && process.env.TWELVEDATA_API_KEY) tries.push(["Twelve Data", () => twelve(s.twelve!, iv), "backup"]);
  if (s.yahoo) tries.push(["Yahoo", () => yahoo(s.yahoo!, iv), s.yahoo === "GC=F" ? "gcf" : "delayed"]);

  let lastErr: unknown;
  for (const [source, fn, note, feed] of tries) {
    try {
      const candles = (await fn()).filter((c) => Number.isFinite(c.close));
      if (candles.length > 20) return { candles, source, note, feed };
    } catch (e) {
      lastErr = e;
      console.warn(`[candles] ${inst.id} ${iv} via ${source} failed:`, (e as Error).message);
    }
  }
  throw lastErr ?? new Error("no data source");
}

export function getCandles(id: string, iv: Interval) {
  const inst = getInstrument(id);
  if (!inst) throw new Error("unknown symbol");
  // Live ticks come over WebSockets; REST is for history + reconciliation, so keep it fresh but cheap.
  const ttl = Math.min(15, Math.max(3, intervalSec(iv) / 60));
  return cached(`candles:${inst.id}:${iv}`, ttl, () => load(inst, iv));
}
