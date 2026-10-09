import { describe, expect, it } from "vitest";
import { resolveProfile } from "@/lib/profile/defaults";
import { buyerProfile, commuteTimeRow, microMarketRow, projectRow, schoolRow, type Dataset } from "@/lib/schemas";
import type { Rates } from "@/config/rates";
import {
  airportScore,
  budgetFitScore,
  commuteMinutesScore,
  profileWeights,
  scoreCommunity,
  scoreInfrastructure,
  scoreLifestyle,
  scoreMarkets,
  scoreSchools,
} from "./scoring";

const R: Rates = {
  loanInterestRatePct: 12,
  loanTenureYears: 1,
  stampDutyPct: 5,
  registrationPct: 1,
  gstUnderConstructionPct: 5,
  propertyTaxPctOfValue: 0.2,
  interiorsPctOfValue: 8,
  depositsPctOfValue: 1,
  maintenancePerSqftMonthly: 4,
  comfortableEmiSharePct: 40,
  minLiquidityBufferMonths: 6,
};

const resolve = (profile: object) => resolveProfile(buyerProfile.parse(profile));
const mm = (o: Record<string, unknown>) =>
  microMarketRow.parse({ corridor: "Test", as_of_date: "2026-09-15", ...o });

const allDontCare = (items: string[]) => Object.fromEntries(items.map((i) => [i, "dont_care"]));
const INFRA = ["water_source", "flood_history", "power_cuts", "garbage_roads", "air_noise"];
const LIFE = ["walkability", "greenery_lakes", "restaurants_cafes", "hospitals", "airport_access"];

describe("small scoring formulas", () => {
  it("commute: 100 at half the limit, 50 at the limit, 0 at 1.5x", () => {
    expect(commuteMinutesScore(20, 40)).toBe(100);
    expect(commuteMinutesScore(40, 40)).toBe(50);
    expect(commuteMinutesScore(30, 40)).toBe(75); // 100 x (60 - 30) / 40
    expect(commuteMinutesScore(60, 40)).toBe(0);
    expect(commuteMinutesScore(90, 40)).toBe(0);
  });
  it("budget fit: 100 up to 70% of max price, 0 at 120%", () => {
    expect(budgetFitScore(7, 10)).toBe(100);
    expect(budgetFitScore(8.5, 10)).toBeCloseTo(70, 9); // 100 x (1.2 - 0.85) / 0.5
    expect(budgetFitScore(12, 10)).toBe(0);
  });
  it("airport: 100 at 30 min, 50 at 60 min, 0 at 90 min", () => {
    expect(airportScore(30)).toBe(100);
    expect(airportScore(60)).toBe(50);
    expect(airportScore(120)).toBe(0);
  });
});

describe("profileWeights", () => {
  it("an empty profile scores only infrastructure and lifestyle, 15:10", () => {
    const w = profileWeights(resolve({}).resolved);
    expect(w.commute).toBe(0);
    expect(w.budgetFit).toBe(0);
    expect(w.schools).toBe(0);
    expect(w.communityAmenities).toBe(0);
    expect(w.infrastructure).toBeCloseTo(60, 9); // 15 / 25
    expect(w.lifestyle).toBeCloseTo(40, 9); // 10 / 25
  });

  it("must-haves raise weights and everything normalises to 100", () => {
    const p = resolve({
      household: { kidAges: [5] },
      work: { workplaces: [{ who: "you", hub: "cbd" }] },
      budget: { allInBudget: { min: 1, max: 2 } },
      community: { mustHaves: ["parking"] },
      infrastructure: { ratings: { flood_history: "must_have", water_source: "must_have" } },
      lifestyle: { ratings: allDontCare(LIFE) },
    }).resolved;
    // raw: commute 25, budget 25, schools 20, infra 15 x 1.5 = 22.5, lifestyle 0, community 5 x 2 = 10 -> 102.5
    const w = profileWeights(p);
    expect(w.lifestyle).toBe(0);
    expect(w.commute).toBeCloseTo((25 / 102.5) * 100, 9); // 24.39
    expect(w.infrastructure).toBeCloseTo((22.5 / 102.5) * 100, 9); // 21.95
    expect(w.communityAmenities).toBeCloseTo((10 / 102.5) * 100, 9); // 9.76
    expect(Object.values(w).reduce((a, b) => a + b, 0)).toBeCloseTo(100, 9);
  });

  it("remote or zero office days drops commute", () => {
    const remote = resolve({ work: { workplaces: [{ who: "you", hub: "remote" }] } }).resolved;
    expect(profileWeights(remote).commute).toBe(0);
    const wfh = resolve({ work: { workplaces: [{ who: "you", hub: "cbd" }], officeDaysPerWeek: 0 } }).resolved;
    expect(profileWeights(wfh).commute).toBe(0);
  });
});

describe("scoreSchools", () => {
  const m = mm({ id: "m", name: "M" });
  const ds = (boards: string[]): Dataset => ({
    microMarkets: [m],
    commuteTimes: [],
    projects: [],
    schools: boards.map((b, i) => schoolRow.parse({ micro_market_id: "m", name: `S${i}`, board: b, as_of_date: "2026-09-15" })),
  });
  const profile = (board: string) => resolve({ household: { kidAges: [6] }, schools: { board } }).resolved;

  it("counts matching schools: 2 -> 80, open board counts all 3 -> 100", () => {
    const d = ds(["CBSE", "CBSE", "ICSE"]);
    expect(scoreSchools(m, profile("CBSE"), d).score).toBe(80);
    expect(scoreSchools(m, profile("open"), d).score).toBe(100);
  });
  it("records records-but-no-match as 0, and no records as not available", () => {
    expect(scoreSchools(m, profile("IB/IGCSE"), ds(["CBSE"])).score).toBe(0);
    const none = scoreSchools(m, profile("CBSE"), ds([]));
    expect(none.score).toBeNull();
    expect(none.gaps).toEqual(["No school data"]);
  });
  it("is not scored without kids", () => {
    expect(scoreSchools(m, resolve({}).resolved, ds(["CBSE"])).score).toBeNull();
  });
});

describe("scoreInfrastructure", () => {
  const ratings = (o: object) => ({ infrastructure: { ratings: { ...allDontCare(INFRA), ...o } } });

  it("weights must-have 3 and nice-to-have 1", () => {
    const p = resolve(ratings({ flood_history: "must_have", water_source: "nice_to_have" })).resolved;
    const r = scoreInfrastructure(mm({ name: "A", flood_risk_level: "low", water_source: "mixed" }), p);
    expect(r.score).toBe(87.5); // (100 x 3 + 50 x 1) / 4
  });
  it("flags an unmet must-have and reports unavailable items as gaps", () => {
    const p = resolve(ratings({ flood_history: "must_have", garbage_roads: "nice_to_have" })).resolved;
    const r = scoreInfrastructure(mm({ name: "A", flood_risk_level: "high" }), p);
    expect(r.score).toBe(0);
    expect(r.notes).toContain("Must-have not met: Flood risk");
    expect(r.gaps).toContain("Garbage and roads: not available");
  });
  it("is null when every rated item lacks data", () => {
    const p = resolve(ratings({ flood_history: "must_have" })).resolved;
    expect(scoreInfrastructure(mm({ name: "A" }), p).score).toBeNull();
  });
});

describe("scoreLifestyle", () => {
  it("combines walkability (must) and airport (nice)", () => {
    const p = resolve({
      lifestyle: { ratings: { ...allDontCare(LIFE), walkability: "must_have", airport_access: "nice_to_have" } },
    }).resolved;
    const r = scoreLifestyle(mm({ name: "A", walkability_score: 80, airport_minutes: 60 }), p);
    expect(r.score).toBe(72.5); // (80 x 3 + 50 x 1) / 4
  });
});

describe("scoreCommunity", () => {
  it("takes the best eligible project's share of met criteria", () => {
    const p = resolve({ community: { setting: "gated_with_clubhouse", mustHaves: ["parking", "lift"] } }).resolved;
    const proj = (o: object) => projectRow.parse({ micro_market_id: "m", name: "P", as_of_date: "2026-09-15", ...o });
    const eligible = [
      proj({ gated_clubhouse: "true", has_parking: "true", has_lift: "false" }), // 2 of 3 = 66.7
      proj({ gated_clubhouse: "true", has_parking: "false" }), // lift unknown: 1 of 2 = 50
    ];
    expect(scoreCommunity(eligible, p).score).toBeCloseTo(66.67, 1);
  });
  it("is not scored when nothing was requested", () => {
    expect(scoreCommunity([], resolve({}).resolved).score).toBeNull();
  });
});

describe("scoreMarkets end to end", () => {
  // Buyer: office at ORR/Bellandur, 40 min limit, by car. All-in budget 1.15 crore, ready flats, 2+ BHK.
  // Weights: only commute and budget fit apply -> 50 / 50. Max price = 1.15 crore / 1.15 = 1 crore.
  const { resolved, usedDefaults } = resolve({
    work: { workplaces: [{ who: "you", hub: "orr_bellandur" }], maxCommuteMinutes: 40, mode: "car" },
    budget: { allInBudget: { min: 11_500_000, max: 11_500_000 } },
    property: { types: ["apartment"], statuses: ["ready"], minBhk: 2 },
    infrastructure: { ratings: allDontCare(INFRA) },
    lifestyle: { ratings: allDontCare(LIFE) },
  });
  const price = (min: number, max: number) => ({ "2": { min, max } });
  const commute = (id: string, minutes: number) =>
    commuteTimeRow.parse({ micro_market_id: id, destination: "orr_bellandur", mode: "car", peak_minutes: minutes, as_of_date: "2026-09-15" });
  const goodProject = (id: string, o: object = {}) =>
    projectRow.parse({ micro_market_id: id, name: "P", rera_number: "R1", status: "ready", khata_type: "A", oc_cc_status: "received", as_of_date: "2026-09-15", ...o });

  const ds: Dataset = {
    microMarkets: [
      mm({ id: "alpha", name: "Alpha", typical_price_by_bhk: price(8_000_000, 9_000_000), as_of_date: "2026-10-01", is_sample: true }),
      mm({ id: "bravo", name: "Bravo", typical_price_by_bhk: price(6_000_000, 7_000_000) }),
      mm({ id: "charlie", name: "Charlie", typical_price_by_bhk: price(10_500_000, 12_000_000) }),
      mm({ id: "delta", name: "Delta" }),
      mm({ id: "echo", name: "Echo", typical_price_by_bhk: price(7_000_000, 8_000_000) }),
    ],
    commuteTimes: [commute("alpha", 30), commute("bravo", 60), commute("charlie", 20), commute("delta", 20), commute("echo", 25)],
    projects: [goodProject("alpha"), goodProject("echo", { khata_type: "B" })],
    schools: [],
  };

  const out = scoreMarkets(resolved, usedDefaults, ds, { rates: R });
  const by = (name: string) => out.results.find((r) => r.name === name)!;

  it("ranks Alpha (72.5) above Bravo (50)", () => {
    // Alpha: budget fit mid 85 lakh / 1 crore = 0.85 -> 70; commute 30 of 40 -> 75; (70 + 75) / 2 = 72.5
    expect(by("Alpha").totalScore).toBe(72.5);
    expect(by("Alpha").rank).toBe(1);
    // Bravo: mid 65 lakh -> ratio 0.65 -> capped 100; commute 60 min -> 0; (100 + 0) / 2 = 50
    expect(by("Bravo").totalScore).toBe(50);
    expect(by("Bravo").rank).toBe(2);
    expect(by("Alpha").status).toBe("top");
  });

  it("hard-filters Charlie on budget with the numbers in the log", () => {
    const c = by("Charlie");
    expect(c.status).toBe("ruled_out");
    expect(c.rank).toBeNull();
    expect(c.ruleOuts[0]).toMatchObject({ stage: "hard_filter", rule: "budget" });
    expect(c.ruleOuts[0].detail).toContain("₹1.05 crore");
    expect(c.ruleOuts[0].detail).toContain("₹1.00 crore");
  });

  it("hard-filters Echo on khata", () => {
    expect(by("Echo").ruleOuts[0]).toMatchObject({ stage: "hard_filter", rule: "khata" });
  });

  it("does not rank Delta, which lacks price data (coverage 50% < 60%)", () => {
    const d = by("Delta");
    expect(d.ruleOuts[0].rule).toBe("insufficient_data");
    expect(d.coverage).toBe(0.5);
    expect(d.dataGaps).toContain("No typical price for 2+ BHK");
  });

  it("notes missing project records as a data gap instead of excluding", () => {
    expect(by("Bravo").dataGaps).toContain("No project records, so legal checks could not be applied");
  });

  it("carries the as-of date (oldest row) and sample flag", () => {
    expect(out.dataAsOf).toBe("2026-09-15");
    expect(out.hasSampleData).toBe(true);
  });

  it("rules out low-ranked markets with the reason", () => {
    const small = scoreMarkets(resolved, usedDefaults, ds, { rates: R, topN: 1, backupN: 0 });
    const bravo = small.results.find((r) => r.name === "Bravo")!;
    expect(bravo.status).toBe("ruled_out");
    expect(bravo.ruleOuts[0]).toMatchObject({
      stage: "score",
      rule: "low_score",
      detail: "Ranked 2 of 2 with 50; the #1 pick scored 72.5. Weakest area: commute (0)",
    });
  });

  it("is deterministic", () => {
    expect(scoreMarkets(resolved, usedDefaults, ds, { rates: R })).toEqual(out);
  });
});
