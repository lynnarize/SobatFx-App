// Instruments shown in the app. Client-safe.

export type Kind = "forex" | "metal" | "crypto";
/** Data-source caveat shown under the chart; translated via `note.*` in src/lib/i18n.ts. */
export type SourceNote = "xaut" | "cross" | "backup" | "delayed" | "gcf";
export type Interval = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

export const INTERVALS: { id: Interval; label: string; sec: number }[] = [
  { id: "1m", label: "1m", sec: 60 },
  { id: "5m", label: "5m", sec: 300 },
  { id: "15m", label: "15m", sec: 900 },
  { id: "1h", label: "1H", sec: 3600 },
  { id: "4h", label: "4H", sec: 14400 },
  { id: "1d", label: "1D", sec: 86400 },
];
export const intervalSec = (i: Interval) => INTERVALS.find((x) => x.id === i)!.sec;

export interface Instrument {
  id: string;
  label: string;
  name: string;
  kind: Kind;
  base: string;
  quote: string;
  /** Price move that counts as 1 pip (XAU/USD = 0.10 like most Indonesian brokers; crypto = 1.00 "point"). */
  pip: number;
  /** Units per 1.00 standard lot. */
  contract: number;
  digits: number;
  src: {
    twelve?: string;
    kraken?: string;
    /** Kraken pair used as a stand-in when the real instrument isn't listed there. */
    krakenProxy?: { pair: string; note: SourceNote };
    /** Build from two Kraken pairs multiplied together. */
    krakenCross?: [string, string];
    yahoo?: string;
    binance?: string;
  };
  /** Live WebSocket feed (see live.ts). Matches the candle source so history and ticks agree. */
  live?: { binance?: string; kraken?: string; krakenCross?: [string, string] };
}

export const INSTRUMENTS: Instrument[] = [
  { id: "XAUUSD", label: "XAU/USD", name: "Gold / US Dollar", kind: "metal", base: "XAU", quote: "USD", pip: 0.1, contract: 100, digits: 2,
    src: { twelve: "XAU/USD", krakenProxy: { pair: "XAUTUSD", note: "xaut" }, yahoo: "GC=F" }, live: { kraken: "XAUT/USD" } },
  { id: "EURUSD", label: "EUR/USD", name: "Euro / US Dollar", kind: "forex", base: "EUR", quote: "USD", pip: 0.0001, contract: 100_000, digits: 5, src: { twelve: "EUR/USD", kraken: "EURUSD", yahoo: "EURUSD=X" }, live: { kraken: "EUR/USD" } },
  { id: "GBPUSD", label: "GBP/USD", name: "British Pound / US Dollar", kind: "forex", base: "GBP", quote: "USD", pip: 0.0001, contract: 100_000, digits: 5, src: { twelve: "GBP/USD", kraken: "GBPUSD", yahoo: "GBPUSD=X" }, live: { kraken: "GBP/USD" } },
  { id: "USDJPY", label: "USD/JPY", name: "US Dollar / Japanese Yen", kind: "forex", base: "USD", quote: "JPY", pip: 0.01, contract: 100_000, digits: 3, src: { twelve: "USD/JPY", kraken: "USDJPY", yahoo: "JPY=X" }, live: { kraken: "USD/JPY" } },
  { id: "AUDUSD", label: "AUD/USD", name: "Australian Dollar / US Dollar", kind: "forex", base: "AUD", quote: "USD", pip: 0.0001, contract: 100_000, digits: 5, src: { twelve: "AUD/USD", kraken: "AUDUSD", yahoo: "AUDUSD=X" }, live: { kraken: "AUD/USD" } },
  { id: "USDCAD", label: "USD/CAD", name: "US Dollar / Canadian Dollar", kind: "forex", base: "USD", quote: "CAD", pip: 0.0001, contract: 100_000, digits: 5, src: { twelve: "USD/CAD", kraken: "USDCAD", yahoo: "CAD=X" }, live: { kraken: "USD/CAD" } },
  { id: "USDCHF", label: "USD/CHF", name: "US Dollar / Swiss Franc", kind: "forex", base: "USD", quote: "CHF", pip: 0.0001, contract: 100_000, digits: 5, src: { twelve: "USD/CHF", kraken: "USDCHF", yahoo: "CHF=X" }, live: { kraken: "USD/CHF" } },
  { id: "EURJPY", label: "EUR/JPY", name: "Euro / Japanese Yen", kind: "forex", base: "EUR", quote: "JPY", pip: 0.01, contract: 100_000, digits: 3, src: { twelve: "EUR/JPY", kraken: "EURJPY", yahoo: "EURJPY=X" }, live: { kraken: "EUR/JPY" } },
  { id: "GBPJPY", label: "GBP/JPY", name: "British Pound / Japanese Yen", kind: "forex", base: "GBP", quote: "JPY", pip: 0.01, contract: 100_000, digits: 3, src: { twelve: "GBP/JPY", krakenCross: ["GBPUSD", "USDJPY"], yahoo: "GBPJPY=X" }, live: { krakenCross: ["GBP/USD", "USD/JPY"] } },
  { id: "EURGBP", label: "EUR/GBP", name: "Euro / British Pound", kind: "forex", base: "EUR", quote: "GBP", pip: 0.0001, contract: 100_000, digits: 5, src: { twelve: "EUR/GBP", kraken: "EURGBP", yahoo: "EURGBP=X" }, live: { kraken: "EUR/GBP" } },
  { id: "BTCUSD", label: "BTC/USD", name: "Bitcoin / US Dollar", kind: "crypto", base: "BTC", quote: "USD", pip: 1, contract: 1, digits: 2, src: { binance: "BTCUSDT" }, live: { binance: "BTCUSDT" } },
  { id: "ETHUSD", label: "ETH/USD", name: "Ethereum / US Dollar", kind: "crypto", base: "ETH", quote: "USD", pip: 0.1, contract: 1, digits: 2, src: { binance: "ETHUSDT" }, live: { binance: "ETHUSDT" } },
];

export const DEFAULT_WATCHLIST = ["XAUUSD", "EURUSD", "GBPUSD", "USDJPY", "BTCUSD"];

export function getInstrument(id: string) {
  return INSTRUMENTS.find((i) => i.id === id.toUpperCase());
}

/** Currencies/assets whose news moves this instrument. */
export function newsKeys(i: Instrument) {
  const keys = new Set([i.base, i.quote]);
  if (i.id === "XAUUSD") keys.add("USD");
  if (i.kind === "crypto") keys.add("USD");
  return [...keys];
}

export interface Candle {
  time: number; // unix seconds (UTC)
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}
