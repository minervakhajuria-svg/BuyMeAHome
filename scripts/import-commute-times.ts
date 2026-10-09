import { parseArgs, runImport } from "./run-import";

runImport("commute_times", parseArgs(process.argv.slice(2))).catch((e) => {
  console.error(e.message);
  process.exit(1);
});
