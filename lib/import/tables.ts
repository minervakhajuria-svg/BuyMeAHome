import { z } from "zod";
import { commuteTimeRow, microMarketRow, projectRow, schoolRow } from "@/lib/schemas";

/**
 * CSV import shapes. Same columns as the database tables, except:
 *  - micro_markets has a stable `slug` (the upsert key) and no `id`
 *  - child tables reference their market by `micro_market_slug`
 * Rows that are not samples must say where the facts came from (source_notes). Collect data by
 * hand or from sources whose terms allow it; never scrape.
 */

export const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "use lowercase letters, digits and hyphens");

export const microMarketImport = microMarketRow
  .omit({ id: true })
  .extend({ slug })
  .refine((r) => r.is_sample || (r.source_notes !== null && r.source_notes.trim() !== ""), {
    message: "source_notes is required unless is_sample is true",
    path: ["source_notes"],
  });

const childRef = { micro_market_slug: z.string().min(1) };
export const schoolImport = schoolRow.omit({ id: true, micro_market_id: true }).extend(childRef);
export const projectImport = projectRow.omit({ id: true, micro_market_id: true }).extend(childRef);
export const commuteTimeImport = commuteTimeRow.omit({ micro_market_id: true }).extend(childRef);

export interface TableSpec {
  /** CLI name, e.g. "micro_markets". */
  name: "micro_markets" | "schools" | "projects" | "commute_times";
  schema: z.ZodObject<z.ZodRawShape>;
  /** Columns for the Postgres ON CONFLICT clause. */
  conflict: string;
  /** True when rows reference micro_markets by slug. */
  child: boolean;
}

export const TABLES: Record<TableSpec["name"], TableSpec> = {
  micro_markets: { name: "micro_markets", schema: microMarketImport as unknown as TableSpec["schema"], conflict: "slug", child: false },
  schools: { name: "schools", schema: schoolImport, conflict: "micro_market_id,name", child: true },
  projects: { name: "projects", schema: projectImport, conflict: "micro_market_id,name", child: true },
  commute_times: { name: "commute_times", schema: commuteTimeImport, conflict: "micro_market_id,destination,mode", child: true },
};
