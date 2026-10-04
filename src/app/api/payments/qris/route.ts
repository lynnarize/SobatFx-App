import QRCode from "qrcode";
import { guard, readObject } from "@/lib/guard";
import { currentEmail, demoMode } from "@/lib/auth";
import { serverT } from "@/lib/i18n-server";
import { createQrisOrder, paymentsConfigured, saleTiers, voucherPrice } from "@/lib/payments";
import { isPaidTier } from "@/lib/tiers";

export async function POST(req: Request) {
  // Each order calls Midtrans, so: same origin + BotID + a tight per-IP limit.
  const blocked = await guard(req, { bucket: "qris", limit: 8, strict: true });
  if (blocked) return blocked;
  const { t } = await serverT();
  const email = await currentEmail();
  if (!email) return Response.json({ error: t("srv.signInFirst") }, { status: 401 });
  if (demoMode()) return Response.json({ error: t("srv.demoNoPay") }, { status: 403 });
  if (!paymentsConfigured()) return Response.json({ error: t("srv.paymentsOff") }, { status: 503 });
  const { tier, voucher } = await readObject(req);
  if (!isPaidTier(tier)) return Response.json({ error: t("srv.unknownPlan") }, { status: 400 });
  if (!saleTiers().includes(tier)) return Response.json({ error: t("up.comingSoon") }, { status: 403 });
  // A typed code that doesn't apply is refused rather than silently charging the full price.
  if (voucher && !voucherPrice(tier, voucher)) return Response.json({ error: t("srv.badVoucher") }, { status: 400 });
  try {
    const order = await createQrisOrder(email, tier, typeof voucher === "string" && voucher ? voucher : undefined);
    const qr = await QRCode.toDataURL(order.qrString!, { margin: 1, width: 360, errorCorrectionLevel: "M" });
    return Response.json({ orderId: order.id, amount: order.amount, tier: order.tier, days: order.days, expiresAt: order.expiresAt, qr });
  } catch {
    return Response.json({ error: t("srv.qrisFailed") }, { status: 502 });
  }
}
