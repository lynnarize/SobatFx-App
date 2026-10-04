import { getCalendar, getHeadlines } from "@/lib/news";
import { guard } from "@/lib/guard";
import { anyHot } from "@/lib/release-window";

export async function GET(req: Request) {
  const blocked = await guard(req, { bucket: "data", limit: 240 });
  if (blocked) return blocked;
  const [calendar, headlines] = await Promise.all([getCalendar().catch(() => []), getHeadlines().catch(() => [])]);
  // Around a release clients poll every ~15 s, so the CDN mustn't hold a copy for minutes.
  const cc = anyHot(calendar) ? "public, s-maxage=10, stale-while-revalidate=20" : "public, s-maxage=60, stale-while-revalidate=300";
  return Response.json({ calendar, headlines }, { headers: { "Cache-Control": cc } });
}
