import { guard, readJson } from "@/lib/guard";
import { isOrderId, syncOrder, validNotificationSignature } from "@/lib/payments";

// Midtrans HTTP notification. We verify the signature, then re-read the status
// from Midtrans itself before granting anything.
// Public by nature (server-to-server, no Origin, no BotID), so: per-IP limit and a small body cap before any parsing.
export async function POST(req: Request) {
  const blocked = await guard(req, { bucket: "midtrans-notify", limit: 120 });
  if (blocked) return blocked;
  const raw = await readJson(req, 16 * 1024);
  if (!raw.ok) return Response.json({ ok: false }, { status: raw.status });
  const body = raw.data as Parameters<typeof validNotificationSignature>[0] | null;
  if (!isOrderId(body?.order_id) || !validNotificationSignature(body)) return Response.json({ ok: false }, { status: 403 });
  await syncOrder(body.order_id);
  return Response.json({ ok: true });
}
