import { z } from "zod";
import { board, commuteMode, isoDate, propertyStatus, rupees } from "./common";

/**
 * Dataset row schemas mirror supabase/migrations/0001_schema.sql (snake_case) and are lenient
 * about CSV input: empty cells become null, numeric strings become numbers.
 */

const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

const optText = z.preprocess(blankToNull, z.string().nullable()).default(null);
const optInt = z.preprocess(
  blankToNull,
  z.coerce.number().int().nullable(),
).default(null);
const optNum = z.preprocess(blankToNull, z.coerce.number().nullable()).default(null);

const csvBool = z.preprocess((v) => {
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["true", "t", "1", "yes", "y"].includes(s)) return true;
    if (["false", "f", "0", "no", "n", ""].includes(s)) return false;
  }
  return v;
}, z.boolean());

/** typical_price_by_bhk: { "2": { min, max }, "3": { min, max } } in rupees. May arrive as JSON text. */
export const priceByBhk = z.preprocess(
  (v) => {
    const b = blankToNull(v);
    return typeof b === "string" ? JSON.parse(b) : b;
  },
  z
    .record(
      z.string().regex(/^[1-6]$/),
      z.object({ min: rupees, max: rupees }).refine((r) => r.min <= r.max),
    )
    .nullable(),
).default(null);

export const microMarketRow = z.object({
  id: z.uuid().optional(),
  name: z.string().min(1),
  corridor: z.string().min(1),
  lat: optNum,
  lng: optNum,
  price_per_sqft_min: optInt,
  price_per_sqft_max: optInt,
  typical_price_by_bhk: priceByBhk,
  nearest_metro: optText,
  metro_status: optText,
  flood_risk_note: optText,
  water_note: optText,
  power_note: optText,
  air_noise_note: optText,
  walkability_score: z.preprocess(
    blankToNull,
    z.coerce.number().int().min(0).max(100).nullable(),
  ).default(null),
  greenery_note: optText,
  hospitals_note: optText,
  airport_minutes: optInt,
  as_of_date: isoDate,
  source_notes: optText,
  is_sample: csvBool.default(false),
});
export type MicroMarketRow = z.infer<typeof microMarketRow>;

export const schoolRow = z.object({
  id: z.uuid().optional(),
  micro_market_id: z.string().min(1),
  name: z.string().min(1),
  board,
  notes: optText,
  as_of_date: isoDate,
});
export type SchoolRow = z.infer<typeof schoolRow>;

export const projectRow = z.object({
  id: z.uuid().optional(),
  micro_market_id: z.string().min(1),
  name: z.string().min(1),
  rera_number: optText,
  status: z.preprocess(blankToNull, propertyStatus.nullable()).default(null),
  khata_type: z.preprocess(blankToNull, z.enum(["A", "B", "unknown"]).nullable()).default(null),
  oc_cc_status: optText,
  as_of_date: isoDate,
});
export type ProjectRow = z.infer<typeof projectRow>;

export const commuteTimeRow = z.object({
  micro_market_id: z.string().min(1),
  destination: z.string().min(1),
  mode: commuteMode,
  peak_minutes: z.coerce.number().int().positive(),
  as_of_date: isoDate,
});
export type CommuteTimeRow = z.infer<typeof commuteTimeRow>;

/** Everything the scoring engine needs, loaded once per report. */
export const dataset = z.object({
  microMarkets: z.array(microMarketRow),
  schools: z.array(schoolRow),
  projects: z.array(projectRow),
  commuteTimes: z.array(commuteTimeRow),
});
export type Dataset = z.infer<typeof dataset>;
