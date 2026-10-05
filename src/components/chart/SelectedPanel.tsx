"use client";

import { Crown, Lock, PlayCircle, Sparkles, Trash2, Unlock, X } from "lucide-react";
import { useState } from "react";
import { kindKey, marketPrice, pendingKind, spreadFor, validateLevels } from "@/lib/paper";
import Link from "next/link";
import { AI_COLOR, type Drawing, describeDrawings } from "@/lib/drawings";
import { fmtMoney, positionSize } from "@/lib/market/risk";
import { getInstrument } from "@/lib/market/symbols";
import { DRAWING_COLORS, type DrawingLineStyle } from "@/lib/opencharts/constants";
import { useT } from "../i18n";
import { fmtPrice, useWs } from "../workspace";

/** Inspector for the selected drawing — the position tool doubles as the lot-size calculator. */
export function SelectedPanel({ d, onChange, onDelete, onClose }: { d: Drawing; onChange(p: Partial<Drawing>): void; onDelete(): void; onClose(): void }) {
  const { symbol, risk, setRisk, rates, askAI, me, prices, candles, paper, openPaperTrade } = useWs();
  const [tradeMsg, setTradeMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const canReview = (me?.tier ?? "free") !== "free";
  const { t } = useT();
  const name = t(`dt.${d.type}`);
  const inst = getInstrument(symbol)!;
  const numIn = (v: number | undefined, onSet: (n: number) => void, label: string) => (
    <label className="flex flex-col gap-1 text-xs text-muted">
      {label}
      <input className="field num h-9" type="number" step={inst.pip / 10} value={v != null ? +v.toFixed(inst.digits) : ""} disabled={d.locked} onChange={(e) => onSet(+e.target.value)} />
    </label>
  );
  const textIn = (label: string, max = 24) => (
    <label className="flex flex-col gap-1 text-xs text-muted">
      {label}
      <input className="field h-9" value={d.text ?? ""} maxLength={max} onChange={(e) => onChange({ text: e.target.value || undefined })} />
    </label>
  );

  const pos = d.type === "position" && d.stopPrice != null ? positionSize(inst, risk, d.price, d.stopPrice, d.targetPrice ?? null, rates) : null;

  // Demo trade from a long/short drawing: at the live price, or as a pending order at the drawing's entry price.
  const bid = prices[symbol] ?? candles.at(-1)?.close;
  const tradeSide = d.side === "short" ? "sell" : "buy";
  const spread = spreadFor(paper.spreadMode, inst);
  const live = bid != null ? marketPrice(tradeSide, bid, spread) : undefined;
  const entryKind = d.type === "position" && live ? pendingKind(tradeSide, live, d.price) : null;
  const placeTrade = (atEntry: boolean) => {
    if (!live) return;
    const kind = atEntry ? entryKind : null;
    const at = kind ? d.price : live;
    const bad = validateLevels(tradeSide, at, d.stopPrice, d.targetPrice, spread);
    if (bad) return setTradeMsg({ ok: false, text: t(bad === "slSide" ? "trade.errSlSide" : "trade.errTpSide") });
    openPaperTrade({ symbol, side: tradeSide, lot: Math.max(0.01, pos?.lot ?? 0.01), entry: at, pending: kind ?? undefined, sl: d.stopPrice, tp: d.targetPrice, spread: spread || undefined });
    setTradeMsg({ ok: true, text: t(kind ? "trade.placed" : "trade.opened") });
  };

  return (
    <div className="card p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">
          {d.by === "ai" && <span className="mr-1.5 rounded bg-gold-soft px-1.5 py-0.5 text-[10px] font-semibold text-gold">AI</span>}
          {name}
          {d.type === "position" && ` · ${t(d.side === "short" ? "pos.short" : "pos.long")}`}
        </span>
        <div className="flex items-center gap-1" role="radiogroup" aria-label={t("sel.colour")}>
          {[AI_COLOR, ...DRAWING_COLORS].map((c) => (
            <button key={c} role="radio" aria-checked={d.color === c} aria-label={`${t("sel.colour")} ${c}`} className={`h-5 w-5 rounded-full border ${d.color === c ? "border-ink" : "border-transparent"}`} style={{ background: c }} onClick={() => onChange({ color: c })} />
          ))}
        </div>
        {d.type !== "position" && d.type !== "text" && (
          <select className="field h-8 w-auto text-xs" aria-label={t("sel.lineStyle")} value={d.lineStyle ?? "solid"} onChange={(e) => onChange({ lineStyle: e.target.value as DrawingLineStyle })}>
            <option value="solid">{t("style.solid")}</option>
            <option value="dashed">{t("style.dashed")}</option>
            <option value="dotted">{t("style.dotted")}</option>
          </select>
        )}
        <div className="ml-auto flex gap-1.5">
          {canReview ? (
            <button className="btn h-8 text-xs" onClick={() => askAI(t("sel.askAiPrompt", { name: name.toLowerCase(), json: JSON.stringify(describeDrawings([d])[0]) }))}>
              <Sparkles size={14} /> {t("sel.askAi")}
            </button>
          ) : (
            <Link href="/upgrade" className="btn h-8 text-xs text-gold" title={t("sel.proOnly")}>
              <Crown size={14} /> {t("sel.askAiPro")}
            </Link>
          )}
          <button className="icon-btn h-8 w-8" aria-label={t(d.locked ? "sel.unlock" : "sel.lock")} title={t(d.locked ? "sel.unlock" : "sel.lock")} onClick={() => onChange({ locked: !d.locked })}>
            {d.locked ? <Lock size={14} /> : <Unlock size={14} />}
          </button>
          <button className="icon-btn h-8 w-8" aria-label={t("sel.delete")} onClick={onDelete}>
            <Trash2 size={14} />
          </button>
          <button className="icon-btn h-8 w-8" aria-label={t("app.close")} onClick={onClose}>
            <X size={14} />
          </button>
        </div>
      </div>

      {d.type === "horizontal" && (
        <div className="grid grid-cols-2 gap-3">
          {numIn(d.price, (price) => onChange({ price }), t("sel.price"))}
          {textIn(t("sel.label"))}
        </div>
      )}

      {d.type === "position" && (
        <>
          <div className="grid grid-cols-2 gap-3 @lg:grid-cols-5">
            <label className="flex flex-col gap-1 text-xs text-muted">
              {t("sel.side")}
              <select className="field h-9" value={d.side ?? "long"} onChange={(e) => onChange({ side: e.target.value as "long" | "short", color: e.target.value === "short" ? "#e0453c" : "#22b36b" })}>
                <option value="long">{t("sel.longBuy")}</option>
                <option value="short">{t("sel.shortSell")}</option>
              </select>
            </label>
            {numIn(d.price, (price) => onChange({ price }), t("sel.entry"))}
            {numIn(d.stopPrice, (stopPrice) => onChange({ stopPrice }), t("sel.sl"))}
            {numIn(d.targetPrice, (targetPrice) => onChange({ targetPrice }), t("sel.tp"))}
            <label className="flex flex-col gap-1 text-xs text-muted">
              {t("sel.riskOf", { bal: fmtMoney(risk.balance, risk.currency) })}
              <input className="field num h-9" type="number" step={0.25} min={0.1} max={10} value={risk.riskPct} onChange={(e) => setRisk({ riskPct: +e.target.value })} />
            </label>
          </div>
          {pos ? (
            <div className="mt-3 grid grid-cols-2 gap-2 @lg:grid-cols-5">
              <Stat k={t("sel.lot")} v={pos.lot.toFixed(2)} gold />
              <Stat k={t("sel.risk")} v={fmtMoney(pos.riskMoney, risk.currency)} tone="down" />
              <Stat k={t("sel.reward")} v={pos.rewardMoney != null ? fmtMoney(pos.rewardMoney, risk.currency) : "—"} tone="up" />
              <Stat k="R:R" v={pos.rr != null ? `1 : ${pos.rr.toFixed(2)}` : "—"} />
              <Stat k={t("sel.pips")} v={`${pos.slPips.toFixed(1)} / ${pos.tpPips?.toFixed(1) ?? "—"}`} />
            </div>
          ) : (
            <p className="mt-3 text-xs text-muted">{t("sel.waitingRates")}</p>
          )}
          {pos?.warnings.map((w) => (
            <p key={w} className="mt-2 text-xs text-down">⚠ {t(`warn.${w}`)}</p>
          ))}
          <p className="mt-2 text-[11px] text-muted">{t("sel.posHelp")}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button className="btn h-8 text-xs" onClick={() => placeTrade(false)}>
              <PlayCircle size={14} /> {t("trade.fromDrawing")}
            </button>
            {entryKind && (
              <button className="btn h-8 text-xs" onClick={() => placeTrade(true)}>
                <PlayCircle size={14} /> {t("trade.fromDrawingAt", { price: fmtPrice(d.price, inst.digits) })} · {t(kindKey(d.side === "short" ? "sell" : "buy", entryKind))}
              </button>
            )}
            {tradeMsg && <span className={`text-xs ${tradeMsg.ok ? "text-up" : "text-down"}`}>{tradeMsg.text}</span>}
          </div>
        </>
      )}

      {(d.type === "trendline" || d.type === "rectangle" || d.type === "channel" || d.type === "arrow") && (
        <div className="flex flex-wrap items-end gap-4">
          <div className="w-56">{textIn(t("sel.label"))}</div>
          {d.type === "trendline" && (
            <>
              <label className="flex items-center gap-1.5 pb-2 text-xs text-ink-2">
                <input type="checkbox" className="accent-[var(--gold)]" checked={!!d.extendLeft} onChange={(e) => onChange({ extendLeft: e.target.checked })} /> {t("sel.extendLeft")}
              </label>
              <label className="flex items-center gap-1.5 pb-2 text-xs text-ink-2">
                <input type="checkbox" className="accent-[var(--gold)]" checked={!!d.extendRight} onChange={(e) => onChange({ extendRight: e.target.checked })} /> {t("sel.extendRight")}
              </label>
            </>
          )}
          {d.price2 != null && (
            <p className="num pb-2 text-xs text-muted">
              Δ {(d.price2 - d.price).toFixed(inst.digits)} · {(Math.abs(d.price2 - d.price) / inst.pip).toFixed(1)} {t("calc.pips")}
            </p>
          )}
        </div>
      )}

      {d.type === "text" && <div className="max-w-sm">{textIn(t("sel.text"), 60)}</div>}
    </div>
  );
}

function Stat({ k, v, tone, gold }: { k: string; v: string; tone?: "up" | "down"; gold?: boolean }) {
  return (
    <div className="rounded-lg bg-panel px-3 py-2">
      <div className="text-[11px] text-muted">{k}</div>
      <div className={`num text-sm font-medium ${gold ? "text-gold" : tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-ink"}`}>{v}</div>
    </div>
  );
}
