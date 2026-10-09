import type { InfraItem, LifestyleItem, QuestionId, WorkHub } from "@/lib/schemas";

/**
 * The 10 intake questions, in order. Wording lives here, not in the model: Claude only extracts
 * answers and never asks, adds or reorders questions.
 */
export interface QuestionDef {
  id: QuestionId;
  /** Short label for the sidebar. */
  title: string;
  prompt: string;
  hint?: string;
}

export const QUESTIONS: QuestionDef[] = [
  { id: "household", title: "Household", prompt: "Who will live in this home?", hint: "Adults, kids and their ages, parents, pets." },
  { id: "work", title: "Work and commute", prompt: "Where do you and your partner work, and how far will you travel?", hint: "Peak-hour, one way." },
  { id: "schools", title: "Schools", prompt: "Which school board do you prefer, and what is the farthest school run you will accept?" },
  { id: "budget", title: "Budget", prompt: "What is your all-in budget, down payment, household income and existing EMIs?", hint: "A range is fine if you are unsure." },
  { id: "property", title: "Property", prompt: "What kind of home are you looking for?" },
  { id: "legal", title: "Legal comfort", prompt: "How comfortable are you on legal status?", hint: "A-khata and RERA registration affect loans and resale." },
  { id: "community", title: "Community and amenities", prompt: "Gated community or standalone, and which basics must be there?" },
  { id: "infrastructure", title: "Infrastructure", prompt: "How much does each of these matter to you?" },
  { id: "lifestyle", title: "Lifestyle", prompt: "And how much does each of these matter?" },
  { id: "dealbreakers", title: "Dealbreakers", prompt: "Anything that is an absolute dealbreaker? You can skip this.", hint: "Optional, in your own words." },
];

export const QUESTION_BY_ID = Object.fromEntries(QUESTIONS.map((q) => [q.id, q])) as Record<QuestionId, QuestionDef>;

export const HUB_LABELS: Record<WorkHub, string> = {
  orr_bellandur: "ORR / Bellandur",
  whitefield: "Whitefield",
  manyata_hebbal: "Manyata / Hebbal",
  electronic_city: "Electronic City",
  cbd: "CBD",
  sarjapur_road: "Sarjapur Road",
  remote: "Remote",
  other: "Other",
};

export const INFRA_LABELS: Record<InfraItem, string> = {
  water_source: "Water source (Cauvery vs borewell or tanker)",
  flood_history: "Flood history",
  power_cuts: "Power cuts",
  garbage_roads: "Garbage and road quality",
  air_noise: "Air and noise",
};

export const LIFESTYLE_LABELS: Record<LifestyleItem, string> = {
  walkability: "Walkability",
  greenery_lakes: "Greenery or lakes",
  restaurants_cafes: "Restaurants and cafes",
  hospitals: "Hospitals",
  airport_access: "Airport access",
};
