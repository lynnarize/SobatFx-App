import type { NextRequest } from "next/server";
import { currentEmail } from "@/lib/auth";
import { guard, hit, limitUser } from "@/lib/guard";
import { serverT } from "@/lib/i18n-server";
import { displayStatus, getOrder, syncOrder } from "@/lib/payments";

// Polled by the payment dialog every 3–5 s while an order is open.
export async function GET(req: NextRequest) {
  const blocked = await guard(req, { bucket: "paystatus", limit: 60 });
  if (blocked) return blocked;
  const { t } = await serverT();
  const email = await currentEmail();
  if (!email) return Response.json({ error: t("srv.signInFirst") }, { status: 401 });
  const limited = await limitUser("paystatus", email, 40);
  if (limited) return limited;
  const id = req.nextUrl.searchParams.get("orderId") ?? "";
  const order = await getOrder(id); // null for anything that isn't an order id
  if (!order || order.email !== email) return Response.json({ error: t("srv.notFound") }, { status: 404 });
  // Midtrans is asked at most once per 5 s per order, however many tabs or scripts poll; the webhook settles it anyway.
  const ask = order.status === "pending" && (await hit(`midtrans:${id}`, 1, 5)).ok;
  const now = (ask ? await syncOrder(id).catch(() => order) : order) ?? order;
  return Response.json({ status: displayStatus(now), claimed: Boolean(now.claimedAt), tier: order.tier }, { headers: { "Cache-Control": "no-store" } });
}
