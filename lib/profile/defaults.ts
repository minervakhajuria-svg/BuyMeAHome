import type { BuyerProfile, InfraItem, LifestyleItem, PropertyStatus, PropertyType } from "@/lib/schemas";
import { INFRA_ITEMS, LIFESTYLE_ITEMS, schoolsQuestionApplies } from "@/lib/schemas";
import type { Importance } from "@/lib/schemas";

/**
 * Documented defaults for skipped or missing answers. Anything defaulted is listed in
 * `usedDefaults` and shown in the report. Where no safe default exists (budget, workplace),
 * the dimension is left unresolved: the filter is not applied or the dimension is unscored,
 * and the report says so instead of guessing.
 */

export const DEFAULTS = {
  adults: 2,
  officeDaysPerWeek: 5,
  maxCommuteMinutes: 45,
  commuteMode: "car",
  schoolBoard: "open",
  maxSchoolRunMinutes: 20,
  minBhk: 2,
  propertyTypes: ["apartment"],
  propertyStatuses: ["ready", "under_construction", "resale"],
  khata: "a_only",
  reraWithOcCcRequired: true,
  communitySetting: "either",
  rating: "nice_to_have",
} as const;

export interface ResolvedProfile {
  adults: number;
  kidAges: number[];
  parentsLiving: boolean;
  pets: boolean;
  /** Empty when workplaces are unknown or remote: commute is then not scored. */
  workHubs: string[];
  officeDaysPerWeek: number;
  maxCommuteMinutes: number;
  commuteMode: "car" | "two_wheeler" | "metro" | "cab_bus";
  /** Null when there are no kids: schools are not scored. */
  school: { board: "CBSE" | "ICSE" | "IB/IGCSE" | "State" | "open"; maxRunMinutes: number } | null;
  /** Null when no budget was given: no budget filter, budget fit not scored. */
  budget: { min: number; max: number } | null;
  downPayment: number | null;
  householdMonthlyIncome: number | null;
  existingMonthlyEmis: number;
  propertyTypes: PropertyType[];
  propertyStatuses: PropertyStatus[];
  minBhk: number;
  minCarpetSqft: number | null;
  khata: "a_only" | "b_acceptable";
  reraWithOcCcRequired: boolean;
  communitySetting: "gated_with_clubhouse" | "standalone" | "either";
  communityMustHaves: string[];
  infrastructure: Record<InfraItem, Importance>;
  lifestyle: Record<LifestyleItem, Importance>;
  dealbreakers: string | null;
}

export interface ResolveResult {
  resolved: ResolvedProfile;
  /** Human-readable lines for the report's "defaults used" list. */
  usedDefaults: string[];
}

export function resolveProfile(p: BuyerProfile): ResolveResult {
  const used: string[] = [];
  const dflt = <T>(value: T | undefined, fallback: T, note: string): T => {
    if (value === undefined) {
      used.push(note);
      return fallback;
    }
    return value;
  };

  const adults = dflt(p.household?.adults, DEFAULTS.adults, `Household: assumed ${DEFAULTS.adults} adults`);

  const workHubs = (p.work?.workplaces ?? [])
    .map((w) => w.hub)
    .filter((h) => h !== "remote" && h !== "other");
  if (workHubs.length === 0) {
    used.push("Work: no office location given, so commute was not scored");
  }
  const officeDays = dflt(
    p.work?.officeDaysPerWeek,
    DEFAULTS.officeDaysPerWeek,
    `Work: assumed ${DEFAULTS.officeDaysPerWeek} office days a week`,
  );
  const maxCommute = dflt(
    p.work?.maxCommuteMinutes,
    DEFAULTS.maxCommuteMinutes,
    `Work: assumed a maximum one-way peak commute of ${DEFAULTS.maxCommuteMinutes} minutes`,
  );
  const mode = dflt(p.work?.mode, DEFAULTS.commuteMode, `Work: assumed commute by ${DEFAULTS.commuteMode}`);

  let school: ResolvedProfile["school"] = null;
  if (schoolsQuestionApplies(p)) {
    school = {
      board: dflt(p.schools?.board, DEFAULTS.schoolBoard, "Schools: no board preference, any board accepted"),
      maxRunMinutes: dflt(
        p.schools?.maxSchoolRunMinutes,
        DEFAULTS.maxSchoolRunMinutes,
        `Schools: assumed a school run of at most ${DEFAULTS.maxSchoolRunMinutes} minutes`,
      ),
    };
  }

  const budget = p.budget?.allInBudget ?? null;
  if (!budget) used.push("Budget: none given, so no budget filter was applied and budget fit was not scored");
  if (budget && p.budget?.householdMonthlyIncome === undefined) {
    used.push("Budget: no household income given, so EMI affordability was not assessed");
  }

  const types = p.property?.types.length ? p.property.types : undefined;
  const propertyTypes = dflt<PropertyType[]>(types, [...DEFAULTS.propertyTypes], "Property: assumed apartment");
  const statuses = p.property?.statuses.length ? p.property.statuses : undefined;
  const propertyStatuses = dflt<PropertyStatus[]>(
    statuses,
    [...DEFAULTS.propertyStatuses],
    "Property: ready, under-construction and resale all accepted",
  );
  const minBhk = dflt(p.property?.minBhk, DEFAULTS.minBhk, `Property: assumed at least ${DEFAULTS.minBhk} BHK`);

  const khata = dflt(p.legal?.khata, DEFAULTS.khata, "Legal: assumed A-khata only");
  const rera = dflt(
    p.legal?.reraWithOcCcRequired,
    DEFAULTS.reraWithOcCcRequired,
    "Legal: assumed RERA-registered with OC/CC required",
  );

  const communitySetting = dflt(
    p.community?.setting,
    DEFAULTS.communitySetting,
    "Community: gated or standalone both accepted",
  );

  const rate = <K extends string>(items: readonly K[], given: Partial<Record<K, Importance>> | undefined, label: string) => {
    const out = {} as Record<K, Importance>;
    let defaulted = 0;
    for (const k of items) {
      const v = given?.[k];
      if (v === undefined) defaulted++;
      out[k] = v ?? DEFAULTS.rating;
    }
    if (defaulted > 0) used.push(`${label}: ${defaulted} of ${items.length} items unrated, treated as nice-to-have`);
    return out;
  };

  return {
    resolved: {
      adults,
      kidAges: p.household?.kidAges ?? [],
      parentsLiving: p.household?.parentsLiving ?? false,
      pets: p.household?.pets ?? false,
      workHubs,
      officeDaysPerWeek: officeDays,
      maxCommuteMinutes: maxCommute,
      commuteMode: mode,
      school,
      budget,
      downPayment: p.budget?.downPayment ?? null,
      householdMonthlyIncome: p.budget?.householdMonthlyIncome ?? null,
      existingMonthlyEmis: p.budget?.existingMonthlyEmis ?? 0,
      propertyTypes,
      propertyStatuses,
      minBhk,
      minCarpetSqft: p.property?.minCarpetSqft ?? null,
      khata,
      reraWithOcCcRequired: rera,
      communitySetting,
      communityMustHaves: p.community?.mustHaves ?? [],
      infrastructure: rate(INFRA_ITEMS, p.infrastructure?.ratings, "Infrastructure"),
      lifestyle: rate(LIFESTYLE_ITEMS, p.lifestyle?.ratings, "Lifestyle"),
      dealbreakers: p.dealbreakers?.text || null,
    },
    usedDefaults: used,
  };
}
