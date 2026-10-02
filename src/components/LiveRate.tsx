"use client";

import { useT } from "./i18n";
import { useWs } from "./workspace";

/** Read-only USD→IDR rate with a live indicator. The rate itself is fetched by the workspace (/api/fx). */
export function LiveRate({ className = "" }: { className?: string }) {
  const { usdIdr, risk } = useWs();
  const { t, locale } = useT();
  const rate = usdIdr?.rate ?? risk.usdIdr;
  const live = usdIdr?.live;
  const time = usdIdr ? new Date(usdIdr.at).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }) : "";
  return (
    <div className={`flex min-h-10 items-center gap-2.5 rounded-[10px] border border-line-2 bg-panel px-3 py-1.5 ${className}`}>
      <span className="relative grid h-2.5 w-2.5 shrink-0 place-items-center" aria-hidden>
        {live && <span className="absolute h-2.5 w-2.5 animate-ping rounded-full bg-up/60" />}
        <span className={`h-2 w-2 rounded-full ${live ? "bg-up" : "bg-muted"}`} />
      </span>
      <div className="min-w-0 leading-tight">
        <div className="num text-sm text-ink">1 USD = Rp {rate.toLocaleString(locale, { maximumFractionDigits: 0 })}</div>
        <div className="truncate text-[10px] text-muted">
          {!usdIdr ? t("fx.loading") : live ? t("fx.live", { source: usdIdr.source, time }) : t("fx.offline")}
        </div>
      </div>
    </div>
  );
}
