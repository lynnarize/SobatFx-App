import type { Order } from "./payments";
import { kv } from "./store";
import { adminIds, esc, send, telegramConfigured } from "./telegram";
import { TIER_INFO, type PaidTier } from "./tiers";

// The sales book. Every paid order is kept forever (order:<id>, no TTL) and its id is appended to the month it was
// paid in (revenue:YYYY-MM, WIB). Reading a month re-checks each order, so a retried payment that was indexed twice,
// or indexed in one month and finally paid in the next, is still counted exactly once.
// Manual /grant orders are in the book with amount 0, so free activations are on record but never count as income.

const indexKey = (month: string) => `revenue:${month}`;
const WIB = 7 * 3600_000;

/** "2026-10" for a timestamp, in Jakarta time (sales at 23:30 WIB on the 31st belong to that month). */
export const monthOf = (ms: number) => new Date(ms + WIB).toISOString().slice(0, 7);

/** "2026-10-01 14:03" in Jakarta time. */
export const wibTime = (ms: number) => new Date(ms + WIB).toISOString().slice(0, 16).replace("T", " ");

export const isMonth = (s: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(s);

/** Indexes the order under the month of `paidAt`. Call before the order is saved as paid; reads skip it until then. */
export async function indexSale(id: string, paidAt: number) {
  await kv.rpush(indexKey(monthOf(paidAt)), id);
}

/** Paid orders of a month, oldest first. */
export async function salesFor(month: string): Promise<Order[]> {
  const ids = [...new Set(await kv.lrange(indexKey(month), 0, -1))];
  const orders = await kv.mget<Order>(ids.map((id) => `order:${id}`));
  return orders
    .filter((o): o is Order => o?.status === "paid" && o.paidAt !== undefined && monthOf(o.paidAt) === month)
    .sort((a, b) => a.paidAt! - b.paidAt!);
}

const isIncome = (o: Order) => o.method !== "manual" && o.amount > 0;

export function summarize(sales: Order[]) {
  const income = sales.filter(isIncome);
  const group = (key: (o: Order) => string) => {
    const g: Record<string, { count: number; total: number }> = {};
    for (const o of income) {
      const k = key(o);
      g[k] ??= { count: 0, total: 0 };
      g[k].count++;
      g[k].total += o.amount;
    }
    return g;
  };
  return {
    count: income.length,
    total: income.reduce((a, o) => a + o.amount, 0),
    byTier: group((o) => o.tier) as Partial<Record<PaidTier, { count: number; total: number }>>,
    byMethod: group((o) => o.method ?? "qris"),
    freeGrants: sales.length - income.length,
  };
}

const csvCell = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

/** One row per order. Amounts are whole rupiah; QRIS amounts are gross (before the Midtrans fee). */
export function salesCsv(sales: Order[]) {
  const head = ["order_id", "paid_at_wib", "method", "plan", "days", "amount_idr", "counts_as_income", "email", "note"];
  const rows = sales.map((o) => [o.id, wibTime(o.paidAt!), o.method ?? "qris", TIER_INFO[o.tier].label, o.days, o.amount, isIncome(o) ? "yes" : "no", o.email, o.note ?? ""]);
  return [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}

const idr = (n: number) => "Rp " + n.toLocaleString("id-ID");
const METHOD_LABEL: Record<string, string> = { qris: "QRIS", transfer: "Bank transfer", manual: "Manual" };

/** The /revenue reply. */
export function revenueReport(month: string, sales: Order[]) {
  const s = summarize(sales);
  const title = new Date(`${month}-01T00:00:00Z`).toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  if (!sales.length) return `<b>Revenue · ${title}</b>\nNo sales yet.`;
  const line = (label: string, g?: { count: number; total: number }) => (g ? `${label}: ${g.count} · ${idr(g.total)}` : null);
  return [
    `<b>Revenue · ${title}</b>`,
    `Total: <b>${idr(s.total)}</b> · ${s.count} sale${s.count === 1 ? "" : "s"}`,
    "",
    line("Pro", s.byTier.pro),
    line("Ultra", s.byTier.ultimate),
    "",
    ...Object.entries(s.byMethod).map(([m, g]) => line(METHOD_LABEL[m] ?? m, g)),
    s.freeGrants ? `\nFree grants (/grant, not counted): ${s.freeGrants}` : null,
    "",
    "<i>QRIS amounts are before the Midtrans fee. Full list: npm run export:revenue -- " + month + "</i>",
  ]
    .filter((l) => l !== null)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

/** Tells every owner about a QRIS sale (transfers they approve themselves, so they already know). Never throws. */
export async function announceSale(o: Order) {
  if (o.method !== "qris" || !telegramConfigured()) return;
  try {
    const s = summarize(await salesFor(monthOf(o.paidAt ?? Date.now())));
    const text = [
      `💰 <b>New sale · QRIS</b>`,
      `${TIER_INFO[o.tier].label} · ${o.days} days · <b>${idr(o.amount)}</b>`,
      `<code>${esc(o.email)}</code>`,
      `Order: <code>${esc(o.id)}</code>`,
      "",
      `This month: ${idr(s.total)} · ${s.count} sale${s.count === 1 ? "" : "s"}`,
    ].join("\n");
    await Promise.all(adminIds().map((id) => send(id, text)));
  } catch (e) {
    console.error("[revenue] sale alert failed", o.id, (e as Error).message);
  }
}
