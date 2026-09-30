import { getCalendar, getHeadlines } from "@/lib/news";
import { guard } from "@/lib/guard";

export async function GET(req: Request) {
  const blocked = await guard(req, { bucket: "data", limit: 240 });
  if (blocked) return blocked;
  const [calendar, headlines] = await Promise.all([getCalendar().catch(() => []), getHeadlines().catch(() => [])]);
  return Response.json({ calendar, headlines }, { headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600" } });
}
