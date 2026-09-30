// Forex Factory's "Usual Effect" for calendar events, as a rulebook. FF only shows it on each
// event's detail page (not in the weekly feed), but it follows three fixed patterns — checked
// against the detail pages of all 93 medium/high-impact events of Sep 2026:
//   - default:            'Actual' greater than 'Forecast' is good for currency
//   - labour slack:       'Actual' less than 'Forecast' is good for currency (unemployment, claims)
//   - central-bank talk:  More hawkish than expected is good for currency
//   - political speakers: no usual effect
// Client-safe (the news page uses it to colour actuals).

export type UsualEffect = "higher" | "lower" | "hawkish" | null;

const LOWER = /\b(unemployment (rate|claims)|jobless claims|continuing claims|claimant count)\b/i;
// Politicians' titles start with their office ("President Trump Speaks"); central bankers' start with the bank ("ECB President Lagarde Speaks").
const NONE = /^(president|vice president|treasury sec|prime minister|chancellor|pm)\b|\b(election|holiday)\b/i;
const HAWKISH = /\b(speaks|statement|press conference|minutes|projections|summary|votes|testimony|hearings|report hearings|policy assessment|policy report|meeting)\b/i;

export function usualEffect(title: string): UsualEffect {
  if (LOWER.test(title)) return "lower";
  if (NONE.test(title)) return null;
  if (HAWKISH.test(title)) return "hawkish";
  return "higher";
}

/** Parses FF-style values: "4.1%", "-0.3%", "90K", "1.2B", "<1.25%". */
export function parseValue(v: Value) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (!v) return null;
  const m = /(-?\d+(?:\.\d+)?)\s*([KMBT])?/i.exec(v.replace(/,/g, ""));
  if (!m) return null;
  const mult = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 }[(m[2] ?? "").toUpperCase() as "K"] ?? 1;
  return +m[1] * mult;
}

/**
 * +1 = better for the currency than expected, −1 = worse, 0 = in line, null = can't tell.
 * Compared with the forecast, or with the previous value when there is no forecast (like FF).
 * Pass values in the same units (all FF strings, or all numbers from one API).
 */
export function surprise(title: string, actual: Value, forecast?: Value, previous?: Value): -1 | 0 | 1 | null {
  const eff = usualEffect(title);
  if (eff !== "higher" && eff !== "lower") return null;
  const a = parseValue(actual);
  const ref = parseValue(forecast) ?? parseValue(previous);
  if (a == null || ref == null) return null;
  const d = a - ref;
  if (Math.abs(d) < 1e-9 * Math.max(1, Math.abs(ref))) return 0;
  return (d > 0) === (eff === "higher") ? 1 : -1;
}

type Value = string | number | null | undefined;

/** How a currency-positive surprise moves an instrument: +1 up, −1 down, 0 not a leg of it. */
export function pairDirection(currency: string, inst: { base: string; quote: string }) {
  return inst.base === currency ? 1 : inst.quote === currency ? -1 : 0;
}
