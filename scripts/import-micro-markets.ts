import { parseArgs, runImport } from "./run-import";

runImport("micro_markets", parseArgs(process.argv.slice(2))).catch((e) => {
  console.error(e.message);
  process.exit(1);
});
