/**
 * Exports the sales book as CSV for bookkeeping, and prints the totals.
 *
 *   npm run export:revenue               (this month, WIB)
 *   npm run export:revenue -- 2026-10    (one month)
 *   npm run export:revenue -- 2026       (a whole year, one file)
 *
 * Reads the Redis store in .env.local, so point it at production to get real sales.
 * Writes scripts/revenue-<period>.csv. It holds customer emails: keep it out of git (it is ignored).
 * Only sales paid after the sales book existed are listed; older ones are in the Midtrans dashboard and your bank statement.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Order } from "../src/lib/payments";
import { isMonth, monthOf, salesCsv, salesFor, summarize } from "../src/lib/revenue";

async function main() {
  const period = process.argv[2] ?? monthOf(Date.now());
  const months = /^\d{4}$/.test(period) ? Array.from({ length: 12 }, (_, i) => `${period}-${String(i + 1).padStart(2, "0")}`) : [period];
  if (!months.every(isMonth)) throw new Error(`Expected YYYY-MM or YYYY, got "${period}"`);

  const idr = (n: number) => "Rp " + n.toLocaleString("id-ID");
  const all: Order[] = [];
  for (const m of months) {
    const sales = await salesFor(m);
    if (!sales.length && months.length > 1) continue;
    const s = summarize(sales);
    console.log(`${m}  ${String(s.count).padStart(4)} sales  ${idr(s.total).padStart(16)}${s.freeGrants ? `  (+${s.freeGrants} free grants)` : ""}`);
    all.push(...sales);
  }
  if (months.length > 1) {
    const s = summarize(all);
    console.log(`${period}     ${String(s.count).padStart(4)} sales  ${idr(s.total).padStart(16)}`);
  }

  const out = join(__dirname, `revenue-${period}.csv`);
  writeFileSync(out, salesCsv(all));
  console.log(all.length ? `\n${all.length} rows → ${out}` : `\nNo sales in ${period} (needs the production Redis store in .env.local).`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
