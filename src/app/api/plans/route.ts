import { demoMode } from "@/lib/auth";
import { getUsdIdr } from "@/lib/fx";
import { plans, paymentsConfigured, qrisComingSoon, saleTiers, transferConfigured } from "@/lib/payments";
import { tierLimit } from "@/lib/users";

export async function GET() {
  const p = plans();
  const rate = await getUsdIdr();
  // Struck-through normal price in rupiah for the Indonesian UI, rounded to the nearest Rp 1.000.
  const idrOf = (usd?: number) => (usd ? Math.round((usd * rate) / 1000) * 1000 : undefined);
  return Response.json({
    paymentsEnabled: paymentsConfigured() && !demoMode(),
    transferEnabled: transferConfigured() && !demoMode(),
    qrisSoon: qrisComingSoon() && !demoMode(),
    saleTiers: saleTiers(),
    // Only whether a code exists, never the code itself: the page shows the voucher field when true.
    vouchers: { pro: Boolean(process.env.PRO_VOUCHER_CODE?.trim()), ultimate: Boolean(process.env.ULTIMATE_VOUCHER_CODE?.trim()) },
    demo: demoMode(),
    plans: {
      free: { priceIdr: 0, ...tierLimit("free") },
      pro: { ...p.pro, listPriceIdr: idrOf(p.pro.listPriceUsd), ...tierLimit("pro") },
      ultimate: { ...p.ultimate, listPriceIdr: idrOf(p.ultimate.listPriceUsd), ...tierLimit("ultimate") },
    },
  });
}
