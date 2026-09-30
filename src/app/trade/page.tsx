"use client";

import { Crown, RotateCcw, Sparkles } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useT } from "@/components/i18n";
import { OpenPositions, TradeHistory } from "@/components/trade/Positions";
import { useWs } from "@/components/workspace";
import { fmtMoney } from "@/lib/market/risk";
import { stats } from "@/lib/paper";

export default function TradeJournalPage() {
  const { paper, resetPaper, askAI, me } = useWs();
  const { t } = useT();
  const s = stats(paper);
  const [start, setStart] = useState(paper.startBalance);
  const canReview = (me?.tier ?? "free") !== "free";

  const cards: [string, string, string?][] = [
    [t("trade.balance"), fmtMoney(s.balance, "USD"), s.realised > 0 ? "text-up" : s.realised < 0 ? "text-down" : ""],
    [t("trade.realised"), fmtMoney(s.realised, "USD"), s.realised > 0 ? "text-up" : s.realised < 0 ? "text-down" : ""],
    [t("trade.winRate"), s.winRate == null ? "—" : `${(s.winRate * 100).toFixed(0)}%`],
    [t("trade.tpSl"), `${s.tpHits} / ${s.slHits}`],
    [t("trade.avgR"), s.avgR == null ? "—" : s.avgR.toFixed(2)],
    [t("trade.pf"), s.profitFactor == null ? "—" : Number.isFinite(s.profitFactor) ? s.profitFactor.toFixed(2) : "∞"],
  ];

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-24 pt-6 @2xl:px-8">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <h1 className="text-2xl font-medium">{t("trade.title")}</h1>
          <p className="mt-1 text-sm text-muted">{t("trade.sub")}</p>
        </div>
        {canReview ? (
          <button className="btn btn-gold ml-auto" onClick={() => askAI(t("trade.reviewPrompt"), { withChart: false })} disabled={s.closed + s.open === 0}>
            <Sparkles size={16} /> {t("trade.review")}
          </button>
        ) : (
          <Link href="/upgrade" className="btn ml-auto text-gold" title={t("trade.reviewPro")}>
            <Crown size={16} /> {t("trade.reviewLocked")}
          </Link>
        )}
      </div>

      <div className="stagger mt-6 grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(160px,1fr))]">
        {cards.map(([k, v, cls]) => (
          <div key={k} className="card px-4 py-3">
            <div className="text-[11px] text-muted">{k}</div>
            <div className={`num mt-1 text-lg ${cls ?? ""}`}>{v}</div>
          </div>
        ))}
      </div>

      <div className="mt-6 space-y-4">
        <OpenPositions />
        <TradeHistory />
      </div>

      <div className="card mt-6 flex flex-wrap items-end gap-3 p-4">
        <label className="flex flex-col gap-1 text-xs text-muted">
          {t("trade.startBalance")}
          <input className="field num h-9 w-40" type="number" min={100} step={100} value={start} onChange={(e) => setStart(+e.target.value)} />
        </label>
        <button
          className="btn h-9"
          onClick={() => {
            if (confirm(t("trade.resetConfirm"))) resetPaper(Math.max(100, start || 10_000));
          }}
        >
          <RotateCcw size={14} /> {t("trade.reset")}
        </button>
        <p className="w-full text-[11px] text-muted">{t("trade.footnote")}</p>
      </div>
    </div>
  );
}
