import { formatRupees } from "@/lib/format";
import { resolveProfile, type ResolvedProfile } from "@/lib/profile/defaults";
import { summaryLines } from "@/lib/profile/summary";
import { buildAffordability, type Affordability } from "@/lib/report/affordability";
import { DIMENSION_LABELS } from "@/lib/report/labels";
import { priceForMinBhk, profileWeights, projectRejection, scoreMarkets, type ScoringOptions } from "@/lib/scoring";
import type { BuyerProfile, Dataset, DimensionScore, MicroMarketRow, ScoredResult, ScoringOutput } from "@/lib/schemas";

/**
 * ReportInput is the ONLY thing the report writer sees: scored results plus facts copied from the
 * dataset. Anything the dataset lacks is null or listed under dataGaps, never filled in.
 */

export interface PickFacts {
  microMarketId: string;
  name: string;
  corridor: string;
  rank: number;
  totalScore: number;
  dimensions: DimensionScore[];
  typicalPrice: { bhk: number; low: string; high: string } | null;
  pricePerSqft: { min: number; max: number } | null;
  pricePerSqftTrend: "not available";
  nearestMetro: string | null;
  metroStatus: string | null;
  commute: { destination: string; mode: string; peakMinutes: number; yourLimitMinutes: number }[];
  schools: { name: string; board: string }[];
  notes: { water: string | null; flood: string | null; power: string | null; airNoise: string | null; greenery: string | null; hospitals: string | null };
  airportMinutes: number | null;
  shortlist: { name: string; reraNumber: string | null; stage: string | null; khata: string | null; ocCc: string | null }[];
  skip: { name: string; reason: string }[];
  dataGaps: string[];
  asOfDate: string;
}

export interface ReportInput {
  scoreScale: 100;
  dataAsOf: string;
  hasSampleData: boolean;
  usedDefaults: string[];
  buyerAnswers: { question: string; answer: string }[];
  priorities: { dimension: string; weightPercent: number }[];
  picks: PickFacts[];
  backups: { microMarketId: string; name: string; corridor: string; rank: number; totalScore: number }[];
  ruledOut: { microMarketId: string; name: string; corridor: string; reasons: string[] }[];
  affordability: Affordability;
}

export interface ReportData {
  input: ReportInput;
  scoring: ScoringOutput;
  narrative: import("./narrative").Narrative;
  narrativeSource: "llm" | "template";
  /** Why LLM attempts were rejected, when the template was used (or an earlier attempt failed). */
  narrativeProblems: string[];
}

function pickFacts(r: ScoredResult, m: MicroMarketRow, p: ResolvedProfile, ds: Dataset): PickFacts {
  const id = r.microMarketId;
  const band = priceForMinBhk(m, p.minBhk);
  const commute = p.workHubs.flatMap((hub) => {
    const row = ds.commuteTimes.find((c) => c.micro_market_id === id && c.destination === hub && c.mode === p.commuteMode);
    return row ? [{ destination: hub, mode: p.commuteMode, peakMinutes: row.peak_minutes, yourLimitMinutes: p.maxCommuteMinutes }] : [];
  });
  const schools = ds.schools
    .filter((s) => s.micro_market_id === id && (!p.school || p.school.board === "open" || s.board === p.school.board))
    .map((s) => ({ name: s.name, board: s.board }));
  const projects = ds.projects.filter((x) => x.micro_market_id === id);
  const verdicts = projects.map((proj) => ({ proj, reason: projectRejection(proj, p) }));
  return {
    microMarketId: id,
    name: r.name,
    corridor: r.corridor,
    rank: r.rank!,
    totalScore: r.totalScore!,
    dimensions: r.dimensions,
    typicalPrice: band ? { bhk: band.bhk, low: formatRupees(band.min), high: formatRupees(band.max) } : null,
    pricePerSqft: m.price_per_sqft_min !== null && m.price_per_sqft_max !== null ? { min: m.price_per_sqft_min, max: m.price_per_sqft_max } : null,
    pricePerSqftTrend: "not available",
    nearestMetro: m.nearest_metro,
    metroStatus: m.metro_status,
    commute,
    schools,
    notes: { water: m.water_note, flood: m.flood_risk_note, power: m.power_note, airNoise: m.air_noise_note, greenery: m.greenery_note, hospitals: m.hospitals_note },
    airportMinutes: m.airport_minutes,
    shortlist: verdicts
      .filter((v) => v.reason === null)
      .slice(0, 4)
      .map(({ proj }) => ({ name: proj.name, reraNumber: proj.rera_number, stage: proj.status, khata: proj.khata_type, ocCc: proj.oc_cc_status })),
    skip: verdicts.filter((v) => v.reason !== null).map(({ proj, reason }) => ({ name: proj.name, reason: reason! })),
    dataGaps: r.dataGaps,
    asOfDate: r.asOfDate,
  };
}

export function buildReportInput(
  profile: BuyerProfile,
  ds: Dataset,
  opts: ScoringOptions = {},
): { input: ReportInput; scoring: ScoringOutput; resolved: ResolvedProfile } {
  const { resolved, usedDefaults } = resolveProfile(profile);
  const scoring = scoreMarkets(resolved, usedDefaults, ds, opts);
  const marketById = new Map(ds.microMarkets.map((m) => [m.id ?? m.name, m]));

  const ranked = scoring.results.filter((r) => r.rank !== null).sort((a, b) => a.rank! - b.rank!);
  const tops = ranked.filter((r) => r.status === "top");
  const picks = tops.map((r) => pickFacts(r, marketById.get(r.microMarketId)!, resolved, ds));

  const weights = profileWeights(resolved, opts.baseWeights);
  const priorities = Object.entries(weights)
    .filter(([, w]) => w > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([d, w]) => ({ dimension: DIMENSION_LABELS[d as keyof typeof DIMENSION_LABELS], weightPercent: Math.round(w) }));

  const input: ReportInput = {
    scoreScale: 100,
    dataAsOf: scoring.dataAsOf,
    hasSampleData: scoring.hasSampleData,
    usedDefaults: scoring.usedDefaults,
    buyerAnswers: summaryLines(profile)
      .filter((l) => l.state === "answered" && l.text)
      .map((l) => ({ question: l.title, answer: l.text! })),
    priorities,
    picks,
    backups: ranked
      .filter((r) => r.status === "backup")
      .map((r) => ({ microMarketId: r.microMarketId, name: r.name, corridor: r.corridor, rank: r.rank!, totalScore: r.totalScore! })),
    ruledOut: scoring.results
      .filter((r) => r.status === "ruled_out")
      .map((r) => ({ microMarketId: r.microMarketId, name: r.name, corridor: r.corridor, reasons: r.ruleOuts.map((x) => x.detail) })),
    affordability: buildAffordability(resolved, tops.map((r) => marketById.get(r.microMarketId)!)),
  };
  return { input, scoring, resolved };
}
