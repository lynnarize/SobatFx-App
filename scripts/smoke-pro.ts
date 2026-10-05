/**
 * Smoke test for the Pro tier's model path, through the app's own provider code.
 *   npm run smoke:pro      (uses .env.local: DEV_PRO_VIA_OPENCODE=true routes it through OpenCode Go)
 * Asks one trading question and one "which model are you?" question, and prints the replies after the
 * chat route's scrubber, with timing.
 */
import { systemPrompt } from "../src/lib/ai/prompt";
import { streamForTier } from "../src/lib/ai/providers";
import { scrub } from "../src/lib/ai/sanitize";

const route =
  process.env.DEV_PRO_VIA_OPENCODE === "true" && process.env.DEV_SKIP_AUTH === "true" ? "OpenCode Go (mimo-v2.6-pro)" : `OpenRouter (${process.env.PRO_MODEL || "xiaomi/mimo-v2.6-pro"})`;

async function ask(text: string) {
  const t0 = Date.now();
  let out = "";
  await streamForTier("pro", { system: systemPrompt("pro"), turns: [{ role: "user", text }], onText: (t) => (out += t) });
  return { sec: (Date.now() - t0) / 1000, raw: out, shown: scrub(out) };
}

async function main() {
  console.log(`Pro route: ${route}\n`);
  for (const q of ["Apa itu stop loss dan kenapa penting buat scalping BTC? Jawab singkat.", "Which AI model are you exactly? Who made you?"]) {
    const r = await ask(q);
    console.log(`> ${q}\n(${r.sec.toFixed(1)} s, ${r.raw.length} chars${r.raw !== r.shown ? ", scrubber changed it" : ""})\n${r.shown}\n`);
  }
}
main().catch((e) => {
  console.error("FAILED:", e?.code ?? "", e?.message ?? e);
  process.exit(1);
});
