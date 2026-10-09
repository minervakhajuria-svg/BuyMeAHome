import { readFileSync } from "node:fs";
import path from "node:path";
import { parseCsv, validateRows } from "@/lib/import/csv";
import { TABLES } from "@/lib/import/tables";
import type { Dataset } from "@/lib/schemas";

/** Loads data/sample/*.csv as a Dataset, using each market's slug as its id. For local use and tests. */
export function loadSampleDataset(dir = path.join(process.cwd(), "data", "sample")): Dataset {
  const read = (name: keyof typeof TABLES) => {
    const { rows, errors } = validateRows<Record<string, unknown>>(parseCsv(readFileSync(path.join(dir, `${name}.csv`), "utf8")), TABLES[name].schema);
    if (errors.length) throw new Error(`${name}.csv: ${errors[0].message} (line ${errors[0].line})`);
    return rows;
  };
  const withId = (rows: Record<string, unknown>[]) => rows.map(({ micro_market_slug, ...r }) => ({ ...r, micro_market_id: micro_market_slug }));
  return {
    microMarkets: read("micro_markets").map(({ slug, ...r }) => ({ ...r, id: slug })),
    schools: withId(read("schools")),
    projects: withId(read("projects")),
    commuteTimes: withId(read("commute_times")),
  } as unknown as Dataset;
}
