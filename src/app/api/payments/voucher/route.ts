import { guard } from "@/lib/guard";
import { serverT } from "@/lib/i18n-server";
import { plans, voucherPrice } from "@/lib/payments";
import { isPaidTier } from "@/lib/tiers";

/** Checks a voucher code before purchase. Tight per-IP limit so codes can't be guessed by brute force. */
export async function POST(req: Request) {
  const blocked = await guard(req, { bucket: "voucher", limit: 10, strict: true });
  if (blocked) return blocked;
  const { t } = await serverT();
  const { tier, code } = await req.json().catch(() => ({}));
  if (!isPaidTier(tier)) return Response.json({ error: t("srv.unknownPlan") }, { status: 400 });
  const price = voucherPrice(tier, code);
  if (!price) return Response.json({ error: t("srv.badVoucher") }, { status: 404 });
  return Response.json({ tier, priceIdr: price, normalPriceIdr: plans()[tier].priceIdr });
}
