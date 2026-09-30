import { cached } from "./cache";

/** USD→IDR rate: Frankfurter (ECB, open source) → open.er-api → USD_IDR_RATE env → 16500. Cached 6h. */
export function getUsdIdr(): Promise<number> {
  return cached("fx:usdidr", 6 * 3600, async () => {
    const sources: [string, (j: Record<string, unknown>) => unknown][] = [
      ["https://api.frankfurter.dev/v1/latest?base=USD&symbols=IDR", (j) => (j.rates as Record<string, number>)?.IDR],
      ["https://open.er-api.com/v6/latest/USD", (j) => (j.rates as Record<string, number>)?.IDR],
    ];
    for (const [url, pick] of sources) {
      try {
        const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(6000) });
        const v = Number(pick(await r.json()));
        if (v > 1000 && v < 100_000) return v;
      } catch {}
    }
    return Number(process.env.USD_IDR_RATE) || 16_500;
  });
}
