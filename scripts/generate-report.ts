import { readFileSync, writeFileSync } from "node:fs";
import { anthropicModelCall } from "../lib/intake/extract";
import { loadDataset } from "../lib/dataset/load";
import { generateReport } from "../lib/report/generate";
import { buyerProfile } from "../lib/schemas";

try {
  process.loadEnvFile(".env.local");
} catch {
  // env may come from the shell instead
}

// Usage: npm run report -- <profile.json> [--no-llm] [--out report.json]
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--out");
if (!file) {
  console.error("Usage: npm run report -- <profile.json> [--no-llm] [--out report.json]");
  process.exit(1);
}
const outIdx = args.indexOf("--out");

(async () => {
  const profile = buyerProfile.parse(JSON.parse(readFileSync(file, "utf8")));
  const useLlm = !args.includes("--no-llm") && !!process.env.ANTHROPIC_MODEL;
  if (!useLlm) console.warn("Using the template narrative (no model call).");
  const report = await generateReport(profile, await loadDataset(), { call: useLlm ? anthropicModelCall() : undefined });

  console.log(`Narrative: ${report.narrativeSource}${report.narrativeProblems.length ? ` (${report.narrativeProblems.length} problem(s) along the way)` : ""}`);
  for (const p of report.narrativeProblems) console.log(`  - ${p}`);
  console.log(`\n${report.narrative.headline}\n${report.narrative.situation}\n`);
  for (const r of report.scoring.results.filter((x) => x.rank !== null).sort((a, b) => a.rank! - b.rank!)) {
    console.log(`#${r.rank} ${r.status.padEnd(9)} ${String(r.totalScore).padStart(5)}  ${r.name}`);
  }
  for (const r of report.scoring.results.filter((x) => x.rank === null || x.status === "ruled_out")) {
    console.log(`ruled out  ${r.name}: ${r.ruleOuts.map((x) => x.detail).join(" | ")}`);
  }
  if (outIdx >= 0) {
    writeFileSync(args[outIdx + 1], JSON.stringify(report, null, 2));
    console.log(`\nFull report data written to ${args[outIdx + 1]}`);
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
