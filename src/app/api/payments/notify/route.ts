import { syncOrder, validNotificationSignature } from "@/lib/payments";

// Midtrans HTTP notification. We verify the signature, then re-read the status
// from Midtrans itself before granting anything.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.order_id || !validNotificationSignature(body)) return Response.json({ ok: false }, { status: 403 });
  await syncOrder(body.order_id);
  return Response.json({ ok: true });
}
