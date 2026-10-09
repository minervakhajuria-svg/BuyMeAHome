import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { commuteTimeRow, microMarketRow, projectRow, schoolRow, type Dataset } from "@/lib/schemas";
import { loadSampleDataset } from "./sample";

/** Supabase when configured; otherwise the bundled sample CSVs (clearly flagged is_sample). */
export async function loadDataset(): Promise<Dataset> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.warn("Supabase is not configured: using the bundled sample dataset.");
    return loadSampleDataset();
  }
  const db = createClient(url, key, { auth: { persistSession: false } });
  const read = async <T extends z.ZodType>(table: string, schema: T): Promise<z.infer<T>[]> => {
    const { data, error } = await db.from(table).select("*");
    if (error) throw new Error(`Could not read ${table}: ${error.message}`);
    return z.array(schema).parse(data ?? []);
  };
  const [microMarkets, schools, projects, commuteTimes] = await Promise.all([
    read("micro_markets", microMarketRow),
    read("schools", schoolRow),
    read("projects", projectRow),
    read("commute_times", commuteTimeRow),
  ]);
  return { microMarkets, schools, projects, commuteTimes };
}
