import { z } from "zod";

/** Calendar date, YYYY-MM-DD. Every dataset fact carries one. */
export const isoDate = z.iso.date();

/** Money is always whole rupees. */
export const rupees = z.number().int().nonnegative();

/** A single value or a range; a single value is stored as min === max. */
export const rupeeRange = z
  .object({ min: rupees, max: rupees })
  .refine((r) => r.min <= r.max, { message: "min must be <= max" });
export type RupeeRange = z.infer<typeof rupeeRange>;

export const importance = z.enum(["must_have", "nice_to_have", "dont_care"]);
export type Importance = z.infer<typeof importance>;

export const board = z.enum(["CBSE", "ICSE", "IB/IGCSE", "State", "Other"]);
export type Board = z.infer<typeof board>;

export const commuteMode = z.enum(["car", "two_wheeler", "metro", "cab_bus"]);
export type CommuteMode = z.infer<typeof commuteMode>;

/** Fixed destinations offered in Q2. "other" and "remote" have no commute data. */
export const workHub = z.enum([
  "orr_bellandur",
  "whitefield",
  "manyata_hebbal",
  "electronic_city",
  "cbd",
  "sarjapur_road",
  "remote",
  "other",
]);
export type WorkHub = z.infer<typeof workHub>;

export const propertyType = z.enum(["apartment", "villa", "independent_house", "plot"]);
export type PropertyType = z.infer<typeof propertyType>;

export const propertyStatus = z.enum(["ready", "under_construction", "resale"]);
export type PropertyStatus = z.infer<typeof propertyStatus>;
