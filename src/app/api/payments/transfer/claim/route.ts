import { guard } from "@/lib/guard";
import { currentEmail } from "@/lib/auth";
import { serverT } from "@/lib/i18n-server";
import { claimTransfer, displayStatus, getOrder } from "@/lib/payments";
import { notifyClaim } from "@/lib/telegram-bot";

// "I've paid": tells the owner on Telegram to check the bank statement. It never activates anything itself.
export async function POST(req: Request) {
  const blocked = await guard(req, { bucket: "transfer-claim", limit: 10, strict: true });
  if (blocked) return blocked;
  const { t } = await serverT();
  const email = await currentEmail();
  if (!email) return Response.json({ error: t("srv.signInFirst") }, { status: 401 });
  const { orderId } = await req.json().catch(() => ({}));
  const order = typeof orderId === "string" ? await getOrder(orderId) : null;
  if (!order || order.method !== "transfer" || order.email !== email) return Response.json({ error: t("srv.notFound") }, { status: 404 });
  if (displayStatus(order) !== "pending") return Response.json({ error: t("srv.invalid") }, { status: 409 });
  if (order.claimedAt) return Response.json({ claimed: true }); // already told the owner: don't ping again
  if (!(await notifyClaim(order))) return Response.json({ error: t("srv.notifyFailed") }, { status: 502 });
  await claimTransfer(order);
  return Response.json({ claimed: true });
}
