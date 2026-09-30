import type { NextRequest } from "next/server";
import { guard } from "@/lib/guard";
import { serverT } from "@/lib/i18n-server";
import { getCandles } from "@/lib/market/data";
import { INTERVALS, type Interval } from "@/lib/market/symbols";

export async function GET(req: NextRequest) {
  const blocked = await guard(req, { bucket: "data", limit: 240 });
  if (blocked) return blocked;
  const symbol = req.nextUrl.searchParams.get("symbol") ?? "XAUUSD";
  const iv = (req.nextUrl.searchParams.get("interval") ?? "1h") as Interval;
  if (!INTERVALS.some((i) => i.id === iv)) return Response.json({ error: "bad interval" }, { status: 400 });
  try {
    const data = await getCandles(symbol, iv);
    return Response.json(data, { headers: { "Cache-Control": "public, s-maxage=5, stale-while-revalidate=30" } });
  } catch (e) {
    const { t } = await serverT();
    return Response.json({ error: t((e as Error).message === "unknown symbol" ? "srv.unknownSymbol" : "srv.marketData") }, { status: 502 });
  }
}
