import { parseArgs, runImport } from "./run-import";

runImport("schools", parseArgs(process.argv.slice(2))).catch((e) => {
  console.error(e.message);
  process.exit(1);
});
