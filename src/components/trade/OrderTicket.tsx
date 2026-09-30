"use client";

import { useState } from "react";
import { fmtMoney, pipValueUsd, positionSize } from "@/lib/market/risk";
import { getInstrument } from "@/lib/market/symbols";
import { type Side, kindKey, pendingKind, stats, validateLevels } from "@/lib/paper";
import { useT } from "../i18n";
import { fmtPrice, useWs } from "../workspace";

/** Buy/Sell with virtual money at the live price of the chart symbol. */
export function OrderTicket() {
  const { symbol, prices, candles, paper, openPaperTrade, risk, rates } = useWs();
  const { t } = useT();
  const inst = getInstrument(symbol)!;
  const price = prices[symbol] ?? candles.at(-1)?.close;
  const [side, setSide] = useState<Side>("buy");
  const [lot, setLot] = useState(0.01);
  const [entry, setEntry] = useState("");
  const [sl, setSl] = useState("");
  const [tp, setTp] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<"open" | "placed" | null>(null);

  // A custom entry price makes this a pending order (limit / stop) instead of a market order.
  const entryN = entry ? +entry : undefined;
  const kind = price && entryN ? pendingKind(side, price, entryN) : null;
  const slN = sl ? +sl : undefined;
  const tpN = tp ? +tp : undefined;
  const balance = stats(paper).balance;
  // Paper account is in USD; size by the user's risk % of the paper balance.
  const ref = kind ? entryN! : price;
  const sizing = ref && slN ? positionSize(inst, { ...risk, balance, currency: "USD" }, ref, slN, tpN ?? null, rates) : null;

  const submit = () => {
    setDone(null);
    if (!price) return;
    if (!(lot >= 0.01)) return setErr(t("trade.errLot"));
    if (entry && !(entryN! > 0 && Number.isFinite(entryN))) return setErr(t("trade.errEntry"));
    if (entryN && Math.abs(entryN - price) / price > 0.5) return setErr(t("trade.errEntryFar"));
    const at = kind ? entryN! : price; // SL / TP are checked against the price the trade will be filled at
    const bad = validateLevels(side, at, slN, tpN);
    if (bad) return setErr(t(bad === "slSide" ? "trade.errSlSide" : "trade.errTpSide"));
    setErr(null);
    openPaperTrade({ symbol, side, lot: +lot.toFixed(2), entry: at, pending: kind ?? undefined, sl: slN, tp: tpN });
    setEntry("");
    setSl("");
    setTp("");
    setDone(kind ? "placed" : "open");
  };

  const step = inst.pip;
  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="font-medium">{t("trade.ticket")}</h3>
        <span className="rounded bg-gold-soft px-1.5 py-0.5 text-[10px] font-semibold text-gold">{t("trade.virtual")}</span>
        <span className="ml-auto text-xs text-muted">
          {t("trade.balance")}: <span className="num text-ink">{fmtMoney(balance, "USD")}</span>
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {(["buy", "sell"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSide(s)}
            aria-pressed={side === s}
            className={`rounded-lg border px-3 py-2 text-left ${side === s ? (s === "buy" ? "border-up bg-up/15" : "border-down bg-down/15") : "border-line-2 bg-panel"}`}
          >
            <div className={`text-xs font-semibold ${s === "buy" ? "text-up" : "text-down"}`}>{t(s === "buy" ? "trade.buy" : "trade.sell")}</div>
            <div className="num text-sm">{fmtPrice(price, inst.digits)}</div>
          </button>
        ))}
      </div>
      <label className="mt-3 flex flex-col gap-1 text-[11px] text-muted">
        {t("trade.entryPrice")}
        <input
          className="field num h-9"
          type="number"
          step={step}
          placeholder={`${t("trade.market")} · ${fmtPrice(price, inst.digits)}`}
          value={entry}
          onChange={(e) => setEntry(e.target.value)}
        />
      </label>
      {kind && (
        <p className="mt-1.5 text-[11px] text-gold">
          {t("trade.pendingHint", {
            kind: t(kindKey(side, kind)),
            dir: t((entryN! < price!) ? "trade.dirFalls" : "trade.dirRises"),
            price: fmtPrice(entryN, inst.digits),
          })}
        </p>
      )}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <label className="flex flex-col gap-1 text-[11px] text-muted">
          Lot
          <input className="field num h-9" type="number" min={0.01} step={0.01} value={lot} onChange={(e) => setLot(+e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-muted">
          SL
          <input className="field num h-9" type="number" step={step} placeholder={t("trade.optional")} value={sl} onChange={(e) => setSl(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-muted">
          TP
          <input className="field num h-9" type="number" step={step} placeholder={t("trade.optional")} value={tp} onChange={(e) => setTp(e.target.value)} />
        </label>
      </div>
      {sizing && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted">
          <span>
            {t("trade.riskAt", { pips: sizing.slPips.toFixed(1), amt: fmtMoney(lot * sizing.slPips * pipValueUsd(inst, price!, rates), "USD") })}
          </span>
          <button type="button" className="text-gold hover:underline" onClick={() => setLot(Math.max(0.01, sizing.lot))}>
            {t("trade.lotFromRisk", { pct: risk.riskPct, lot: Math.max(0.01, sizing.lot).toFixed(2) })}
          </button>
        </div>
      )}
      {err && <p className="mt-2 text-xs text-down">{err}</p>}
      {done && <p className="mt-2 text-xs text-up">{t(done === "placed" ? "trade.placed" : "trade.opened")}</p>}
      <button type="button" onClick={submit} disabled={!price} className={`btn mt-3 w-full justify-center font-semibold ${side === "buy" ? "!border-up !bg-up text-white" : "!border-down !bg-down text-white"}`}>
        {kind
          ? t("trade.placeOrder", { kind: t(kindKey(side, kind)), lot: lot.toFixed(2), pair: inst.label, price: fmtPrice(entryN, inst.digits) })
          : t(side === "buy" ? "trade.openBuy" : "trade.openSell", { lot: lot.toFixed(2), pair: inst.label })}
      </button>
      <p className="mt-2 text-center text-[10px] text-muted">{t("trade.note")}</p>
    </div>
  );
}
