import type { Instrument } from "./symbols";

// Position sizing shared by the calculator page, the chart's position tool and the AI context.

export interface RiskSettings {
  balance: number;
  riskPct: number;
  currency: "USD" | "IDR";
  usdIdr: number;
}

export const DEFAULT_RISK: RiskSettings = { balance: 1000, riskPct: 1, currency: "USD", usdIdr: 16500 };

/**
 * Value of 1 pip for 1.00 lot, in USD.
 * `rates` supplies USD conversion for crosses, e.g. { USDJPY: 150.2, GBPUSD: 1.27 }.
 */
export function pipValueUsd(inst: Instrument, price: number, rates: Record<string, number> = {}) {
  const perPipQuote = inst.contract * inst.pip; // in quote currency
  if (inst.quote === "USD") return perPipQuote;
  if (inst.base === "USD") return perPipQuote / price;
  const direct = rates[`${inst.quote}USD`];
  if (direct) return perPipQuote * direct;
  const inverse = rates[`USD${inst.quote}`];
  if (inverse) return perPipQuote / inverse;
  return NaN;
}

export function toPips(inst: Instrument, priceDiff: number) {
  return Math.abs(priceDiff) / inst.pip;
}

/** Warning codes — the UI translates them (`warn.*` in src/lib/i18n.ts). */
export type RiskWarning = "tooWide" | "aggressive" | "rrBelow1" | "sameSide";

export interface SizeResult {
  lot: number;
  riskMoney: number; // in account currency, at the rounded lot
  rewardMoney: number | null;
  slPips: number;
  tpPips: number | null;
  rr: number | null;
  pipValue: number; // per pip at the rounded lot, account currency
  warnings: RiskWarning[];
}

export function positionSize(
  inst: Instrument,
  s: RiskSettings,
  entry: number,
  sl: number,
  tp: number | null,
  rates: Record<string, number> = {},
): SizeResult | null {
  const pvUsd = pipValueUsd(inst, entry, rates);
  if (!entry || !sl || !Number.isFinite(pvUsd) || entry === sl) return null;
  const fx = s.currency === "IDR" ? s.usdIdr : 1;
  const pv = pvUsd * fx; // per pip per lot in account currency
  const slPips = toPips(inst, entry - sl);
  const tpPips = tp ? toPips(inst, tp - entry) : null;
  const riskBudget = (s.balance * s.riskPct) / 100;
  // Round DOWN to 0.01 lot so the real risk never exceeds the budget.
  const lot = Math.floor((riskBudget / (slPips * pv)) * 100 + 1e-9) / 100;
  const warnings: RiskWarning[] = [];
  if (lot < 0.01) warnings.push("tooWide");
  if (s.riskPct > 2) warnings.push("aggressive");
  const rr = tpPips != null ? tpPips / slPips : null;
  if (rr != null && rr < 1) warnings.push("rrBelow1");
  const wrongSide = tp != null && (tp - entry) * (entry - sl) <= 0;
  if (wrongSide) warnings.push("sameSide");
  return {
    lot: Math.max(lot, 0),
    riskMoney: lot * slPips * pv,
    rewardMoney: tpPips != null ? lot * tpPips * pv : null,
    slPips,
    tpPips,
    rr,
    pipValue: lot * pv,
    warnings,
  };
}

export function fmtMoney(v: number, currency: "USD" | "IDR") {
  if (!Number.isFinite(v)) return "—";
  return currency === "IDR"
    ? "Rp " + Math.round(v).toLocaleString("id-ID")
    : "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
