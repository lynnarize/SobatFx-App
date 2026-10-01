import type { Candle, Instrument, Interval, LiveVenue } from "./symbols";

// Browser-side live prices over public WebSockets (no keys):
//  - Binance market-data stream for crypto (kline + 24h mini ticker)
//  - Binance USDⓈ-M futures market stream for the XAUUSDT gold perp (kline + 24h mini ticker)
//  - OKX public tickers (bid/ask mid) for the XAU-USDT-SWAP gold perp
//  - Hyperliquid candles + asset context (mid) for the xyz:GOLD perp
//  - Kraken v2 ticker (best bid/offer events) for FX, and XAUT gold as a last resort
// One shared socket per venue; subscriptions are ref-counted and restored on reconnect.
// An instrument with several venues streams from one at a time: the first listed, or the one
// /api/candles last served (setVenue), so live ticks extend the same series as the history.

export interface Tick {
  price: number;
  /** ms epoch when received */
  time: number;
  /** rolling 24h change in % when the venue provides it */
  change24?: number;
}
export type FeedStatus = "connecting" | "live" | "offline";
type Fn<T> = (v: T) => void;

class Emitter<T> {
  private m = new Map<string, Set<Fn<T>>>();
  on(key: string, fn: Fn<T>) {
    const set = this.m.get(key) ?? new Set();
    set.add(fn);
    this.m.set(key, set);
    return set.size === 1; // first listener for this key
  }
  off(key: string, fn: Fn<T>) {
    const set = this.m.get(key);
    set?.delete(fn);
    if (set && !set.size) {
      this.m.delete(key);
      return true; // last listener gone
    }
    return false;
  }
  emit(key: string, v: T) {
    this.m.get(key)?.forEach((f) => f(v));
  }
  keys() {
    return [...this.m.keys()];
  }
}

const statusBus = new Emitter<FeedStatus>();
const statuses: Record<LiveVenue, FeedStatus> = { binance: "offline", binanceFutures: "offline", okx: "offline", hyperliquid: "offline", kraken: "offline" };
function setStatus(venue: LiveVenue, s: FeedStatus) {
  if (statuses[venue] === s) return;
  statuses[venue] = s;
  statusBus.emit(venue, s);
}

/** Reconnecting WebSocket with exponential backoff; closes itself when idle. */
abstract class Venue {
  protected ws: WebSocket | null = null;
  private retry = 0;
  private timer: number | null = null;
  private idleTimer: number | null = null;
  private pingTimer: number | null = null;
  /** `ping`: message sent every 25s for venues that drop quiet connections (OKX, Hyperliquid). */
  constructor(
    protected venue: LiveVenue,
    private url: string,
    private ping?: string,
  ) {}

  protected abstract onOpen(): void;
  protected abstract onMessage(data: unknown): void;
  protected abstract hasSubscriptions(): boolean;

  protected ensure() {
    if (this.idleTimer) {
      window.clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) return;
    if (this.timer) return;
    setStatus(this.venue, "connecting");
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      setStatus(this.venue, "live");
      if (this.ping) this.pingTimer = window.setInterval(() => ws.send(this.ping!), 25_000);
      this.onOpen();
    };
    ws.onmessage = (e) => {
      try {
        this.onMessage(JSON.parse(e.data as string));
      } catch {}
    };
    ws.onclose = () => {
      if (this.pingTimer) window.clearInterval(this.pingTimer);
      this.pingTimer = null;
      if (this.ws !== ws) return;
      this.ws = null;
      setStatus(this.venue, "offline");
      if (!this.hasSubscriptions()) return;
      const wait = Math.min(30_000, 1000 * 2 ** this.retry++);
      this.timer = window.setTimeout(() => {
        this.timer = null;
        if (this.hasSubscriptions()) this.ensure();
      }, wait);
    };
    ws.onerror = () => ws.close();
  }

  protected send(msg: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  protected maybeIdle() {
    if (this.hasSubscriptions() || this.idleTimer) return;
    // Keep the socket briefly so quick symbol switches don't reconnect.
    this.idleTimer = window.setTimeout(() => {
      this.idleTimer = null;
      if (!this.hasSubscriptions()) {
        const ws = this.ws;
        this.ws = null;
        ws?.close();
        setStatus(this.venue, "offline");
      }
    }, 15_000);
  }
}

// ── Kraken ─────────────────────────────────────────────────────────────────
class Kraken extends Venue {
  private bus = new Emitter<Tick>();
  constructor() {
    super("kraken", "wss://ws.kraken.com/v2");
  }
  protected hasSubscriptions() {
    return this.bus.keys().length > 0;
  }
  protected onOpen() {
    const symbols = this.bus.keys();
    if (symbols.length) this.send({ method: "subscribe", params: { channel: "ticker", symbol: symbols, event_trigger: "bbo" } });
  }
  protected onMessage(m: { channel?: string; data?: { symbol: string; bid: number; ask: number; last: number; change_pct?: number }[] }) {
    if (m.channel !== "ticker" || !m.data) return;
    const now = Date.now();
    for (const d of m.data) {
      const mid = (d.bid + d.ask) / 2;
      // Thin books (e.g. Kraken USD/JPY) can show absurd spreads — fall back to last trade then.
      const price = d.bid > 0 && d.ask > 0 && (d.ask - d.bid) / mid < 0.0008 ? mid : d.last;
      if (price > 0) this.bus.emit(d.symbol, { price, time: now, change24: d.change_pct });
    }
  }
  subscribe(symbol: string, fn: Fn<Tick>) {
    if (this.bus.on(symbol, fn)) this.send({ method: "subscribe", params: { channel: "ticker", symbol: [symbol], event_trigger: "bbo" } });
    this.ensure();
    return () => {
      if (this.bus.off(symbol, fn)) this.send({ method: "unsubscribe", params: { channel: "ticker", symbol: [symbol], event_trigger: "bbo" } });
      this.maybeIdle();
    };
  }
}

// ── Binance ────────────────────────────────────────────────────────────────
interface BinanceKline {
  t: number;
  o: string;
  h: string;
  l: string;
  c: string;
  v: string;
  x: boolean;
}
class Binance extends Venue {
  private ticks = new Emitter<Tick>();
  private klines = new Emitter<{ candle: Candle; closed: boolean }>();
  private id = 1;
  constructor(venue: "binance" | "binanceFutures", url: string) {
    super(venue, url);
  }
  protected hasSubscriptions() {
    return this.ticks.keys().length + this.klines.keys().length > 0;
  }
  protected onOpen() {
    const params = [...this.ticks.keys(), ...this.klines.keys()];
    if (params.length) this.send({ method: "SUBSCRIBE", params, id: this.id++ });
  }
  protected onMessage(m: { stream?: string; data?: { e: string; c?: string; o?: string; k?: BinanceKline } }) {
    if (!m.stream || !m.data) return;
    const d = m.data;
    if (d.e === "24hrMiniTicker" && d.c && d.o) {
      const c = +d.c, o = +d.o;
      this.ticks.emit(m.stream, { price: c, time: Date.now(), change24: ((c - o) / o) * 100 });
    } else if (d.e === "kline" && d.k) {
      const k = d.k;
      this.klines.emit(m.stream, { candle: { time: Math.floor(k.t / 1000), open: +k.o, high: +k.h, low: +k.l, close: +k.c, volume: +k.v }, closed: k.x });
    }
  }
  private sub<T>(bus: Emitter<T>, stream: string, fn: Fn<T>) {
    if (bus.on(stream, fn)) this.send({ method: "SUBSCRIBE", params: [stream], id: this.id++ });
    this.ensure();
    return () => {
      if (bus.off(stream, fn)) this.send({ method: "UNSUBSCRIBE", params: [stream], id: this.id++ });
      this.maybeIdle();
    };
  }
  subscribeTicker(sym: string, fn: Fn<Tick>) {
    return this.sub(this.ticks, `${sym.toLowerCase()}@miniTicker`, fn);
  }
  subscribeKline(sym: string, iv: Interval, fn: Fn<{ candle: Candle; closed: boolean }>) {
    return this.sub(this.klines, `${sym.toLowerCase()}@kline_${iv}`, fn);
  }
}

// ── OKX ────────────────────────────────────────────────────────────────────
class Okx extends Venue {
  private bus = new Emitter<Tick>();
  constructor() {
    super("okx", "wss://ws.okx.com:8443/ws/v5/public", "ping");
  }
  protected hasSubscriptions() {
    return this.bus.keys().length > 0;
  }
  protected onOpen() {
    const ids = this.bus.keys();
    if (ids.length) this.send({ op: "subscribe", args: ids.map((instId) => ({ channel: "tickers", instId })) });
  }
  protected onMessage(m: { arg?: { channel: string }; data?: { instId: string; last: string; bidPx: string; askPx: string; open24h: string }[] }) {
    if (m.arg?.channel !== "tickers" || !m.data) return;
    const now = Date.now();
    for (const d of m.data) {
      const bid = +d.bidPx, ask = +d.askPx, last = +d.last, open = +d.open24h;
      const price = bid > 0 && ask > 0 ? (bid + ask) / 2 : last;
      if (price > 0) this.bus.emit(d.instId, { price, time: now, change24: open > 0 ? ((last - open) / open) * 100 : undefined });
    }
  }
  subscribe(instId: string, fn: Fn<Tick>) {
    if (this.bus.on(instId, fn)) this.send({ op: "subscribe", args: [{ channel: "tickers", instId }] });
    this.ensure();
    return () => {
      if (this.bus.off(instId, fn)) this.send({ op: "unsubscribe", args: [{ channel: "tickers", instId }] });
      this.maybeIdle();
    };
  }
}

// ── Hyperliquid ────────────────────────────────────────────────────────────
type HlSub = { type: "activeAssetCtx"; coin: string } | { type: "candle"; coin: string; interval: Interval };
class Hyperliquid extends Venue {
  private ticks = new Emitter<Tick>();
  private candles = new Emitter<{ candle: Candle; closed: boolean }>();
  constructor() {
    super("hyperliquid", "wss://api.hyperliquid.xyz/ws", JSON.stringify({ method: "ping" }));
  }
  protected hasSubscriptions() {
    return this.ticks.keys().length + this.candles.keys().length > 0;
  }
  private subs(): HlSub[] {
    return [
      ...this.ticks.keys().map((coin) => ({ type: "activeAssetCtx" as const, coin })),
      ...this.candles.keys().map((k) => {
        const [coin, interval] = k.split("|") as [string, Interval];
        return { type: "candle" as const, coin, interval };
      }),
    ];
  }
  protected onOpen() {
    for (const subscription of this.subs()) this.send({ method: "subscribe", subscription });
  }
  protected onMessage(m: { channel?: string; data?: Record<string, unknown> }) {
    const d = m.data;
    if (!d) return;
    if (m.channel === "activeAssetCtx") {
      const ctx = d.ctx as { midPx?: string | null; markPx: string; prevDayPx: string };
      const price = +(ctx.midPx ?? ctx.markPx), prev = +ctx.prevDayPx;
      if (price > 0) this.ticks.emit(d.coin as string, { price, time: Date.now(), change24: prev > 0 ? ((price - prev) / prev) * 100 : undefined });
    } else if (m.channel === "candle") {
      const k = d as { t: number; T: number; s: string; i: string; o: string; h: string; l: string; c: string; v: string };
      this.candles.emit(`${k.s}|${k.i}`, {
        candle: { time: Math.floor(k.t / 1000), open: +k.o, high: +k.h, low: +k.l, close: +k.c, volume: +k.v },
        closed: Date.now() > k.T,
      });
    }
  }
  private sub<T>(bus: Emitter<T>, key: string, subscription: HlSub, fn: Fn<T>) {
    if (bus.on(key, fn)) this.send({ method: "subscribe", subscription });
    this.ensure();
    return () => {
      if (bus.off(key, fn)) this.send({ method: "unsubscribe", subscription });
      this.maybeIdle();
    };
  }
  subscribeTicker(coin: string, fn: Fn<Tick>) {
    return this.sub(this.ticks, coin, { type: "activeAssetCtx", coin }, fn);
  }
  subscribeCandle(coin: string, interval: Interval, fn: Fn<{ candle: Candle; closed: boolean }>) {
    return this.sub(this.candles, `${coin}|${interval}`, { type: "candle", coin, interval }, fn);
  }
}

let kraken: Kraken | null = null;
let binance: Binance | null = null;
let binanceFutures: Binance | null = null;
let okx: Okx | null = null;
let hyperliquid: Hyperliquid | null = null;
const K = () => (kraken ??= new Kraken());
const B = () => (binance ??= new Binance("binance", "wss://data-stream.binance.vision/stream"));
// Futures market data (kline, tickers) is only served on the /market path; the legacy /stream path stays silent.
const BF = () => (binanceFutures ??= new Binance("binanceFutures", "wss://fstream.binance.com/market/stream"));
const O = () => (okx ??= new Okx());
const H = () => (hyperliquid ??= new Hyperliquid());

// ── Which venue an instrument streams from ─────────────────────────────────
const ORDER: LiveVenue[] = ["binance", "binanceFutures", "okx", "hyperliquid", "kraken"];
const active = new Map<string, LiveVenue>();
const activeBus = new Emitter<LiveVenue>();

function venuesOf(inst: Instrument) {
  const l = inst.live;
  if (!l) return [];
  return ORDER.filter((v) => (v === "kraken" ? l.kraken || l.krakenCross : l[v]));
}

export function venueOf(inst: Instrument): LiveVenue | null {
  return active.get(inst.id) ?? venuesOf(inst)[0] ?? null;
}

/** Stream this instrument from `venue` (the one its candles came from). Ignored if it isn't one of its venues. */
export function setVenue(inst: Instrument, venue: LiveVenue | undefined) {
  if (!venue || venueOf(inst) === venue || !venuesOf(inst).includes(venue)) return;
  active.set(inst.id, venue);
  activeBus.emit(inst.id, venue);
}

export function subscribeVenue(inst: Instrument, fn: Fn<LiveVenue>) {
  activeBus.on(inst.id, fn);
  return () => void activeBus.off(inst.id, fn);
}

function priceOn(inst: Instrument, venue: LiveVenue | null, fn: Fn<Tick>): () => void {
  const l = inst.live!;
  if (venue === "binance") return B().subscribeTicker(l.binance!, fn);
  if (venue === "binanceFutures") return BF().subscribeTicker(l.binanceFutures!, fn);
  if (venue === "okx") return O().subscribe(l.okx!, fn);
  if (venue === "hyperliquid") return H().subscribeTicker(l.hyperliquid!, fn);
  if (venue === "kraken" && l.kraken) return K().subscribe(l.kraken, fn);
  if (venue === "kraken" && l.krakenCross) {
    // e.g. GBP/JPY = GBP/USD × USD/JPY
    const [a, b] = l.krakenCross;
    let pa: Tick | null = null, pb: Tick | null = null;
    const emit = () => pa && pb && fn({ price: pa.price * pb.price, time: Date.now() });
    const ua = K().subscribe(a, (t) => ((pa = t), emit()));
    const ub = K().subscribe(b, (t) => ((pb = t), emit()));
    return () => {
      ua();
      ub();
    };
  }
  return () => {};
}

/** Live mid/last price for an instrument; follows setVenue switches. Returns an unsubscribe function. */
export function subscribePrice(inst: Instrument, fn: Fn<Tick>): () => void {
  if (!inst.live || typeof window === "undefined") return () => {};
  let off = priceOn(inst, venueOf(inst), fn);
  const offVenue = subscribeVenue(inst, (v) => {
    off();
    off = priceOn(inst, v, fn);
  });
  return () => {
    offVenue();
    off();
  };
}

/** Exact exchange candles from the current venue. Returns null when it has no candle stream (build bars from ticks). */
export function subscribeCandles(inst: Instrument, iv: Interval, fn: Fn<{ candle: Candle; closed: boolean }>): (() => void) | null {
  const l = inst.live;
  if (!l || typeof window === "undefined") return null;
  const venue = venueOf(inst);
  if (venue === "binance") return B().subscribeKline(l.binance!, iv, fn);
  if (venue === "binanceFutures") return BF().subscribeKline(l.binanceFutures!, iv, fn);
  if (venue === "hyperliquid") return H().subscribeCandle(l.hyperliquid!, iv, fn);
  return null;
}

export function feedStatus(venue: LiveVenue) {
  return statuses[venue];
}
export function subscribeStatus(venue: LiveVenue, fn: Fn<FeedStatus>) {
  statusBus.on(venue, fn);
  return () => void statusBus.off(venue, fn);
}
