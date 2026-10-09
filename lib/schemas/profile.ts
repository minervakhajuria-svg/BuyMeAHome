import { z } from "zod";
import {
  board,
  commuteMode,
  importance,
  propertyStatus,
  propertyType,
  rupeeRange,
  rupees,
  workHub,
} from "./common";

/**
 * BuyerProfile: one optional block per intake question. A missing block means the question was
 * not answered yet or was skipped (see `skipped`). Defaults are applied later by
 * lib/profile/defaults.ts, never silently inside this schema.
 *
 * There is deliberately no field for caste, religion or community.
 */

export const QUESTION_IDS = [
  "household",
  "work",
  "schools",
  "budget",
  "property",
  "legal",
  "community",
  "infrastructure",
  "lifestyle",
  "dealbreakers",
] as const;
export const questionId = z.enum(QUESTION_IDS);
export type QuestionId = z.infer<typeof questionId>;

export const householdAnswer = z.object({
  adults: z.number().int().min(1).max(10).optional(),
  kidAges: z.array(z.number().int().min(0).max(25)).max(8).default([]),
  parentsLiving: z.boolean().default(false),
  pets: z.boolean().default(false),
});

const workplace = z.object({
  who: z.enum(["you", "partner"]),
  hub: workHub,
  otherLabel: z.string().max(80).optional(),
});

export const workAnswer = z.object({
  workplaces: z.array(workplace).max(4).default([]),
  officeDaysPerWeek: z.number().int().min(0).max(7).optional(),
  maxCommuteMinutes: z.number().int().min(5).max(180).optional(),
  mode: commuteMode.optional(),
});

export const schoolsAnswer = z.object({
  board: z.enum(["CBSE", "ICSE", "IB/IGCSE", "State", "open"]).optional(),
  maxSchoolRunMinutes: z.number().int().min(5).max(90).optional(),
});

export const budgetAnswer = z.object({
  /** All-in budget; a single figure is stored as min === max. */
  allInBudget: rupeeRange.optional(),
  downPayment: rupees.optional(),
  householdMonthlyIncome: rupees.optional(),
  existingMonthlyEmis: rupees.optional(),
});

export const propertyAnswer = z.object({
  types: z.array(propertyType).default([]),
  statuses: z.array(propertyStatus).default([]),
  minBhk: z.number().int().min(1).max(6).optional(),
  minCarpetSqft: z.number().int().min(100).max(10000).optional(),
});

export const legalAnswer = z.object({
  khata: z.enum(["a_only", "b_acceptable"]).optional(),
  reraWithOcCcRequired: z.boolean().optional(),
});

export const communityMustHave = z.enum(["parking", "power_backup", "lift"]);
export type CommunityMustHave = z.infer<typeof communityMustHave>;

export const communityAnswer = z.object({
  setting: z.enum(["gated_with_clubhouse", "standalone", "either"]).optional(),
  mustHaves: z.array(communityMustHave).default([]),
});

export const INFRA_ITEMS = [
  "water_source",
  "flood_history",
  "power_cuts",
  "garbage_roads",
  "air_noise",
] as const;
export const infraItem = z.enum(INFRA_ITEMS);
export type InfraItem = z.infer<typeof infraItem>;

export const LIFESTYLE_ITEMS = [
  "walkability",
  "greenery_lakes",
  "restaurants_cafes",
  "hospitals",
  "airport_access",
] as const;
export const lifestyleItem = z.enum(LIFESTYLE_ITEMS);
export type LifestyleItem = z.infer<typeof lifestyleItem>;

export const infrastructureAnswer = z.object({
  ratings: z.partialRecord(infraItem, importance).default({}),
});
export const lifestyleAnswer = z.object({
  ratings: z.partialRecord(lifestyleItem, importance).default({}),
});

export const dealbreakersAnswer = z.object({
  text: z.string().trim().max(1000).optional(),
});

export const buyerProfile = z.object({
  household: householdAnswer.optional(),
  work: workAnswer.optional(),
  schools: schoolsAnswer.optional(),
  budget: budgetAnswer.optional(),
  property: propertyAnswer.optional(),
  legal: legalAnswer.optional(),
  community: communityAnswer.optional(),
  infrastructure: infrastructureAnswer.optional(),
  lifestyle: lifestyleAnswer.optional(),
  dealbreakers: dealbreakersAnswer.optional(),
  /** Questions the user explicitly skipped (so the sidebar can say "skipped"). */
  skipped: z.array(questionId).default([]),
});
export type BuyerProfile = z.infer<typeof buyerProfile>;

/** A patch the intake extractor may apply: exactly one question's answer, or a skip. */
export const profilePatch = z.discriminatedUnion("question", [
  z.object({ question: z.literal("household"), answer: householdAnswer }),
  z.object({ question: z.literal("work"), answer: workAnswer }),
  z.object({ question: z.literal("schools"), answer: schoolsAnswer }),
  z.object({ question: z.literal("budget"), answer: budgetAnswer }),
  z.object({ question: z.literal("property"), answer: propertyAnswer }),
  z.object({ question: z.literal("legal"), answer: legalAnswer }),
  z.object({ question: z.literal("community"), answer: communityAnswer }),
  z.object({ question: z.literal("infrastructure"), answer: infrastructureAnswer }),
  z.object({ question: z.literal("lifestyle"), answer: lifestyleAnswer }),
  z.object({ question: z.literal("dealbreakers"), answer: dealbreakersAnswer }),
  z.object({ question: z.literal("skip"), skipped: questionId }),
]);
export type ProfilePatch = z.infer<typeof profilePatch>;

export function applyPatch(profile: BuyerProfile, patch: ProfilePatch): BuyerProfile {
  if (patch.question === "skip") {
    const skipped = Array.from(new Set([...profile.skipped, patch.skipped]));
    const next = { ...profile, skipped };
    delete next[patch.skipped];
    return next;
  }
  return {
    ...profile,
    [patch.question]: patch.answer,
    skipped: profile.skipped.filter((q) => q !== patch.question),
  };
}

/** Q3 is only asked when Q1 includes kids. */
export function schoolsQuestionApplies(profile: BuyerProfile): boolean {
  return (profile.household?.kidAges.length ?? 0) > 0;
}
