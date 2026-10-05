import { z } from "zod";
import { readJson } from "@/lib/guard";
import { partnerGate } from "@/lib/partner";
import { getCandles } from "@/lib/market/data";
import { getInstrument, intervalSec } from "@/lib/market/symbols";

// Server-to-server: candles since a time, so the Telegram signal builder can check which TP or SL a
// posted signal reached (its "Rekap" tab). No AI involved.
//
//   POST /api/partner/candles
//   Authorization: Bearer <one of PARTNER_API_KEYS>
//   { "symbol": "XAUUSD", "interval": "15m", "from": 1791090000 }
//
// Returns { symbol, interval, digits, candles: [[time, open, high, low, close], …] } from the candle that
// contains `from` up to now, including the forming candle. Sources keep 500–720 candles, so 15m covers
// about 5 days; `coversFrom` says whether the data reaches back to `from`.

const Body = z.object({
  symbol: z.string().max(20),
  interval: z.enum(["5m", "15m", "1h"]).default("15m"),
  from: z.number().int().positive(),
});

export async function POST(req: Request) {
  // Several symbols are checked per recap, so allow more calls than for the AI levels.
  const gate = await partnerGate(req, "partner-candles", 60);
  if ("error" in gate) return gate.error;

  const raw = await readJson(req, 2048);
  if (!raw.ok) return Response.json({ error: "invalid body" }, { status: raw.status });
  const parsed = Body.safeParse(raw.data);
  if (!parsed.success) return Response.json({ error: "invalid body" }, { status: 400 });
  const { symbol, interval, from } = parsed.data;

  const inst = getInstrument(symbol);
  if (!inst) return Response.json({ error: "unsupported symbol", code: "symbol" }, { status: 422 });

  let all;
  try {
    all = (await getCandles(inst.id, interval)).candles;
  } catch (e) {
    console.error("[partner/candles] market data", (e as Error).message);
    return Response.json({ error: "market data unavailable" }, { status: 502 });
  }
  const step = intervalSec(interval);
  const candles = all.filter((c) => c.time + step > from);
  return Response.json(
    {
      symbol: inst.id,
      interval,
      digits: inst.digits,
      coversFrom: all.length > 0 && all[0].time <= from,
      candles: candles.map((c) => [c.time, c.open, c.high, c.low, c.close]),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
