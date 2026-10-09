import { z } from "zod";
import { isoDate } from "./common";

/** The six scored dimensions; keys match config/weights.ts. */
export const dimension = z.enum([
  "commute",
  "budgetFit",
  "schools",
  "infrastructure",
  "lifestyle",
  "communityAmenities",
]);
export type Dimension = z.infer<typeof dimension>;

/**
 * One dimension's result. `score` is 0 to 100, or null when the dataset lacks the facts to score
 * it ("not available"); null dimensions are excluded and their weight is redistributed.
 */
export const dimensionScore = z.object({
  dimension,
  score: z.number().min(0).max(100).nullable(),
  /** Weight after must-have adjustment and normalisation (all applied weights sum to 100). */
  weight: z.number().min(0).max(100),
  /** Plain-language reasons, built from dataset facts only. */
  notes: z.array(z.string()).default([]),
});
export type DimensionScore = z.infer<typeof dimensionScore>;

export const ruleOut = z.object({
  stage: z.enum(["hard_filter", "score"]),
  /** Stable machine id, e.g. "budget", "property_type", "khata", "rera", "low_score". */
  rule: z.string().min(1),
  /** Human-readable explanation with the numbers that triggered it. */
  detail: z.string().min(1),
});
export type RuleOut = z.infer<typeof ruleOut>;

export const scoredResult = z.object({
  microMarketId: z.string().min(1),
  name: z.string().min(1),
  corridor: z.string().min(1),
  /** Weighted 0 to 100 total; null for markets removed by a hard filter. */
  totalScore: z.number().min(0).max(100).nullable(),
  /** 1-based rank among surviving markets; null if excluded. */
  rank: z.number().int().positive().nullable(),
  status: z.enum(["top", "backup", "ruled_out"]),
  dimensions: z.array(dimensionScore),
  ruleOuts: z.array(ruleOut),
  /** Facts the dataset did not have, reported as "not available". */
  dataGaps: z.array(z.string()).default([]),
  asOfDate: isoDate,
  isSample: z.boolean(),
});
export type ScoredResult = z.infer<typeof scoredResult>;

/** Everything the report writer (LLM) and the report page receive. */
export const scoringOutput = z.object({
  results: z.array(scoredResult),
  /** Human-readable list of defaults applied for skipped or missing answers. */
  usedDefaults: z.array(z.string()),
  dataAsOf: isoDate,
  hasSampleData: z.boolean(),
});
export type ScoringOutput = z.infer<typeof scoringOutput>;
