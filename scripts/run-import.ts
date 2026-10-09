import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { parseCsv, validateRows } from "../lib/import/csv";
import { TABLES, type TableSpec } from "../lib/import/tables";

try {
  process.loadEnvFile(".env.local");
} catch {
  // env may come from the shell instead
}

interface Options {
  file: string;
  dryRun: boolean;
  /** Dry runs only: a micro_markets CSV to check child slugs against. */
  marketsFile?: string;
}

export function parseArgs(argv: string[]): Options {
  const file = argv.find((a) => !a.startsWith("--"));
  if (!file) throw new Error("Usage: <script> <file.csv> [--dry-run] [--markets <micro_markets.csv>]");
  const mi = argv.indexOf("--markets");
  return { file, dryRun: argv.includes("--dry-run"), marketsFile: mi >= 0 ? argv[mi + 1] : undefined };
}

export async function runImport(name: TableSpec["name"], opts: Options): Promise<void> {
  const spec = TABLES[name];
  const parsed = parseCsv(readFileSync(opts.file, "utf8"));
  const { rows, errors } = validateRows<Record<string, unknown>>(parsed, spec.schema);

  if (errors.length) {
    console.error(`${name}: ${errors.length} problem(s) in ${opts.file}`);
    for (const e of errors.slice(0, 50)) console.error(`  line ${e.line}: ${e.message}`);
    process.exitCode = 1;
    return;
  }

  if (opts.dryRun) {
    if (spec.child && opts.marketsFile) {
      const slugs = new Set(parseCsv(readFileSync(opts.marketsFile, "utf8")).rows.map((r) => r.slug));
      const bad = rows.filter((r) => !slugs.has(String(r.micro_market_slug)));
      if (bad.length) {
        console.error(`${name}: ${bad.length} row(s) reference unknown micro_market_slug, e.g. "${bad[0].micro_market_slug}"`);
        process.exitCode = 1;
        return;
      }
    }
    console.log(`${name}: ${rows.length} valid row(s) (dry run, nothing written)`);
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
  const db = createClient(url, key, { auth: { persistSession: false } });

  let payload = rows;
  if (spec.child) {
    const { data, error } = await db.from("micro_markets").select("id, slug");
    if (error) throw new Error(`Could not read micro_markets: ${error.message}`);
    const idBySlug = new Map((data ?? []).map((m) => [m.slug as string, m.id as string]));
    const unknown = new Set<string>();
    payload = rows.map((r) => {
      const { micro_market_slug, ...rest } = r;
      const id = idBySlug.get(String(micro_market_slug));
      if (!id) unknown.add(String(micro_market_slug));
      return { ...rest, micro_market_id: id };
    });
    if (unknown.size) {
      console.error(`${name}: unknown micro_market_slug(s): ${[...unknown].join(", ")}. Import micro_markets first.`);
      process.exitCode = 1;
      return;
    }
  }

  for (let i = 0; i < payload.length; i += 500) {
    const { error } = await db.from(name).upsert(payload.slice(i, i + 500), { onConflict: spec.conflict });
    if (error) throw new Error(`${name}: ${error.message}`);
  }
  console.log(`${name}: upserted ${payload.length} row(s)`);
}
