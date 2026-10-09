// Starting scoring weights (sum to 100). Tune after friends-and-family testing.

export const BASE_WEIGHTS = {
  commute: 25,
  budgetFit: 25,
  schools: 20,
  infrastructure: 15,
  lifestyle: 10,
  communityAmenities: 5,
} as const;

export type WeightKey = keyof typeof BASE_WEIGHTS;

/** How many markets are headlined and how many are kept as backups. Everything else is ruled out. */
export const TOP_N = 3;
export const BACKUP_N = 3;

/** A market needs data for at least this share of the applicable weight to be ranked at all. */
export const MIN_COVERAGE = 0.6;
