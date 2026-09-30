"use client";

import Link from "next/link";
import { fmtMoney } from "@/lib/market/risk";
import { getInstrument } from "@/lib/market/symbols";
import { type PaperTrade, kindKey, rMultiple, stats, tradePips, tradePnl } from "@/lib/paper";
import { useT } from "../i18n";
import { fmtPrice, useWs } from "../workspace";

const pnlCls = (v: number) => (v > 0 ? "text-up" : v < 0 ? "text-down" : "text-ink-2");

/** Open demo positions with live P/L. */
export function OpenPositions({ showJournalLink }: { showJournalLink?: boolean }) {
  const { paper, prices, rates, closePaperTrade, cancelPaperTrade } = useWs();
  const { t } = useT();
  const rows = paper.trades.filter((x) => x.closedAt == null);
  const open = rows.filter((x) => !x.pending);
  const pending = rows.filter((x) => x.pending);
  const floating = open.reduce((s, x) => s + (prices[x.symbol] != null ? tradePnl(x, prices[x.symbol], rates) : 0), 0);
  const balance = stats(paper).balance;

  return (
    <div className="card min-w-0 p-4">
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        <h3 className="font-medium">{t("trade.positions", { n: open.length })}</h3>
        {pending.length > 0 && <span className="rounded bg-gold-soft px-1.5 py-0.5 text-[10px] font-semibold text-gold">{t("trade.pendingCount", { n: pending.length })}</span>}
        <span className="text-xs text-muted">
          {t("trade.equity")}: <span className="num text-ink">{fmtMoney(balance + floating, "USD")}</span>
        </span>
        <span className="text-xs text-muted">
          {t("trade.floating")}: <span className={`num ${pnlCls(floating)}`}>{fmtMoney(floating, "USD")}</span>
        </span>
        {showJournalLink && (
          <Link href="/trade" className="ml-auto text-xs text-gold hover:underline">
            {t("trade.journalLink")}
          </Link>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="py-4 text-sm text-muted">{t("trade.noOpen")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-left text-[11px] text-muted">
              <tr>
                <th className="py-1.5 font-normal">{t("trade.pair")}</th>
                <th className="font-normal">Lot</th>
                <th className="font-normal">{t("trade.entry")}</th>
                <th className="font-normal">SL / TP</th>
                <th className="font-normal">{t("trade.now")}</th>
                <th className="text-right font-normal">P/L</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {open.map((x) => (
                <OpenRow key={x.id} x={x} price={prices[x.symbol]} rates={rates} onClose={(p) => closePaperTrade(x.id, p, "manual")} />
              ))}
              {pending.map((x) => (
                <OpenRow key={x.id} x={x} price={prices[x.symbol]} rates={rates} onClose={() => cancelPaperTrade(x.id)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function OpenRow({ x, price, rates, onClose }: { x: PaperTrade; price?: number; rates: Record<string, number>; onClose(p: number): void }) {
  const { t } = useT();
  const inst = getInstrument(x.symbol)!;
  const pending = x.pending != null;
  const pnl = price != null && !pending ? tradePnl(x, price, rates) : null;
  return (
    <tr className="enter">
      <td className="py-2">
        <span className={`mr-1.5 text-xs font-semibold ${x.side === "buy" ? "text-up" : "text-down"}`}>{t(x.pending ? kindKey(x.side, x.pending) : x.side === "buy" ? "trade.buy" : "trade.sell")}</span>
        {inst.label}
      </td>
      <td className="num">{x.lot.toFixed(2)}</td>
      <td className="num">{fmtPrice(x.entry, inst.digits)}</td>
      <td className="num text-xs text-muted">
        {x.sl != null ? fmtPrice(x.sl, inst.digits) : "—"} / {x.tp != null ? fmtPrice(x.tp, inst.digits) : "—"}
      </td>
      <td className="num">{fmtPrice(price, inst.digits)}</td>
      <td className={`num text-right ${pnl != null ? pnlCls(pnl) : ""}`}>
        {pnl != null ? fmtMoney(pnl, "USD") : "—"}
        {pending ? <div className="text-[10px] text-gold">{t("trade.pendingOrder")}</div> : price != null && <div className="text-[10px] text-muted">{tradePips(x, price, inst).toFixed(1)} pips</div>}
      </td>
      <td className="pl-2 text-right">
        <button className="btn h-7 px-2 text-xs" disabled={!pending && price == null} onClick={() => (pending ? onClose(x.entry) : price != null && onClose(price))}>
          {t(pending ? "trade.cancel" : "trade.close")}
        </button>
      </td>
    </tr>
  );
}

/** Closed demo trades, newest first. */
export function TradeHistory() {
  const { paper } = useWs();
  const { t, locale } = useT();
  const closed = paper.trades.filter((x) => x.closedAt != null).sort((a, b) => b.closedAt! - a.closedAt!);
  const badge = (r?: string) =>
    r === "tp" ? "bg-up/15 text-up" : r === "sl" ? "bg-down/15 text-down" : "bg-panel-3 text-ink-2";
  return (
    <div className="card min-w-0 p-4">
      <h3 className="mb-2 font-medium">{t("trade.history", { n: closed.length })}</h3>
      {closed.length === 0 ? (
        <p className="py-4 text-sm text-muted">{t("trade.noHistory")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-[11px] text-muted">
              <tr>
                <th className="py-1.5 font-normal">{t("trade.closedAt")}</th>
                <th className="font-normal">{t("trade.pair")}</th>
                <th className="font-normal">Lot</th>
                <th className="font-normal">{t("trade.entry")} → {t("trade.exit")}</th>
                <th className="font-normal">{t("trade.result")}</th>
                <th className="text-right font-normal">R</th>
                <th className="text-right font-normal">P/L</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {closed.map((x) => {
                const inst = getInstrument(x.symbol)!;
                const r = rMultiple(x);
                return (
                  <tr key={x.id} className="enter">
                    <td className="py-2 text-xs text-muted">{new Date(x.closedAt!).toLocaleString(locale, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                    <td>
                      <span className={`mr-1.5 text-xs font-semibold ${x.side === "buy" ? "text-up" : "text-down"}`}>{t(x.side === "buy" ? "trade.buy" : "trade.sell")}</span>
                      {inst.label}
                    </td>
                    <td className="num">{x.lot.toFixed(2)}</td>
                    <td className="num text-xs">
                      {fmtPrice(x.entry, inst.digits)} → {fmtPrice(x.exit, inst.digits)}
                    </td>
                    <td>
                      <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${badge(x.result)}`}>{t(`trade.res.${x.result ?? "manual"}`)}</span>
                    </td>
                    <td className="num text-right text-xs">{r != null ? r.toFixed(2) : "—"}</td>
                    <td className={`num text-right ${pnlCls(x.pnl ?? 0)}`}>{fmtMoney(x.pnl ?? 0, "USD")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
