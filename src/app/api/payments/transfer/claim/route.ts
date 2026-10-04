import { guard, readObject } from "@/lib/guard";
import { currentEmail } from "@/lib/auth";
import { serverT } from "@/lib/i18n-server";
import { claimTransfer, displayStatus, getOrder } from "@/lib/payments";
import { withLock } from "@/lib/store";
import { notifyClaim } from "@/lib/telegram-bot";

// "I've paid": tells the owner on Telegram to check the bank statement. It never activates anything itself.
export async function POST(req: Request) {
  const blocked = await guard(req, { bucket: "transfer-claim", limit: 10, strict: true });
  if (blocked) return blocked;
  const { t } = await serverT();
  const email = await currentEmail();
  if (!email) return Response.json({ error: t("srv.signInFirst") }, { status: 401 });
  const { orderId } = await readObject(req);
  const order = typeof orderId === "string" ? await getOrder(orderId) : null;
  if (!order || order.method !== "transfer" || order.email !== email) return Response.json({ error: t("srv.notFound") }, { status: 404 });
  if (displayStatus(order) !== "pending") return Response.json({ error: t("srv.invalid") }, { status: 409 });
  if (order.claimedAt) return Response.json({ claimed: true }); // already told the owner: don't ping again
  // One ping at a time per order: a second click waits here, then finds the claim done instead of pinging again.
  const pinged = await withLock(`claimping:${order.id}`, 30, 10_000, async () => {
    if ((await getOrder(order.id))?.claimedAt) return true;
    if (!(await notifyClaim(order))) return false;
    await claimTransfer(order.id);
    return true;
  });
  if (!pinged?.value) return Response.json({ error: t("srv.notifyFailed") }, { status: 502 });
  return Response.json({ claimed: true });
}
