import { describe, expect, it } from "vitest";
import {
  applyPatch,
  buyerProfile,
  commuteTimeRow,
  microMarketRow,
  profilePatch,
  schoolsQuestionApplies,
  scoredResult,
} from "@/lib/schemas";

const empty = () => buyerProfile.parse({});

describe("buyerProfile", () => {
  it("accepts an empty profile", () => {
    expect(empty().skipped).toEqual([]);
  });

  it("rejects a negative budget and inverted ranges", () => {
    expect(() => buyerProfile.parse({ budget: { allInBudget: { min: 5, max: 1 } } })).toThrow();
    expect(() => buyerProfile.parse({ budget: { downPayment: -1 } })).toThrow();
  });

  it("has no caste, religion or community fields", () => {
    const keys = JSON.stringify(Object.keys(buyerProfile.shape));
    expect(keys).not.toMatch(/caste|religion|communityOnly/i);
  });

  it("applies and replaces answers and records skips", () => {
    let p = applyPatch(empty(), {
      question: "household",
      answer: { kidAges: [4], parentsLiving: false, pets: false },
    });
    expect(schoolsQuestionApplies(p)).toBe(true);
    p = applyPatch(p, { question: "skip", skipped: "household" });
    expect(p.household).toBeUndefined();
    expect(p.skipped).toEqual(["household"]);
    p = applyPatch(p, { question: "household", answer: { kidAges: [], parentsLiving: true, pets: false } });
    expect(p.skipped).toEqual([]);
    expect(schoolsQuestionApplies(p)).toBe(false);
  });

  it("rejects patches for unknown questions", () => {
    expect(() => profilePatch.parse({ question: "caste", answer: {} })).toThrow();
  });
});

describe("dataset rows", () => {
  it("coerces CSV strings and blanks", () => {
    const row = microMarketRow.parse({
      name: "Sample A",
      corridor: "Sarjapur Road",
      lat: "12.9",
      lng: "",
      price_per_sqft_min: "7000",
      typical_price_by_bhk: '{"2":{"min":9000000,"max":12000000}}',
      walkability_score: "55",
      as_of_date: "2026-10-01",
      is_sample: "true",
    });
    expect(row.lat).toBe(12.9);
    expect(row.lng).toBeNull();
    expect(row.price_per_sqft_min).toBe(7000);
    expect(row.typical_price_by_bhk?.["2"].max).toBe(12000000);
    expect(row.is_sample).toBe(true);
  });

  it("requires as_of_date", () => {
    expect(() => microMarketRow.parse({ name: "x", corridor: "y" })).toThrow();
    expect(() => microMarketRow.parse({ name: "x", corridor: "y", as_of_date: "yesterday" })).toThrow();
  });

  it("validates commute rows", () => {
    expect(() =>
      commuteTimeRow.parse({ micro_market_id: "a", destination: "cbd", mode: "boat", peak_minutes: 10, as_of_date: "2026-10-01" }),
    ).toThrow();
  });
});

describe("scoredResult", () => {
  it("allows null dimension scores for unavailable data", () => {
    const r = scoredResult.parse({
      microMarketId: "m1",
      name: "A",
      corridor: "C",
      totalScore: 70,
      rank: 1,
      status: "top",
      dimensions: [{ dimension: "schools", score: null, weight: 0 }],
      ruleOuts: [],
      asOfDate: "2026-10-01",
      isSample: true,
    });
    expect(r.dimensions[0].score).toBeNull();
    expect(r.dataGaps).toEqual([]);
  });
});
