/**
 * Exports the AI's scored trade plans as a labelled instruction dataset (FinGPT-style JSONL:
 * instruction / input / output + the market's verdict), for evaluating the tiers or LoRA-tuning
 * an open model later. Also prints the overall record per instrument.
 *
 *   npm run export:plans            (reads the Redis store in .env.local)
 *
 * Writes scripts/plans-dataset.jsonl. Only plans that ran their course (TP, SL, expired) are exported.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadTrack } from "../src/lib/ai/track";
import { regimeOf } from "../src/lib/market/indicators";
import { INSTRUMENTS } from "../src/lib/market/symbols";

async function main() {
const rows: string[] = [];
for (const inst of INSTRUMENTS) {
  const plans = (await loadTrack(inst.id, 150)).filter((p) => p.outcome && ["tp", "sl", "expired"].includes(p.outcome.status));
  if (!plans.length) continue;
  const wins = plans.filter((p) => p.outcome!.r > 0).length;
  const avg = plans.reduce((a, p) => a + p.outcome!.r, 0) / plans.length;
  console.log(`${inst.id.padEnd(7)} ${String(plans.length).padStart(4)} scored · win ${Math.round((100 * wins) / plans.length)}% · avg ${avg.toFixed(2)}R`);
  for (const p of plans) {
    rows.push(JSON.stringify({
      instruction: `Give a trade plan for ${p.symbol} on the ${p.interval} chart.`,
      input: `Price ${p.price}. RSI14 ${p.feat.rsi ?? "n/a"}, ADX14 ${p.feat.adx ?? "n/a"}, regime ${regimeOf(p.feat.turbPct) ?? "n/a"}, EMA trend ${p.feat.trend === 1 ? "up" : p.feat.trend === -1 ? "down" : "flat"}.`,
      output: p.reply ?? `${p.side} entry ${p.entry} SL ${p.sl} TP ${p.tp}`,
      plan: { side: p.side, entry: p.entry, sl: p.sl, tp: p.tp },
      label: { status: p.outcome!.status, r: p.outcome!.r },
      meta: { tier: p.tier, t: p.t },
    }));
  }
}
const out = join(__dirname, "plans-dataset.jsonl");
writeFileSync(out, rows.join("\n") + (rows.length ? "\n" : ""));
console.log(rows.length ? `\n${rows.length} rows → ${out}` : "No scored plans yet (needs the production Redis store in .env.local).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
