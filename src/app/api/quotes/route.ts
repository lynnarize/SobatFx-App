import type { NextRequest } from "next/server";
import { guard } from "@/lib/guard";
import { getCandles } from "@/lib/market/data";
import { INSTRUMENTS } from "@/lib/market/symbols";

// Last price + 24h change for the watchlist, derived from cached 1h candles.
export async function GET(req: NextRequest) {
  const blocked = await guard(req, { bucket: "data", limit: 240 });
  if (blocked) return blocked;
  const ids = (req.nextUrl.searchParams.get("symbols") ?? "").split(",").filter((id) => INSTRUMENTS.some((i) => i.id === id)).slice(0, 15);
  const out = await Promise.all(
    ids.map(async (id) => {
      try {
        const { candles } = await getCandles(id, "1h");
        const last = candles[candles.length - 1];
        const dayAgo = candles.find((c) => c.time >= last.time - 86400) ?? candles[0];
        return { id, price: last.close, change: ((last.close - dayAgo.open) / dayAgo.open) * 100, spark: candles.slice(-24).map((c) => c.close) };
      } catch {
        return { id, price: null, change: null, spark: [] };
      }
    }),
  );
  return Response.json(out, { headers: { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=60" } });
}
