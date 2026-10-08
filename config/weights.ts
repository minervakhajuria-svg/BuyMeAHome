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
