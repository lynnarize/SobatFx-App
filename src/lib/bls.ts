// Official US actuals from the Bureau of Labor Statistics API (free, public-domain data).
// Forex Factory gives the schedule, forecast and previous; BLS gives the released figure from the
// source itself, so for these events it outranks anything read from headlines.
//
// Matching a release to its data period without a release calendar: each report comes out a known
// number of days after its reference month or quarter ends (NFP 0–12 days, CPI 8–20, JOLTS 26–42 …),
// so the event's release date pins one period. BLS only has that period once it's released, so
// nothing can be filled early, and a delayed report (e.g. a government shutdown) finds no data.
// "Revised" releases (e.g. Revised Nonfarm Productivity) are left out on purpose: their period is
// already in BLS from the first estimate, so the old figure would show before the revision lands.
//
// Terms: https://www.bls.gov/developers/termsOfService.htm — show the retrieval date and BLS's
// disclaimer wherever these figures appear (see news.blsNote / news.actualFrom).

type Calc = "level" | "diff" | "pct1" | "pct12";

interface Spec {
  series: string;
  calc: Calc;
  /** Multiplier to absolute units (CES/JOLTS levels are in thousands). */
  scale?: number;
  /** Days between the reference period's last day and the release. */
  after: [number, number];
  /** Quarterly data (periods "2026-Q2"); otherwise monthly ("2026-09"). */
  quarterly?: boolean;
  /**
   * The agency derives its published % changes from the rounded index values the API serves, so
   * ours match exactly. Otherwise a change the indexes' rounding could flip is skipped.
   */
  exact?: boolean;
}

const NFP_DAYS: [number, number] = [0, 12];
const CPI_DAYS: [number, number] = [8, 20];
const PPI_DAYS: [number, number] = [7, 20];

/** Forex Factory USD titles → BLS series. IDs checked against data.bls.gov series titles. */
export const BLS_EVENTS: Record<string, Spec> = {
  "Non-Farm Employment Change": { series: "CES0000000001", calc: "diff", scale: 1000, after: NFP_DAYS },
  "Unemployment Rate": { series: "LNS14000000", calc: "level", after: NFP_DAYS },
  "Average Hourly Earnings m/m": { series: "CES0500000003", calc: "pct1", after: NFP_DAYS },
  "Average Hourly Earnings y/y": { series: "CES0500000003", calc: "pct12", after: NFP_DAYS },
  "CPI m/m": { series: "CUSR0000SA0", calc: "pct1", after: CPI_DAYS },
  "Core CPI m/m": { series: "CUSR0000SA0L1E", calc: "pct1", after: CPI_DAYS },
  "CPI y/y": { series: "CUUR0000SA0", calc: "pct12", after: CPI_DAYS },
  "Core CPI y/y": { series: "CUUR0000SA0L1E", calc: "pct12", after: CPI_DAYS },
  "PPI m/m": { series: "WPSFD4", calc: "pct1", after: PPI_DAYS },
  "Core PPI m/m": { series: "WPSFD49104", calc: "pct1", after: PPI_DAYS },
  "JOLTS Job Openings": { series: "JTS000000000000000JOL", calc: "level", scale: 1000, after: [26, 42] },
  // MXP technical note: "percent changes are then derived from the rounded index values".
  "Import Prices m/m": { series: "EIUIR", calc: "pct1", after: [8, 24], exact: true },
  "Employment Cost Index q/q": { series: "CIS1010000000000Q", calc: "level", after: [20, 45], quarterly: true },
  // Annualized % changes, as FF shows them.
  "Prelim Nonfarm Productivity q/q": { series: "PRS85006092", calc: "level", after: [25, 50], quarterly: true },
  "Prelim Unit Labor Costs q/q": { series: "PRS85006112", calc: "level", after: [25, 50], quarterly: true },
};

export const blsSpec = (currency: string, title: string) => (currency === "USD" ? BLS_EVENTS[title] : undefined);

/** "2026-09" (or "2026-Q3"): the data period a release on `releaseIso` covers, or null if none/ambiguous. */
export function refPeriod(releaseIso: string, spec: Pick<Spec, "after" | "quarterly">) {
  const t = Date.parse(releaseIso);
  const periods = new Set<string>();
  // Every month (quarter) whose last day falls `after` days before the release.
  for (let d = spec.after[0]; d <= spec.after[1]; d++) {
    const x = new Date(t - d * 86_400_000);
    const next = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate() + 1));
    if (next.getUTCDate() !== 1) continue;
    const m = x.getUTCMonth() + 1;
    if (!spec.quarterly) periods.add(`${x.getUTCFullYear()}-${String(m).padStart(2, "0")}`);
    else if (m % 3 === 0) periods.add(`${x.getUTCFullYear()}-Q${m / 3}`);
  }
  return periods.size === 1 ? [...periods][0] : null;
}

const shift = (ym: string, by: number) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

/** BLS observations by period: { "2026-09": 159044 }. */
export type Observations = Record<string, number>;

/** A series' observations and the decimals BLS publishes it with ("37.50" → 2; a number would lose the 0). */
export interface Series {
  obs: Observations;
  decimals: number;
}

/**
 * One-decimal rounding of a % change, or null when the inputs' own rounding (half a unit of their
 * last published decimal) could flip it.
 */
function pctChange(v: number, base: number, decimals: number, exact?: boolean) {
  const r = (x: number) => Math.round(x * 1000) / 10;
  if (exact) return r(v / base - 1);
  const h = 0.5 * 10 ** -decimals;
  const lo = r((v - h) / (base + h) - 1);
  const hi = r((v + h) / (base - h) - 1);
  return lo === hi ? lo : null;
}

/** The released figure in absolute units (+29K → 29000, 0.1% → 0.1), or null until BLS has the period. */
export function actualFrom(spec: Spec, { obs, decimals }: Series, period: string): number | null {
  const v = obs[period];
  if (v == null) return null;
  const scale = spec.scale ?? 1;
  if (spec.calc === "level") return v * scale;
  const base = obs[shift(period, spec.calc === "pct12" ? -12 : -1)];
  if (base == null) return null;
  if (spec.calc === "diff") return Math.round((v - base) * scale);
  return pctChange(v, base, decimals, spec.exact);
}

interface BlsResponse {
  status: string;
  message?: string[];
  Results?: { series: { seriesID: string; data: { year: string; period: string; value: string }[] }[] };
}

/** Monthly observations for `series` from `startYear`, one request (≤ 25 series without a key, 50 with). */
export async function fetchBls(series: string[], startYear: number): Promise<Record<string, Series>> {
  const key = process.env.BLS_API_KEY;
  const r = await fetch("https://api.bls.gov/publicAPI/v2/timeseries/data/", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ seriesid: series, startyear: String(startYear), endyear: String(new Date().getUTCFullYear()), ...(key && { registrationkey: key }) }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`bls ${r.status}`);
  const d = (await r.json()) as BlsResponse;
  if (d.status !== "REQUEST_SUCCEEDED") throw new Error(`bls ${d.status}: ${d.message?.join("; ")}`);
  const out: Record<string, Series> = {};
  for (const s of d.Results?.series ?? []) {
    const obs: Observations = {};
    let decimals = 0;
    for (const p of s.data) {
      decimals = Math.max(decimals, /\.(\d+)$/.exec(p.value.trim())?.[1].length ?? 0);
      // M01–M12 or Q01–Q04 (M13 is the annual average); "-" marks a missing value.
      const v = parseFloat(p.value);
      if (!Number.isFinite(v)) continue;
      if (/^M(0[1-9]|1[0-2])$/.test(p.period)) obs[`${p.year}-${p.period.slice(1)}`] = v;
      else if (/^Q0[1-4]$/.test(p.period)) obs[`${p.year}-Q${p.period[2]}`] = v;
    }
    out[s.seriesID] = { obs, decimals };
  }
  return out;
}
