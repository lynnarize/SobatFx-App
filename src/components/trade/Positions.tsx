"use client";

import Link from "next/link";
import { fmtMoney } from "@/lib/market/risk";
import { getInstrument } from "@/lib/market/symbols";
import { type PaperTrade, exitPrice, kindKey, rMultiple, stats, tradePips, tradePnl } from "@/lib/paper";
import { useT } from "../i18n";
import { fmtPrice, useWs } from "../workspace";

// No wrapping (a narrow card scrolls sideways instead) and padded cells so adjacent numbers don't run together.
const TABLE = "w-full whitespace-nowrap text-sm [&_td]:px-2 [&_th]:px-2 [&_tr>*:first-child]:pl-0 [&_tr>*:last-child]:pr-0";
// Cards are size containers: wide ones show a table, narrow ones (phones, a docked AI panel) a stacked list.
const WIDE = "hidden @xl:block";
const NARROW = "divide-y divide-line @xl:hidden";

const pnlCls = (v: number) => (v > 0 ? "text-up" : v < 0 ? "text-down" : "text-ink-2");

/** Open demo positions with live P/L. */
export function OpenPositions({ showJournalLink }: { showJournalLink?: boolean }) {
  const { paper, prices, rates, closePaperTrade, cancelPaperTrade } = useWs();
  const { t } = useT();
  const rows = paper.trades.filter((x) => x.closedAt == null);
  const open = rows.filter((x) => !x.pending);
  const pending = rows.filter((x) => x.pending);
  const floating = open.reduce((s, x) => s + (prices[x.symbol] != null ? tradePnl(x, exitPrice(x, prices[x.symbol]), rates) : 0), 0);
  const balance = stats(paper).balance;
  const ordered = [...open, ...pending];
  const onClose = (x: PaperTrade) => (p: number) => (x.pending ? cancelPaperTrade(x.id) : closePaperTrade(x.id, p, "manual"));

  return (
    <div className="card @container min-w-0 p-4">
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
        <>
          <div className={`${WIDE} overflow-x-auto`}>
            <table className={TABLE}>
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
                {ordered.map((x) => (
                  <OpenRow key={x.id} x={x} price={prices[x.symbol]} rates={rates} onClose={onClose(x)} />
                ))}
              </tbody>
            </table>
          </div>
          <ul className={NARROW}>
            {ordered.map((x) => (
              <OpenItem key={x.id} x={x} price={prices[x.symbol]} rates={rates} onClose={onClose(x)} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

type RowProps = { x: PaperTrade; price?: number; rates: Record<string, number>; onClose(p: number): void };

/** Everything a position row shows, shared by the table row and the stacked item. `price` is the live Bid. */
function usePosition({ x, price, rates, onClose }: RowProps) {
  const { t } = useT();
  const inst = getInstrument(x.symbol)!;
  const pending = x.pending != null;
  // What the trade would close at now: the Bid for a buy, the Ask for a sell (same as the Bid without a spread).
  const now = price != null && !pending ? exitPrice(x, price) : price;
  const pnl = now != null && !pending ? tradePnl(x, now, rates) : null;
  const fmt = (p?: number) => (p != null ? fmtPrice(p, inst.digits) : "—");
  const sideCls = x.side === "buy" ? "text-up" : "text-down";
  const side = t(x.pending ? kindKey(x.side, x.pending) : x.side === "buy" ? "trade.buy" : "trade.sell");
  const pl = (
    <>
      {pnl != null ? fmtMoney(pnl, "USD") : "—"}
      {pending ? <div className="text-[10px] text-gold">{t("trade.pendingOrder")}</div> : price != null && <div className="text-[10px] text-muted">{tradePips(x, now!, inst).toFixed(1)} pips</div>}
    </>
  );
  const button = (
    <button className="btn h-7 px-2 text-xs" disabled={!pending && price == null} onClick={() => (pending ? onClose(x.entry) : price != null && onClose(price))}>
      {t(pending ? "trade.cancel" : "trade.close")}
    </button>
  );
  return { t, inst, now, pnl, fmt, sideCls, side, pl, button };
}

function OpenRow(props: RowProps) {
  const { x } = props;
  const { inst, now, pnl, fmt, sideCls, side, pl, button } = usePosition(props);
  return (
    <tr className="enter">
      <td className="py-2">
        <div className={`text-[11px] font-semibold ${sideCls}`}>{side}</div>
        {inst.label}
      </td>
      <td className="num">{x.lot.toFixed(2)}</td>
      <td className="num">{fmt(x.entry)}</td>
      <td className="num text-xs leading-tight text-muted">
        <div>{fmt(x.sl)}</div>
        <div>{fmt(x.tp)}</div>
      </td>
      <td className="num">{fmt(now)}</td>
      <td className={`num text-right ${pnl != null ? pnlCls(pnl) : ""}`}>{pl}</td>
      <td className="text-right">{button}</td>
    </tr>
  );
}

function OpenItem(props: RowProps) {
  const { x } = props;
  const { t, inst, now, pnl, fmt, sideCls, side, pl, button } = usePosition(props);
  return (
    <li className="enter py-3">
      <div className="flex items-center gap-2">
        <span className={`text-xs font-semibold ${sideCls}`}>{side}</span>
        <span className="text-sm">{inst.label}</span>
        <span className="num text-xs text-muted">{x.lot.toFixed(2)} lot</span>
        <span className="ml-auto">{button}</span>
      </div>
      <div className="mt-2 grid grid-cols-[auto_1fr_auto] items-end gap-x-4 gap-y-0.5 text-xs">
        <div className="text-muted">
          {t("trade.entry")} <span className="num text-ink">{fmt(x.entry)}</span>
        </div>
        <div className="text-muted">
          SL <span className="num text-ink-2">{fmt(x.sl)}</span>
        </div>
        <div className={`num row-span-2 text-right text-sm ${pnl != null ? pnlCls(pnl) : ""}`}>{pl}</div>
        <div className="text-muted">
          {t("trade.now")} <span className="num text-ink">{fmt(now)}</span>
        </div>
        <div className="text-muted">
          TP <span className="num text-ink-2">{fmt(x.tp)}</span>
        </div>
      </div>
    </li>
  );
}

/** Closed demo trades, newest first. */
export function TradeHistory() {
  const { paper } = useWs();
  const { t, locale } = useT();
  const closed = paper.trades.filter((x) => x.closedAt != null).sort((a, b) => b.closedAt! - a.closedAt!);
  const badge = (r?: string) =>
    r === "tp" ? "bg-up/15 text-up" : r === "sl" ? "bg-down/15 text-down" : "bg-panel-3 text-ink-2";
  const when = (x: PaperTrade) => new Date(x.closedAt!).toLocaleString(locale, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  const sideLabel = (x: PaperTrade) => <span className={`text-xs font-semibold ${x.side === "buy" ? "text-up" : "text-down"}`}>{t(x.side === "buy" ? "trade.buy" : "trade.sell")}</span>;
  const result = (x: PaperTrade) => <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${badge(x.result)}`}>{t(`trade.res.${x.result ?? "manual"}`)}</span>;
  return (
    <div className="card @container min-w-0 p-4">
      <h3 className="mb-2 font-medium">{t("trade.history", { n: closed.length })}</h3>
      {closed.length === 0 ? (
        <p className="py-4 text-sm text-muted">{t("trade.noHistory")}</p>
      ) : (
        <>
          <div className={`${WIDE} overflow-x-auto`}>
            <table className={TABLE}>
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
                      <td className="py-2 text-xs text-muted">{when(x)}</td>
                      <td>
                        <span className="mr-1.5">{sideLabel(x)}</span>
                        {inst.label}
                      </td>
                      <td className="num">{x.lot.toFixed(2)}</td>
                      <td className="num text-xs">
                        {fmtPrice(x.entry, inst.digits)} → {fmtPrice(x.exit, inst.digits)}
                      </td>
                      <td>{result(x)}</td>
                      <td className="num text-right text-xs">{r != null ? r.toFixed(2) : "—"}</td>
                      <td className={`num text-right ${pnlCls(x.pnl ?? 0)}`}>{fmtMoney(x.pnl ?? 0, "USD")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <ul className={NARROW}>
            {closed.map((x) => {
              const inst = getInstrument(x.symbol)!;
              const r = rMultiple(x);
              return (
                <li key={x.id} className="enter py-3">
                  <div className="flex items-center gap-2">
                    {sideLabel(x)}
                    <span className="text-sm">{inst.label}</span>
                    <span className="num text-xs text-muted">{x.lot.toFixed(2)} lot</span>
                    <span className={`num ml-auto text-sm ${pnlCls(x.pnl ?? 0)}`}>{fmtMoney(x.pnl ?? 0, "USD")}</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                    <span className="num text-ink-2">
                      {fmtPrice(x.entry, inst.digits)} → {fmtPrice(x.exit, inst.digits)}
                    </span>
                    {result(x)}
                    {r != null && <span className="num">{r.toFixed(2)}R</span>}
                    <span className="ml-auto">{when(x)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
