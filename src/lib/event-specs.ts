// Event detail for the calendar ("what is this release and why does it matter"): classifies an
// event by its title, and names who publishes it and how often. The explanations themselves are
// our own wording, in src/lib/i18n.ts under `spec.<kind>.*`. Client-safe, no network.

import { usualEffect, type UsualEffect } from "./usual-effect";

export type SpecKind =
  | "cpi" | "ppi" | "pce" | "gdp" | "gdpPrice" | "payrolls" | "adp" | "employment" | "unemployment" | "claims"
  | "earnings" | "jolts" | "pmi" | "pmiPrices" | "retail" | "confidence" | "inflationExp" | "rate" | "cbTalk"
  | "political" | "trade" | "housing" | "production" | "generic";

export type Frequency = { kind: "weekly" | "monthly" | "quarterly" | "irregular" } | { kind: "meetings"; n: number };

export interface EventSpec {
  kind: SpecKind;
  source?: string;
  frequency: Frequency;
  effect: UsualEffect;
  /** Extra notes that apply to this event (i18n keys `spec.note.<id>`). */
  notes: ("core" | "usGdp" | "flash" | "revisions")[];
}

const POLICY_RATE = /\b(cash|funds|bank|refinancing|overnight|policy|deposit)\b.*\brate$/i;

const KINDS: [SpecKind, RegExp][] = [
  ["inflationExp", /inflation expectations/i],
  ["pmiPrices", /\b(ism|pmi)\b.*\bprices\b|\bprices paid\b/i],
  ["gdpPrice", /gdp price|deflator/i],
  ["pce", /\bpce\b/i],
  ["ppi", /\bppi\b|producer price/i],
  ["cpi", /\bcpi\b|consumer price|\binflation\b/i],
  ["gdp", /\bgdp\b/i],
  ["adp", /\badp\b/i],
  ["payrolls", /non-?farm/i],
  ["claims", /claims|claimant/i],
  ["unemployment", /unemployment rate/i],
  ["earnings", /earnings|wage|labou?r cost/i],
  ["jolts", /jolts|job openings/i],
  ["employment", /employment/i],
  ["pmi", /\bpmi\b|\bism\b|\bivey\b|philly fed|empire state|manufacturing index|\bzew\b|\bifo\b|tankan/i],
  ["retail", /retail sales/i],
  ["confidence", /confidence|sentiment/i],
  ["trade", /trade balance|current account/i],
  ["housing", /housing|home sales|building|permits|starts|mortgage|house price/i],
  ["production", /industrial production|manufacturing production|factory orders|durable goods/i],
];

const BANK: Record<string, string> = {
  USD: "Federal Reserve", EUR: "European Central Bank", GBP: "Bank of England", JPY: "Bank of Japan",
  AUD: "Reserve Bank of Australia", NZD: "Reserve Bank of New Zealand", CAD: "Bank of Canada", CHF: "Swiss National Bank", CNY: "People's Bank of China",
};
/** Policy meetings per year. */
const MEETINGS: Record<string, number> = { USD: 8, EUR: 8, GBP: 8, JPY: 8, AUD: 8, NZD: 7, CAD: 8, CHF: 4 };

// Publishers named in the title win over the per-country default.
const BY_TITLE: [RegExp, string][] = [
  [/\bism\b/i, "Institute for Supply Management"],
  [/\badp\b/i, "ADP Research"],
  [/^cb |conference board/i, "The Conference Board"],
  [/\buom\b|michigan/i, "University of Michigan"],
  [/philly fed/i, "Federal Reserve Bank of Philadelphia"],
  [/empire state/i, "Federal Reserve Bank of New York"],
  [/\bivey\b/i, "Ivey Business School"],
  [/\bzew\b/i, "ZEW"],
  [/\bifo\b/i, "ifo Institute"],
  [/\bgfk\b/i, "GfK"],
  [/tankan/i, "Bank of Japan"],
  [/\bbrc\b/i, "British Retail Consortium"],
  [/\bnab\b/i, "National Australia Bank"],
  [/westpac/i, "Westpac"],
  [/\bpmi\b/i, "S&P Global"],
  [/german/i, "Destatis"],
  [/french/i, "INSEE"],
  [/italian/i, "ISTAT"],
  [/spanish/i, "INE Spain"],
  [/tokyo/i, "Statistics Bureau of Japan"],
];

const US_AGENCY: Partial<Record<SpecKind, string>> = {
  cpi: "Bureau of Labor Statistics", ppi: "Bureau of Labor Statistics", payrolls: "Bureau of Labor Statistics", unemployment: "Bureau of Labor Statistics",
  earnings: "Bureau of Labor Statistics", jolts: "Bureau of Labor Statistics", claims: "Department of Labor",
  gdp: "Bureau of Economic Analysis", gdpPrice: "Bureau of Economic Analysis", pce: "Bureau of Economic Analysis", trade: "Bureau of Economic Analysis",
  retail: "Census Bureau", housing: "Census Bureau", production: "Federal Reserve",
};
const STATS: Record<string, string> = {
  EUR: "Eurostat", GBP: "Office for National Statistics", JPY: "Statistics Bureau of Japan", AUD: "Australian Bureau of Statistics",
  CAD: "Statistics Canada", NZD: "Stats NZ", CHF: "Federal Statistical Office", CNY: "National Bureau of Statistics of China",
};

function sourceOf(kind: SpecKind, currency: string, title: string) {
  if (kind === "political") return undefined;
  if (kind === "rate" || kind === "cbTalk") return BANK[currency];
  const named = BY_TITLE.find(([re]) => re.test(title));
  if (named) return named[1];
  if (currency === "USD") return US_AGENCY[kind];
  if (kind === "gdp" && currency === "JPY") return "Cabinet Office";
  if (kind === "gdp" && currency === "CHF") return "SECO";
  return STATS[currency];
}

function frequencyOf(kind: SpecKind, currency: string, title: string): Frequency {
  if (kind === "claims" && currency === "USD") return { kind: "weekly" };
  if (kind === "political" || /speaks|testimony|hearings/i.test(title)) return { kind: "irregular" };
  if ((kind === "rate" || kind === "cbTalk") && MEETINGS[currency]) return { kind: "meetings", n: MEETINGS[currency] };
  if (kind === "rate" || kind === "cbTalk") return { kind: "irregular" };
  if (/\bq\/q\b/i.test(title) || kind === "gdpPrice") return { kind: "quarterly" };
  if (/\bm\/m\b/i.test(title)) return { kind: "monthly" };
  if (kind === "gdp") return { kind: "quarterly" };
  // New Zealand publishes its labour data quarterly.
  if (currency === "NZD" && (kind === "unemployment" || kind === "employment")) return { kind: "quarterly" };
  return { kind: "monthly" };
}

/** Detail for a calendar event; null for holidays. */
export function eventSpec(title: string, currency: string): EventSpec | null {
  if (/holiday/i.test(title)) return null;
  const effect = usualEffect(title);
  const kind: SpecKind =
    effect === "hawkish" ? "cbTalk"
    : effect === null ? "political"
    : POLICY_RATE.test(title) ? "rate"
    : (KINDS.find(([, re]) => re.test(title))?.[0] ?? "generic");
  const notes: EventSpec["notes"] = [];
  if (/\bcore\b|trimmed|median/i.test(title)) notes.push("core");
  if (kind === "gdp" && currency === "USD") notes.push("usGdp");
  if (/\bflash\b|\bprelim\b|\badvance\b/i.test(title)) notes.push("flash");
  if (kind === "payrolls") notes.push("revisions");
  return { kind, source: sourceOf(kind, currency, title), frequency: frequencyOf(kind, currency, title), effect, notes };
}
