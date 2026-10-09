import { runImport } from "./run-import";

// Loads the clearly-marked sample dataset (is_sample = true). Order matters: markets first.
const dryRun = process.argv.includes("--dry-run");
const dir = "data/sample";
const marketsFile = `${dir}/micro_markets.csv`;

(async () => {
  for (const name of ["micro_markets", "schools", "projects", "commute_times"] as const) {
    await runImport(name, { file: `${dir}/${name}.csv`, dryRun, marketsFile });
    if (process.exitCode) return;
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
