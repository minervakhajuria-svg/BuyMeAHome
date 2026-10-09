import { RATES, type Rates } from "@/config/rates";
import { BACKUP_N, BASE_WEIGHTS, MIN_COVERAGE, TOP_N, type WeightKey } from "@/config/weights";
import { HUB_LABELS } from "@/config/questions";
import { formatRupees } from "@/lib/format";
import { maxAffordablePrice } from "@/lib/money";
import type { ResolvedProfile } from "@/lib/profile/defaults";
import type {
  Dataset,
  Dimension,
  DimensionScore,
  Importance,
  MicroMarketRow,
  ProjectRow,
  RuleOut,
  ScoredResult,
  ScoringOutput,
} from "@/lib/schemas";

/**
 * Deterministic scoring. Pure functions of (profile, dataset, config): no randomness, no LLM.
 * Missing facts yield a null score ("not available") and are never guessed.
 */

export type Weights = Record<WeightKey, number>;

export interface ScoringOptions {
  topN?: number;
  backupN?: number;
  minCoverage?: number;
  rates?: Rates;
  baseWeights?: Weights;
}

const clamp = (n: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, n));
const round1 = (n: number) => Math.round(n * 10) / 10;
const idOf = (m: MicroMarketRow) => m.id ?? m.name;

/* ------------------------------------------------------------------ weights */

const IMPORTANCE_WEIGHT: Record<Importance, number> = { must_have: 3, nice_to_have: 1, dont_care: 0 };

/** Multiplier for a block of rated items: 0 if all "don't care", else 1 + 0.25 per must-have. */
function ratingMultiplier(ratings: Importance[]): number {
  if (ratings.every((r) => r === "dont_care")) return 0;
  return 1 + 0.25 * ratings.filter((r) => r === "must_have").length;
}

/**
 * Weights for this buyer, normalised to sum to 100 over the dimensions that apply. A dimension
 * does not apply when the profile cannot support it (no kids, no office, no budget, no community
 * preference, every item "don't care").
 */
export function profileWeights(p: ResolvedProfile, base: Weights = BASE_WEIGHTS): Weights {
  const raw: Weights = {
    commute: p.workHubs.length > 0 && p.officeDaysPerWeek > 0 ? base.commute : 0,
    budgetFit: p.budget ? base.budgetFit : 0,
    schools: p.school ? base.schools : 0,
    infrastructure: base.infrastructure * ratingMultiplier(Object.values(p.infrastructure)),
    lifestyle: base.lifestyle * ratingMultiplier(Object.values(p.lifestyle)),
    communityAmenities: 0,
  };
  const wantsCommunity = p.communitySetting !== "either" || p.communityMustHaves.length > 0;
  if (wantsCommunity) {
    raw.communityAmenities = base.communityAmenities * (p.communityMustHaves.length > 0 ? 2 : 1);
  }
  return normalise(raw);
}

function normalise(w: Weights): Weights {
  const total = Object.values(w).reduce((a, b) => a + b, 0);
  const out = { ...w };
  for (const k of Object.keys(out) as WeightKey[]) out[k] = total > 0 ? (w[k] / total) * 100 : 0;
  return out;
}

/* ------------------------------------------------------------ dimension scorers */

interface DimResult {
  score: number | null;
  notes: string[];
  gaps: string[];
}

/** 100 at or below half the limit, 50 at the limit, 0 at 1.5x the limit. */
export function commuteMinutesScore(minutes: number, maxMinutes: number): number {
  return clamp((100 * (1.5 * maxMinutes - minutes)) / maxMinutes);
}

function scoreCommute(m: MicroMarketRow, p: ResolvedProfile, ds: Dataset): DimResult {
  const notes: string[] = [];
  const gaps: string[] = [];
  const scores: number[] = [];
  for (const hub of new Set(p.workHubs)) {
    const row = ds.commuteTimes.find(
      (c) => c.micro_market_id === idOf(m) && c.destination === hub && c.mode === p.commuteMode,
    );
    if (!row) {
      gaps.push(`No ${p.commuteMode.replace("_", " ")} peak commute time to ${HUB_LABELS[hub as keyof typeof HUB_LABELS] ?? hub}`);
      continue;
    }
    scores.push(commuteMinutesScore(row.peak_minutes, p.maxCommuteMinutes));
    const over = row.peak_minutes > p.maxCommuteMinutes ? ", over your limit" : "";
    notes.push(`${HUB_LABELS[hub as keyof typeof HUB_LABELS] ?? hub}: ${row.peak_minutes} min peak by ${p.commuteMode.replace("_", " ")} (your limit ${p.maxCommuteMinutes})${over}`);
  }
  return { score: scores.length ? mean(scores) : null, notes, gaps };
}

/** Price entry for the smallest BHK that is at least the buyer's minimum. */
export function priceForMinBhk(m: MicroMarketRow, minBhk: number): { bhk: number; min: number; max: number } | null {
  const table = m.typical_price_by_bhk;
  if (!table) return null;
  const bhk = Object.keys(table)
    .map(Number)
    .filter((b) => b >= minBhk)
    .sort((a, b) => a - b)[0];
  return bhk === undefined ? null : { bhk, ...table[String(bhk)] };
}

/** 100 when the typical price is at most 70% of the maximum affordable price, 0 at 120%. */
export function budgetFitScore(typicalPrice: number, maxPrice: number): number {
  return clamp((100 * (1.2 - typicalPrice / maxPrice)) / 0.5);
}

function scoreBudgetFit(m: MicroMarketRow, p: ResolvedProfile, maxPrice: number | null): DimResult {
  if (maxPrice === null) return { score: null, notes: [], gaps: [] };
  const price = priceForMinBhk(m, p.minBhk);
  if (!price) return { score: null, notes: [], gaps: [`No typical price for ${p.minBhk}+ BHK`] };
  const mid = (price.min + price.max) / 2;
  return {
    score: budgetFitScore(mid, maxPrice),
    notes: [
      `${price.bhk} BHK typically ${formatRupees(price.min)} to ${formatRupees(price.max)} against a maximum price of ${formatRupees(maxPrice)}`,
    ],
    gaps: [],
  };
}

const SCHOOL_COUNT_SCORE = [0, 60, 80, 100];

export function scoreSchools(m: MicroMarketRow, p: ResolvedProfile, ds: Dataset): DimResult {
  if (!p.school) return { score: null, notes: [], gaps: [] };
  const all = ds.schools.filter((s) => s.micro_market_id === idOf(m));
  if (all.length === 0) return { score: null, notes: [], gaps: ["No school data"] };
  const board = p.school.board;
  const matching = board === "open" ? all : all.filter((s) => s.board === board);
  const n = Math.min(matching.length, 3);
  return {
    score: SCHOOL_COUNT_SCORE[n],
    notes: [
      `${matching.length} ${board === "open" ? "" : board + " "}school(s) in our data${
        matching.length ? ": " + matching.map((s) => s.name).join(", ") : ""
      }. School-run distance is not in our dataset`,
    ],
    gaps: [],
  };
}

type Level = "low" | "medium" | "high" | null;
/** For risks (flood, power cuts, air/noise): low is good. For positives (greenery, hospitals): high is good. */
const RISK_SCORE = { low: 100, medium: 50, high: 0 } as const;
const POSITIVE_SCORE = { low: 0, medium: 50, high: 100 } as const;
const WATER_SCORE = { cauvery: 100, mixed: 50, borewell_tanker: 0 } as const;

interface Item {
  label: string;
  importance: Importance;
  score: number | null;
  detail: string;
}

/** Importance-weighted mean over items with data; also flags unmet must-haves and gaps. */
function combineItems(items: Item[]): DimResult {
  const notes: string[] = [];
  const gaps: string[] = [];
  let num = 0;
  let den = 0;
  for (const it of items) {
    if (it.importance === "dont_care") continue;
    if (it.score === null) {
      gaps.push(`${it.label}: not available`);
      continue;
    }
    const w = IMPORTANCE_WEIGHT[it.importance];
    num += it.score * w;
    den += w;
    notes.push(`${it.label}: ${it.detail}`);
    if (it.importance === "must_have" && it.score === 0) notes.push(`Must-have not met: ${it.label}`);
  }
  return { score: den > 0 ? num / den : null, notes, gaps };
}

const lv = (level: Level, table: Record<"low" | "medium" | "high", number>) => (level ? table[level] : null);

export function scoreInfrastructure(m: MicroMarketRow, p: ResolvedProfile): DimResult {
  const r = p.infrastructure;
  return combineItems([
    { label: "Flood risk", importance: r.flood_history, score: lv(m.flood_risk_level, RISK_SCORE), detail: `${m.flood_risk_level} risk` },
    { label: "Water source", importance: r.water_source, score: m.water_source ? WATER_SCORE[m.water_source] : null, detail: String(m.water_source) },
    { label: "Power cuts", importance: r.power_cuts, score: lv(m.power_cut_level, RISK_SCORE), detail: `${m.power_cut_level} frequency` },
    { label: "Air and noise", importance: r.air_noise, score: lv(m.air_noise_level, RISK_SCORE), detail: `${m.air_noise_level} level` },
    // The dataset has no garbage/roads field, so this is always reported as not available.
    { label: "Garbage and roads", importance: r.garbage_roads, score: null, detail: "" },
  ]);
}

/** 100 at 30 minutes or less, 0 at 90 minutes or more. */
export function airportScore(minutes: number): number {
  return clamp((100 * (90 - minutes)) / 60);
}

export function scoreLifestyle(m: MicroMarketRow, p: ResolvedProfile): DimResult {
  const r = p.lifestyle;
  return combineItems([
    { label: "Walkability", importance: r.walkability, score: m.walkability_score, detail: `${m.walkability_score}/100` },
    { label: "Greenery and lakes", importance: r.greenery_lakes, score: lv(m.greenery_level, POSITIVE_SCORE), detail: `${m.greenery_level}` },
    // The dataset has no restaurants/cafes field.
    { label: "Restaurants and cafes", importance: r.restaurants_cafes, score: null, detail: "" },
    { label: "Hospitals", importance: r.hospitals, score: lv(m.hospitals_level, POSITIVE_SCORE), detail: `${m.hospitals_level}` },
    {
      label: "Airport access",
      importance: r.airport_access,
      score: m.airport_minutes === null ? null : airportScore(m.airport_minutes),
      detail: `${m.airport_minutes} min`,
    },
  ]);
}

/** Share of the requested criteria a project meets, using only criteria with data. */
function projectCommunityScore(proj: ProjectRow, p: ResolvedProfile): number | null {
  const checks: (boolean | null)[] = [];
  if (p.communitySetting === "gated_with_clubhouse") checks.push(proj.gated_clubhouse);
  if (p.communitySetting === "standalone") checks.push(proj.gated_clubhouse === null ? null : !proj.gated_clubhouse);
  if (p.communityMustHaves.includes("parking")) checks.push(proj.has_parking);
  if (p.communityMustHaves.includes("power_backup")) checks.push(proj.has_power_backup);
  if (p.communityMustHaves.includes("lift")) checks.push(proj.has_lift);
  const known = checks.filter((c): c is boolean => c !== null);
  return known.length ? (100 * known.filter(Boolean).length) / known.length : null;
}

export function scoreCommunity(eligible: ProjectRow[], p: ResolvedProfile): DimResult {
  if (p.communitySetting === "either" && p.communityMustHaves.length === 0) return { score: null, notes: [], gaps: [] };
  const scores = eligible.map((proj) => projectCommunityScore(proj, p)).filter((s): s is number => s !== null);
  if (scores.length === 0) return { score: null, notes: [], gaps: ["Community amenities: not available"] };
  const best = Math.max(...scores);
  return { score: best, notes: [`Best-matching project meets ${Math.round(best)}% of your community criteria`], gaps: [] };
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/* ------------------------------------------------------------- hard filters */

interface FilterOutcome {
  ruleOut: RuleOut | null;
  eligibleProjects: ProjectRow[];
  gaps: string[];
}

function projectIsRegulated(proj: ProjectRow): boolean {
  if (!proj.rera_number) return false;
  return proj.status === "under_construction" || proj.oc_cc_status === "received";
}

/** Why a single project fails the buyer's stage, khata or RERA requirements (null if it passes). */
export function projectRejection(proj: ProjectRow, p: ResolvedProfile): string | null {
  if (proj.status !== null && !p.propertyStatuses.includes(proj.status)) {
    return `it is ${proj.status.replace(/_/g, " ")}, which you did not select`;
  }
  if (p.khata === "a_only" && proj.khata_type !== "A") {
    return proj.khata_type === "B" ? "it is B-khata and you asked for A-khata only" : "A-khata status is not confirmed in our data";
  }
  if (p.reraWithOcCcRequired && !projectIsRegulated(proj)) {
    return proj.rera_number ? "OC/CC is not confirmed as received" : "no RERA number in our data";
  }
  return null;
}

function hardFilter(
  m: MicroMarketRow,
  p: ResolvedProfile,
  ds: Dataset,
  maxPrice: number | null,
): FilterOutcome {
  const gaps: string[] = [];

  if (maxPrice !== null) {
    const price = priceForMinBhk(m, p.minBhk);
    if (price && price.min > maxPrice) {
      return {
        ruleOut: {
          stage: "hard_filter",
          rule: "budget",
          detail: `Cheapest typical ${price.bhk} BHK is ${formatRupees(price.min)}, above your maximum price of ${formatRupees(maxPrice)}`,
        },
        eligibleProjects: [],
        gaps,
      };
    }
  }

  const projects = ds.projects.filter((x) => x.micro_market_id === idOf(m));
  if (projects.length === 0) {
    return { ruleOut: null, eligibleProjects: [], gaps: ["No project records, so legal checks could not be applied"] };
  }

  const fail = (rule: string, detail: string): FilterOutcome => ({
    ruleOut: { stage: "hard_filter", rule, detail },
    eligibleProjects: [],
    gaps,
  });

  let pool = projects.filter((x) => x.status === null || p.propertyStatuses.includes(x.status));
  if (pool.length === 0) {
    return fail("property_status", `None of the ${projects.length} projects in our data is ${p.propertyStatuses.join(" / ").replace(/_/g, " ")}`);
  }
  if (p.khata === "a_only") {
    pool = pool.filter((x) => x.khata_type === "A");
    if (pool.length === 0) return fail("khata", "No project in our data is confirmed A-khata, and you asked for A-khata only");
  }
  if (p.reraWithOcCcRequired) {
    pool = pool.filter(projectIsRegulated);
    if (pool.length === 0) {
      return fail("rera", "No project in our data is RERA-registered with OC/CC held (or under construction with RERA), and you required it");
    }
  }
  return { ruleOut: null, eligibleProjects: pool, gaps };
}

/* ------------------------------------------------------------------- engine */

export function scoreMarkets(
  p: ResolvedProfile,
  usedDefaults: string[],
  ds: Dataset,
  opts: ScoringOptions = {},
): ScoringOutput {
  if (ds.microMarkets.length === 0) throw new Error("Dataset has no micro-markets");
  const rates = opts.rates ?? RATES;
  const topN = opts.topN ?? TOP_N;
  const backupN = opts.backupN ?? BACKUP_N;
  const minCoverage = opts.minCoverage ?? MIN_COVERAGE;
  const weights = profileWeights(p, opts.baseWeights);

  // Most lenient price across accepted statuses: a market is only excluded if no accepted status fits.
  const maxPrice = p.budget
    ? Math.max(
        ...p.propertyStatuses.map(
          (status) =>
            maxAffordablePrice(
              {
                allInBudget: p.budget!.max,
                status,
                downPayment: p.downPayment,
                monthlyIncome: p.householdMonthlyIncome,
                existingEmis: p.existingMonthlyEmis,
              },
              rates,
            ).maxPrice,
        ),
      )
    : null;

  const survivors: ScoredResult[] = [];
  const excluded: ScoredResult[] = [];

  for (const m of ds.microMarkets) {
    const base = { microMarketId: idOf(m), name: m.name, corridor: m.corridor, asOfDate: m.as_of_date, isSample: m.is_sample };
    const filter = hardFilter(m, p, ds, maxPrice);
    if (filter.ruleOut) {
      excluded.push({
        ...base,
        totalScore: null,
        coverage: null,
        rank: null,
        status: "ruled_out",
        dimensions: [],
        ruleOuts: [filter.ruleOut],
        dataGaps: filter.gaps,
      });
      continue;
    }

    const results: Record<Dimension, DimResult> = {
      commute: scoreCommute(m, p, ds),
      budgetFit: scoreBudgetFit(m, p, maxPrice),
      schools: scoreSchools(m, p, ds),
      infrastructure: scoreInfrastructure(m, p),
      lifestyle: scoreLifestyle(m, p),
      communityAmenities: scoreCommunity(filter.eligibleProjects, p),
    };

    const applicable = (Object.keys(weights) as Dimension[]).filter((d) => weights[d] > 0);
    const scored = applicable.filter((d) => results[d].score !== null);
    const scoredWeight = scored.reduce((a, d) => a + weights[d], 0);
    const coverage = applicable.length ? scoredWeight / 100 : 0;
    const total = scoredWeight > 0 ? scored.reduce((a, d) => a + results[d].score! * weights[d], 0) / scoredWeight : null;

    const dimensions: DimensionScore[] = applicable.map((d) => ({
      dimension: d,
      score: results[d].score === null ? null : round1(results[d].score!),
      // Effective weight after redistributing the weight of dimensions that lack data.
      weight: results[d].score === null || scoredWeight === 0 ? 0 : round1((weights[d] / scoredWeight) * 100),
      notes: results[d].notes,
    }));
    const dataGaps = [...filter.gaps, ...applicable.flatMap((d) => results[d].gaps)];

    const result: ScoredResult = {
      ...base,
      totalScore: total === null ? null : round1(total),
      coverage: round1(coverage * 100) / 100,
      rank: null,
      status: "ruled_out",
      dimensions,
      ruleOuts: [],
      dataGaps,
    };

    if (total === null || coverage < minCoverage) {
      result.totalScore = null;
      result.ruleOuts.push({
        stage: "score",
        rule: "insufficient_data",
        detail: `Our data covers only ${Math.round(coverage * 100)}% of what matters to you here (minimum ${Math.round(minCoverage * 100)}%), so it was not ranked`,
      });
      excluded.push(result);
    } else {
      survivors.push(result);
    }
  }

  survivors.sort((a, b) => b.totalScore! - a.totalScore! || a.name.localeCompare(b.name));
  const cutoff = survivors[topN - 1]?.totalScore ?? null;
  survivors.forEach((r, i) => {
    r.rank = i + 1;
    if (i < topN) r.status = "top";
    else if (i < topN + backupN) r.status = "backup";
    else {
      const weakest = r.dimensions
        .filter((d) => d.score !== null)
        .sort((a, b) => a.score! - b.score!)[0];
      r.ruleOuts.push({
        stage: "score",
        rule: "low_score",
        detail:
          `Ranked ${i + 1} of ${survivors.length} with ${r.totalScore}` +
          (cutoff !== null ? `; the #${topN} pick scored ${cutoff}` : "") +
          (weakest ? `. Weakest area: ${weakest.dimension} (${weakest.score})` : ""),
      });
    }
  });

  const dates = [
    ...ds.microMarkets.map((x) => x.as_of_date),
    ...ds.schools.map((x) => x.as_of_date),
    ...ds.projects.map((x) => x.as_of_date),
    ...ds.commuteTimes.map((x) => x.as_of_date),
  ].sort();

  const results = [...survivors, ...excluded];
  return {
    results,
    usedDefaults,
    dataAsOf: dates[0],
    hasSampleData: results.some((r) => r.isSample),
  };
}
