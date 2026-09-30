import type { NextRequest } from "next/server";
import { currentEmail } from "@/lib/auth";
import { serverT } from "@/lib/i18n-server";
import { displayStatus, getOrder, syncOrder } from "@/lib/payments";

export async function GET(req: NextRequest) {
  const { t } = await serverT();
  const email = await currentEmail();
  if (!email) return Response.json({ error: t("srv.signInFirst") }, { status: 401 });
  const id = req.nextUrl.searchParams.get("orderId") ?? "";
  const order = await getOrder(id);
  if (!order || order.email !== email) return Response.json({ error: t("srv.notFound") }, { status: 404 });
  const synced = await syncOrder(id).catch(() => order);
  const now = synced ?? order;
  return Response.json({ status: displayStatus(now), claimed: Boolean(now.claimedAt), tier: order.tier }, { headers: { "Cache-Control": "no-store" } });
}
