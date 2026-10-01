import { guard, limitUser } from "@/lib/guard";
import { currentEmail, demoMode } from "@/lib/auth";
import { serverT } from "@/lib/i18n-server";
import { createTransferOrder, saleTiers, transferConfigured, transferView } from "@/lib/payments";
import { isPaidTier } from "@/lib/tiers";

export async function POST(req: Request) {
  const blocked = await guard(req, { bucket: "transfer", limit: 8, strict: true });
  if (blocked) return blocked;
  const { t } = await serverT();
  const email = await currentEmail();
  if (!email) return Response.json({ error: t("srv.signInFirst") }, { status: 401 });
  if (demoMode()) return Response.json({ error: t("srv.demoNoPay") }, { status: 403 });
  if (!transferConfigured()) return Response.json({ error: t("srv.paymentsOff") }, { status: 503 });
  const limited = await limitUser("transfer", email, 10, 3600);
  if (limited) return limited;
  const { tier } = await req.json().catch(() => ({}));
  if (!isPaidTier(tier)) return Response.json({ error: t("srv.unknownPlan") }, { status: 400 });
  if (!saleTiers().includes(tier)) return Response.json({ error: t("up.comingSoon") }, { status: 403 });
  try {
    return Response.json(transferView(await createTransferOrder(email, tier)));
  } catch (e) {
    console.error("[transfer] could not create order", (e as Error).message);
    return Response.json({ error: t("srv.transferFailed") }, { status: 502 });
  }
}
