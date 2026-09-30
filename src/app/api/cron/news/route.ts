import { getCalendar } from "@/lib/news";

// Hourly ping from .github/workflows/news-cron.yml, so releases, preview headlines and price
// reactions are recorded even when nobody is using the app (headlines leave the feeds within a
// day, 5-minute candles within ~1.5 days). Set CRON_SECRET to keep others from triggering it.

export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "unauthorized" }, { status: 401 });
  const cal = await getCalendar();
  const now = Date.now();
  return Response.json(
    {
      events: cal.length,
      released: cal.filter((e) => Date.parse(e.time) <= now).length,
      actuals: cal.filter((e) => e.actual).length,
      leans: cal.filter((e) => e.outlook?.lean && Date.parse(e.time) > now).length,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
