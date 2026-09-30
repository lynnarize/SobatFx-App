import type { Drawing } from "../drawings";
import { pipValueUsd, positionSize, type RiskSettings } from "../market/risk";
import type { Instrument } from "../market/symbols";

// The AI writes its own lot maths, and models get pips and pip values wrong (up to 10× too big on gold).
// The chat shows the app's calculator result for every trade plan the AI draws, and flags a reply
// whose lot numbers don't match it. Pure, so the tests can cover it.

export interface PlanCheck {
  side: "long" | "short";
  entry: number;
  lot: number;
  riskMoney: number;
  slPips: number;
  rr: number | null;
  /** Even 0.01 lot would risk more than the user's risk setting. */
  tooWide: boolean;
  /** The reply names lot sizes and none of them is this one. */
  mismatch: boolean;
}

/** Lot sizes written in a reply, in order: "0.05 lot", "lot 0,05", "Lot = 10 / 200 = **0.05**". Lots have at
 *  most 2 decimals, so unrounded intermediate results like 0.108 are skipped, and units such as
 *  "$10 per 1.00 lot" or "per lot × 0.01" are not sizes. */
export function lotsInText(text: string) {
  const out: number[] = [];
  const unit = String.raw`(?<!(?:per|on|each|setiap|tiap|untuk)\s+(?:standard\s+)?)`;
  const re = new RegExp(
    String.raw`${unit}(?<![\d.,])(\d+[.,]\d{1,2})(?!\d|[.,]\d)[\s*$]*(?:standard\s+)?lots?\b|${unit}\blot\b[^\d\n]{0,40}?(?:=\s*[\d.,\s÷/×x*()$]+=\s*)?\**(\d+[.,]\d{1,2})(?!\d|[.,]\d)(?!\s*(?:pips?|%|USD|\$|R\b))`,
    "gi",
  );
  for (const m of text.matchAll(re)) {
    const v = Number((m[1] ?? m[2]).replace(",", "."));
    if (Number.isFinite(v) && v > 0 && v <= 100) out.push(v);
  }
  return out;
}

export function checkPlans(text: string, drawings: Drawing[], inst: Instrument, risk: RiskSettings, rates: Record<string, number> = {}): PlanCheck[] {
  const stated = lotsInText(text);
  const out: PlanCheck[] = [];
  for (const d of drawings) {
    if (d.type !== "position" || d.stopPrice == null) continue;
    const r = positionSize(inst, risk, d.price, d.stopPrice, d.targetPrice ?? null, rates);
    if (!r) continue;
    const tooWide = r.lot < 0.01;
    // Rounding differences of one step (0.01) are not worth a warning.
    const matches = (l: number) => (tooWide ? l <= 0.01 : Math.abs(l - r.lot) <= 0.0101);
    // When the stop is too wide, show what the smallest lot (0.01) would really risk.
    const perLot = pipValueUsd(inst, d.price, rates) * (risk.currency === "IDR" ? risk.usdIdr : 1);
    out.push({
      side: d.side === "short" ? "short" : "long",
      entry: d.price,
      lot: r.lot,
      riskMoney: tooWide ? 0.01 * r.slPips * perLot : r.riskMoney,
      slPips: r.slPips,
      rr: r.rr,
      tooWide,
      mismatch: stated.length > 0 && !stated.some(matches),
    });
  }
  return out.slice(0, 3);
}
