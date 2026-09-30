import type { Candle, Instrument, Interval } from "./symbols";

// Browser-side live prices over public WebSockets (no keys):
//  - Binance market-data stream for crypto (kline + 24h mini ticker)
//  - Kraken v2 ticker (best bid/offer events) for FX and XAUT gold
// One shared socket per venue; subscriptions are ref-counted and restored on reconnect.

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
const statuses: Record<string, FeedStatus> = { binance: "offline", kraken: "offline" };
function setStatus(venue: "binance" | "kraken", s: FeedStatus) {
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
  constructor(protected venue: "binance" | "kraken", private url: string) {}

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
      this.onOpen();
    };
    ws.onmessage = (e) => {
      try {
        this.onMessage(JSON.parse(e.data as string));
      } catch {}
    };
    ws.onclose = () => {
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
  constructor() {
    super("binance", "wss://data-stream.binance.vision/stream");
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

let kraken: Kraken | null = null;
let binance: Binance | null = null;
const K = () => (kraken ??= new Kraken());
const B = () => (binance ??= new Binance());

export function venueOf(inst: Instrument): "binance" | "kraken" | null {
  if (inst.live?.binance) return "binance";
  if (inst.live?.kraken || inst.live?.krakenCross) return "kraken";
  return null;
}

/** Live mid/last price for an instrument. Returns an unsubscribe function. */
export function subscribePrice(inst: Instrument, fn: Fn<Tick>): () => void {
  const l = inst.live;
  if (!l || typeof window === "undefined") return () => {};
  if (l.binance) return B().subscribeTicker(l.binance, fn);
  if (l.kraken) return K().subscribe(l.kraken, fn);
  if (l.krakenCross) {
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

/** Exact exchange candles (crypto only). Returns null when the venue has no candle stream. */
export function subscribeCandles(inst: Instrument, iv: Interval, fn: Fn<{ candle: Candle; closed: boolean }>): (() => void) | null {
  if (!inst.live?.binance || typeof window === "undefined") return null;
  return B().subscribeKline(inst.live.binance, iv, fn);
}

export function feedStatus(venue: "binance" | "kraken") {
  return statuses[venue];
}
export function subscribeStatus(venue: "binance" | "kraken", fn: Fn<FeedStatus>) {
  statusBus.on(venue, fn);
  return () => void statusBus.off(venue, fn);
}
