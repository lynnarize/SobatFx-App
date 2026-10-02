import { cached } from "./cache";

export interface UsdIdrQuote {
  rate: number;
  /** Where the rate came from (shown in Settings). */
  source: string;
  /** When the source last priced it (ms). */
  at: number;
  /** False when every source failed and the env/default rate is used. */
  live: boolean;
}

const UA = "Mozilla/5.0 (compatible; SobatFX/1.0)";
const sane = (v: number) => v > 1000 && v < 100_000;

async function json(url: string) {
  const r = await fetch(url, { cache: "no-store", headers: { "user-agent": UA }, signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error(`${new URL(url).host} ${r.status}`);
  return r.json();
}

/**
 * Live USD→IDR rate, refreshed every 5 minutes:
 * Yahoo Finance (intraday market rate) → Frankfurter (ECB, daily) → open.er-api (daily) → USD_IDR_RATE env → 16500.
 */
export function getUsdIdrQuote(): Promise<UsdIdrQuote> {
  return cached("fx:usdidr:live", 300, async () => {
    const sources: [string, string, (j: Record<string, unknown>) => { v: unknown; at?: number }][] = [
      [
        "Yahoo Finance",
        "https://query2.finance.yahoo.com/v8/finance/chart/IDR=X?interval=1m&range=1d",
        (j) => {
          const m = (j.chart as { result?: { meta?: { regularMarketPrice?: number; regularMarketTime?: number } }[] })?.result?.[0]?.meta;
          return { v: m?.regularMarketPrice, at: m?.regularMarketTime ? m.regularMarketTime * 1000 : undefined };
        },
      ],
      ["ECB (Frankfurter)", "https://api.frankfurter.dev/v1/latest?base=USD&symbols=IDR", (j) => ({ v: (j.rates as Record<string, number>)?.IDR, at: Date.parse(String(j.date)) || undefined })],
      ["ExchangeRate-API", "https://open.er-api.com/v6/latest/USD", (j) => ({ v: (j.rates as Record<string, number>)?.IDR, at: Number(j.time_last_update_unix) * 1000 || undefined })],
    ];
    for (const [source, url, pick] of sources) {
      try {
        const { v, at } = pick(await json(url));
        const rate = Number(v);
        if (sane(rate)) return { rate: Math.round(rate * 100) / 100, source, at: at ?? Date.now(), live: true };
      } catch {}
    }
    return { rate: Number(process.env.USD_IDR_RATE) || 16_500, source: "default", at: Date.now(), live: false };
  });
}

export async function getUsdIdr(): Promise<number> {
  return (await getUsdIdrQuote()).rate;
}
