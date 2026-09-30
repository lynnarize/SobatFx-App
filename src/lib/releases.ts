// Released actuals read from the news headlines the app already fetches (free, no key).
// Wire services post data releases within minutes in a fixed shape, e.g.
//   "JOLTS job openings 7.079M vs 7.225M estimate"
//   "Australian August Headline CPI 4% (vs. expected 4%, prior 3.5%)"
// A headline only counts as a release when it states the expected value, and it is only attached
// to a calendar event when currency, wording, timing and the expected value all agree with it.
// A wrong actual is worse than none, so anything ambiguous is dropped.

import { parseValue, usualEffect } from "./usual-effect";

export interface Release {
  /** Currency of the country named in the headline (undefined = none named, e.g. "JOLTS …"). */
  currency?: string;
  /** Values in absolute units (7.079M → 7_079_000; 4% → 4). */
  actual: number;
  expected: number;
  prior?: number;
  /** Period stated in the headline, when it says one. */
  period?: "m/m" | "y/y" | "q/q";
  /** A central-bank rate decision ("RBA raises cash rate to 4.60%"): matched to the policy-rate event. */
  rate?: boolean;
  text: string;
}

const BANKS: [string, RegExp][] = [
  ["USD", /\b(Fed|FOMC|Federal Reserve)\b/],
  ["EUR", /\bECB\b|\bEuropean Central Bank\b/],
  ["GBP", /\bBoE\b|\bBOE\b|\bBank of England\b/],
  ["JPY", /\bBoJ\b|\bBOJ\b|\bBank of Japan\b/],
  ["AUD", /\bRBA\b|\bReserve Bank of Australia\b/],
  ["NZD", /\bRBNZ\b|\bReserve Bank of New Zealand\b/],
  ["CAD", /\bBoC\b|\bBOC\b|\bBank of Canada\b/],
  ["CHF", /\bSNB\b|\bSwiss National Bank\b/],
];
const RATE_MOVE = /\b(raises|hikes|lifts|cuts|lowers|trims|holds|keeps|leaves|maintains|keep|hold|leave|raise|hike|cut|lower)\b[^.;:]*?\brates?\b[^.;:]*?\b(?:to|at)\s*(?:a range of\s*)?([-+]?\d+(?:\.\d+)?)\s*%?(?:\s*(?:-|–|to)\s*(\d+(?:\.\d+)?))?\s*%/i;

/** "RBA raises cash rate by 25bp to 4.60%", "Fed cuts rates to 3.75%-4.00%" (range → upper bound, like FF). */
function parseRateDecision(t: string): Release | null {
  const bank = BANKS.find(([, re]) => re.test(t));
  const m = bank && RATE_MOVE.exec(t);
  if (!bank || !m || /\b(expect(s|ed)? to|could|may|might|will|would|should|seen|bets?|pric(e|ing))\b/i.test(t.slice(0, m.index + m[1].length))) return null;
  const v = +(m[3] ?? m[2]);
  return { currency: bank[0], actual: v, expected: v, rate: true, text: t };
}

// A number with an optional unit. Not glued to letters/digits before it (Q2, H1) and not a
// compound like "20-city".
const NUM = String.raw`(?<![A-Za-z\d.])([-+]?\d+(?:\.\d+)?)\s*(%|million|mln|billion|bn|thousand|[kmbt](?![a-z]))?(?![\d-])`;
const KW = String.raw`(?:expected|exp\.?|est\.?|estimate[sd]?|consensus|forecast|f'?cast|survey)`;
const PERIOD = String.raw`(?:\s*(?:y\/y|m\/m|q\/q|yoy|mom|qoq))?`;
const EXPECTED = [
  new RegExp(String.raw`\b(?:vs\.?|versus)\s*${KW}\s*${NUM}`, "i"), // "vs. expected 51.6"
  new RegExp(String.raw`\b(?:vs\.?|versus)\s*${NUM}${PERIOD}\s*${KW}`, "i"), // "vs 89.2 expected"
  new RegExp(String.raw`\(\s*${KW}\s*:?\s*${NUM}`, "i"), // "(expected 50.1"
];
const PRIOR = new RegExp(String.raw`\b(?:prior|previous|prev\.?)\s*(?:was\s*|:\s*)?${NUM}`, "i");

const MULT: Record<string, number> = { k: 1e3, thousand: 1e3, m: 1e6, million: 1e6, mln: 1e6, b: 1e9, bn: 1e9, billion: 1e9, t: 1e12 };
const value = (n: string, unit?: string) => +n * (MULT[(unit ?? "").toLowerCase()] ?? 1);

const COUNTRIES: [string, RegExp][] = [
  ["USD", /\bUS\b|\bU\.S\.|\bUnited States\b|\bAmerican?\b/],
  ["CAD", /\bCanad(a|ian)\b|\bIvey\b/i],
  ["AUD", /\bAustralian?\b|\bAussie\b/i],
  ["NZD", /\bNew Zealand\b|\bNZ\b/],
  ["JPY", /\bJapan(ese)?\b|\bTokyo\b/i],
  ["GBP", /\bUK\b|\bU\.K\.|\bBritain\b|\bBritish\b/],
  ["EUR", /\bEuro ?(zone|area)\b|\bEZ\b|\bGerman(y)?\b|\bFrench\b|\bFrance\b|\bItal(y|ian)\b|\bSpain\b|\bSpanish\b/i],
  ["CHF", /\bSwiss\b|\bSwitzerland\b/i],
];
// Countries without an app currency: never match those headlines to anything.
const OTHER = /\b(China|Chinese|India|Indian|Korea|Korean|Brazil|Mexic|Singapore|Hong Kong|Taiwan|South Africa|Russia|Turkey|Sweden|Swedish|Norway|Norwegian)\b/i;

export function parseRelease(title: string): Release | null {
  const t = title.replace(/(\d),(\d{3})\b/g, "$1$2");
  let m: RegExpExecArray | null = null;
  for (const re of EXPECTED) if ((m = re.exec(t))) break;
  if (!m) return parseRateDecision(t);
  // The actual is the last plain number before the expected value.
  const before = t.slice(0, m.index);
  const nums = [...before.matchAll(new RegExp(NUM, "gi"))].filter((x) => x[2] || !/^\d{4}$/.test(x[1]) || +x[1] < 1900 || +x[1] > 2100);
  const a = nums.at(-1);
  if (!a) return null;
  if (OTHER.test(t)) return null;
  const found = COUNTRIES.filter(([, re]) => re.test(before));
  const prior = PRIOR.exec(t);
  const period = /\b(y\/y|yoy)\b/i.test(t) ? "y/y" : /\b(m\/m|mom)\b/i.test(t) ? "m/m" : /\b(q\/q|qoq)\b/i.test(t) ? "q/q" : undefined;
  return {
    currency: found[0]?.[0],
    actual: value(a[1], a[2]),
    expected: value(m[1], m[2]),
    prior: prior ? value(prior[1], prior[2]) : undefined,
    period,
    text: title,
  };
}

// A preview's figure: "CPI preview: headline inflation seen at 4.0%", "economists expect +90K".
const PREVIEW = new RegExp(String.raw`\b(?:seen at|seen coming in at|seen rising to|seen falling to|expected at|expected to (?:come in at|rise to|fall to|print|be)|forecast(?:ed)? (?:at|to)|consensus (?:is |at |of )?|economists expect|analysts expect|median estimate (?:is |of )?)\s*(?:a\s*)?${NUM}`, "i");
const PREVIEW_HINT = /\bpreview\b|\bahead of\b|\bseen\b|\bexpect/i;

/** A preview headline's expected figure (not a release), or null. */
export function parsePreview(title: string): Release | null {
  const t = title.replace(/(\d),(\d{3})\b/g, "$1$2");
  if (!PREVIEW_HINT.test(t) || OTHER.test(t) || parseRelease(title)) return null;
  const m = PREVIEW.exec(t);
  if (!m) return null;
  const v = value(m[1], m[2]);
  const period = /\b(y\/y|yoy)\b/i.test(t) ? "y/y" : /\b(m\/m|mom)\b/i.test(t) ? "m/m" : /\b(q\/q|qoq)\b/i.test(t) ? "q/q" : undefined;
  return { currency: COUNTRIES.find(([, re]) => re.test(t))?.[0], actual: v, expected: v, period, text: title };
}

/** Previews may appear up to a week before the release, and not after it. */
export const PREVIEW_WINDOW = { from: -7 * 86_400_000, to: -60_000 };

// ── Matching a release to a calendar event ──

// Phrases that mean the same release, reduced to one token on both sides.
const SYN: [RegExp, string][] = [
  [/\badp (national )?(employment|private payrolls?|payrolls?|jobs)( report| change)?\b/g, " adp payrolls "],
  [/\bconsumer prices?\b/g, " cpi "],
  [/\bproducer prices?\b/g, " ppi "],
  [/\bnon-?farm (employment change|payrolls?)\b|\bnfp\b|\bpayrolls?\b/g, " payrolls "],
  [/\b(unemployment|initial jobless|jobless|initial) claims\b/g, " claims "],
  [/\b(unemployment|jobless) rate\b/g, " unemployment "],
  [/\bjob openings\b|\bjolts\b/g, " jolts "],
  [/\b(average )?hourly earnings\b/g, " earnings "],
  [/\bconsumer price index\b|\bcpi\b/g, " cpi "],
  [/\bproducer price index\b|\bppi\b/g, " ppi "],
  [/\bgross domestic product\b|\bgdp\b/g, " gdp "],
  [/\bpurchasing managers'? index\b|\bpmi\b/g, " pmi "],
  [/\bpce price index\b|\bpce\b/g, " pce "],
  [/\bumich\b|\buniversity of michigan\b|\buom\b/g, " uom "],
  [/\bconsumer confidence\b/g, " confidence "],
  [/\bconsumer sentiment\b/g, " sentiment "],
  [/\bclaimant count( change)?\b/g, " claimant "],
];
// Words that say nothing about which release it is.
const STOP = new Set("cb final prelim preliminary flash advance revised second third estimate change index sa nsa the of in a an for to and is at on month monthly quarter quarterly annual annualized headline data report reading level rise rises fall falls m y q us uk eurozone euro area australian australia canada canadian japan japanese german germany french france swiss new zealand nz jan feb mar apr may jun jul aug sep sept oct nov dec january february march april june july august september october november december".split(" "));
// Qualifiers that must agree on both sides (Core PCE ≠ PCE, ADP ≠ NFP, German CPI ≠ Eurozone CPI).
const AGREE: RegExp[] = [/\bcore\b/, /\btrimmed\b/, /\bmedian\b/, /\bcommon\b/, /\bservices?\b/, /\bmanufacturing\b/, /\badp\b/, /\bgerman/, /\bfrench\b|\bfrance\b/, /\bital/, /\bspain\b|\bspanish\b/, /\btokyo\b/, /\bprices?\b/, /\bexpectations\b/];

const norm = (s: string) => {
  let x = ` ${s.toLowerCase()} `;
  for (const [re, to] of SYN) x = x.replace(re, to);
  return x;
};
const tokens = (s: string) => new Set(norm(s).replace(/\b\d+m\/y\b|\b[mqy]\/[mqy]\b/g, " ").split(/[^a-z]+/).filter((w) => w.length > 1 && !STOP.has(w)));

export interface EventLike {
  time: string;
  currency: string;
  title: string;
  forecast: string;
  previous: string;
}

/**
 * Best calendar event for a release headline, or undefined when nothing fits well enough.
 * `window` is when the headline may appear relative to the event (default: release headlines,
 * 2 min before to 3 h after; previews use the days before).
 */
export function matchRelease<E extends EventLike>(r: Release, headlineTime: string, events: E[], window = { from: -2 * 60_000, to: 3 * 3_600_000 }): E | undefined {
  const ht = Date.parse(headlineTime);
  const head = tokens(r.text);
  const headN = norm(r.text);
  const scored = events.flatMap((e) => {
    const eff = usualEffect(e.title);
    if (eff !== "higher" && eff !== "lower") return [];
    if (r.currency && r.currency !== e.currency) return [];
    const et = Date.parse(e.time);
    if (!(ht >= et + window.from && ht <= et + window.to)) return [];
    // Rate decisions: only the policy-rate event, no wording match needed.
    const policy = /\b(cash|funds|bank|refinancing|overnight|policy|deposit)\b.*\brate$/i.test(e.title);
    if (r.rate || policy) {
      if (!(r.rate && policy && r.currency === e.currency)) return [];
      const f = parseValue(e.forecast) ?? parseValue(e.previous);
      if (f == null || Math.abs(r.actual - f) > 1) return [];
      return [{ e, score: 1, gap: Math.abs(r.actual - f), dt: Math.abs(ht - et) }];
    }
    const titleN = norm(e.title);
    if (AGREE.some((re) => re.test(titleN) !== re.test(headN))) return [];
    const period = /\b([mqy]\/[mqy])\b/.exec(e.title)?.[1];
    if (r.period && period && r.period !== period) return [];
    const want = [...tokens(e.title)];
    if (!want.length) return [];
    const score = want.filter((w) => head.has(w)).length / want.length;
    if (score < 0.6) return [];
    // The headline's consensus must be close to FF's forecast: rules out m/m vs y/y and look-alike releases.
    const f = parseValue(e.forecast), p = parseValue(e.previous);
    const refV = f ?? p;
    if (refV == null) return [];
    const gap = Math.abs((f != null ? r.expected : r.actual) - refV);
    if (gap > Math.max(Math.abs(refV) * (f != null ? 0.3 : 1), f != null ? 0.2 : 0.5)) return [];
    return [{ e, score, gap: gap / Math.max(Math.abs(refV), 0.1), dt: Math.abs(ht - et) }];
  });
  scored.sort((a, b) => b.score - a.score || a.gap - b.gap || a.dt - b.dt);
  // Two equally good candidates (same score and closeness): too ambiguous to pick.
  if (scored.length > 1 && scored[0].score === scored[1].score && Math.abs(scored[0].gap - scored[1].gap) < 1e-9) return undefined;
  return scored[0]?.e;
}
