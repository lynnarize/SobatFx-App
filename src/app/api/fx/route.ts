import type { NextRequest } from "next/server";
import { getUsdIdrQuote } from "@/lib/fx";
import { guard } from "@/lib/guard";

// Live USD→IDR rate for IDR accounts (risk calculator, position tool, AI lot sizing).
export async function GET(req: NextRequest) {
  const blocked = await guard(req, { bucket: "data", limit: 240 });
  if (blocked) return blocked;
  return Response.json(await getUsdIdrQuote(), { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
}
