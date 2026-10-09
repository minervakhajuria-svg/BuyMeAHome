import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { Rates } from "@/config/rates";
import { loadSampleDataset } from "@/lib/dataset/sample";
import type { ModelCall } from "@/lib/intake/extract";
import { resolveProfile } from "@/lib/profile/defaults";
import { buyerProfile, microMarketRow } from "@/lib/schemas";
import { buildAffordability } from "./affordability";
import { buildReportInput } from "./facts";
import { generateReport } from "./generate";
import { numbersIn, templateNarrative, validateNarrative, type Narrative } from "./narrative";

const R: Rates = {
  loanInterestRatePct: 12, loanTenureYears: 1, stampDutyPct: 5, registrationPct: 1, gstUnderConstructionPct: 5,
  propertyTaxPctOfValue: 0.2, interiorsPctOfValue: 8, depositsPctOfValue: 1, maintenancePerSqftMonthly: 4,
  comfortableEmiSharePct: 40, minLiquidityBufferMonths: 6,
};

const ds = loadSampleDataset();
const example = buyerProfile.parse(JSON.parse(readFileSync("data/sample/profile.example.json", "utf8")));

describe("buildAffordability (hand-checked)", () => {
  const { resolved } = resolveProfile(
    buyerProfile.parse({
      budget: { allInBudget: { min: 11_500_000, max: 11_500_000 }, downPayment: 2_000_000, householdMonthlyIncome: 200_000, existingMonthlyEmis: 20_000 },
      property: { statuses: ["ready"], minBhk: 2, minCarpetSqft: 1000 },
    }),
  );
  const m = microMarketRow.parse({ id: "m", name: "M", corridor: "C", as_of_date: "2026-10-01", typical_price_by_bhk: { "2": { min: 8_000_000, max: 12_000_000 } } });
  const a = buildAffordability(resolved, [m], R);

  it("prices the low point: loan 60 lakh, EMI 5,33,093, 276.5% of income", () => {
    // loan = 80,00,000 - 20,00,000 = 60,00,000; EMI = 6 x 88,848.79 = 533,092.7 -> 533,093
    // share = (533,093 + 20,000) / 200,000 = 276.5%
    const low = a.picks[0].points[0];
    expect(low).toMatchObject({ price: 8_000_000, loan: 6_000_000, emi: 533_093, emiSharePct: 276.5 });
  });
  it("uses the mid price for one-time and ongoing costs", () => {
    // typical = 1 crore: stamp 5 + reg 1 + interiors 8 + deposits 1 = 15% = 15,00,000; tax 0.2% = 20,000; 1,000 sqft x 4 = 4,000
    expect(a.picks[0].points[1].price).toBe(10_000_000);
    expect(a.picks[0].oneTimeAtTypical.ready?.total).toBe(1_500_000);
    expect(a.picks[0].ongoing).toMatchObject({ monthlyMaintenance: 4000, annualPropertyTax: 20_000 });
  });
  it("max price is EMI-cap bound (26,75,305) and notes the unverified rates", () => {
    expect(a.maxPrice?.binding).toBe("emi_cap");
    // allowed EMI = 40% x 2,00,000 - 20,000 = 60,000 -> loan ~6,75,305; plus 20,00,000 down payment
    expect(Math.abs(a.maxPrice!.value - 2_675_305)).toBeLessThan(10);
    expect(a.assumptions.note).toMatch(/verify/i);
  });
  it("reports what it cannot compute instead of guessing", () => {
    const { resolved: bare } = resolveProfile(buyerProfile.parse({}));
    const b = buildAffordability(bare, [m], R);
    expect(b.maxPrice).toBeNull();
    expect(b.picks[0].points[0].emiSharePct).toBeNull();
    expect(b.notAvailable.join(" ")).toMatch(/No budget given/);
  });
});

describe("buildReportInput", () => {
  const { input, scoring } = buildReportInput(example, ds);

  it("separates top picks, backups and ruled-out markets with reasons for every excluded market", () => {
    expect(input.picks).toHaveLength(3);
    expect(input.picks.map((p) => p.rank)).toEqual([1, 2, 3]);
    const listed = new Set([...input.picks, ...input.backups, ...input.ruledOut].map((x) => x.microMarketId));
    expect(listed.size).toBe(scoring.results.length);
    expect(input.ruledOut.every((r) => r.reasons.length > 0)).toBe(true);
  });

  it("copies facts only from the dataset", () => {
    const projectNames = new Set(ds.projects.map((p) => p.name));
    const schoolNames = new Set(ds.schools.map((s) => s.name));
    for (const p of input.picks) {
      expect(p.shortlist.every((s) => projectNames.has(s.name))).toBe(true);
      expect(p.skip.every((s) => projectNames.has(s.name))).toBe(true);
      expect(p.schools.every((s) => schoolNames.has(s.name))).toBe(true);
      expect(p.schools.every((s) => s.board === "CBSE")).toBe(true);
      expect(p.pricePerSqftTrend).toBe("not available");
    }
    expect(input.hasSampleData).toBe(true);
  });

  it("carries the buyer's answers and defaults but no email or token fields", () => {
    expect(Object.keys(input).sort()).toEqual(
      ["affordability", "backups", "buyerAnswers", "dataAsOf", "hasSampleData", "picks", "priorities", "ruledOut", "scoreScale", "usedDefaults"],
    );
    expect(input.priorities[0].weightPercent).toBeGreaterThanOrEqual(input.priorities[1].weightPercent);
  });
});

describe("validateNarrative", () => {
  const { input } = buildReportInput(example, ds);

  it("accepts the template narrative for many different buyers", () => {
    const variants = [
      example,
      buyerProfile.parse({}),
      buyerProfile.parse({ budget: { allInBudget: { min: 6_000_000, max: 8_000_000 } } }),
      buyerProfile.parse({ household: { kidAges: [] }, work: { workplaces: [{ who: "you", hub: "cbd" }] }, legal: { khata: "b_acceptable", reraWithOcCcRequired: false } }),
      buyerProfile.parse({ budget: { allInBudget: { min: 1, max: 1_000_000 } } }), // nothing affordable
    ];
    for (const v of variants) {
      const { input: i } = buildReportInput(v, ds);
      expect(validateNarrative(templateNarrative(i), i), JSON.stringify(v).slice(0, 60)).toEqual([]);
    }
  });

  it("template and facts use readable names, never internal keys", () => {
    const text = JSON.stringify(templateNarrative(input)) + JSON.stringify(input.picks.map((p) => [p.dimensions, p.commute.map((c) => c.destination)]));
    expect(text).not.toMatch(/budgetFit|communityAmenities|orr_bellandur|manyata_hebbal/);
    expect(JSON.stringify(input.picks.map((p) => p.dimensions))).toMatch(/Budget fit/);
  });

  it("rejects numbers not in the input", () => {
    const n = templateNarrative(input);
    n.headline = "Great value at ₹9.99 crore";
    expect(validateNarrative(n, input).join()).toMatch(/not in the input data: .*9\.99/);
  });

  it("rejects wrong pick order, bullet counts, investment talk and protected attributes", () => {
    const n = templateNarrative(input);
    const bad: Narrative = { ...n, picks: [...n.picks].reverse(), bottomLine: ["a", "b"] };
    const issues = validateNarrative(bad, input).join();
    expect(issues).toMatch(/rank order/);
    expect(issues).toMatch(/6 to 8 bullets/);
    expect(validateNarrative({ ...n, headline: "A strong investment" }, input).join()).toMatch(/out-of-scope/);
    expect(validateNarrative({ ...n, headline: "Good for a Hindu family" }, input).join()).toMatch(/protected/);
  });

  it("numbersIn finds numbers in values and inside strings", () => {
    expect([...numbersIn({ a: 5, b: "₹1.20 crore and 1,500 sqft", c: ["2026-10-09"] })].sort((x, y) => x - y)).toEqual([1.2, 5, 9, 10, 1500, 2026]);
  });
});

describe("generateReport", () => {
  const payload = (user: string) => JSON.parse(user.match(/<input>([\s\S]*)<\/input>/)![1]);

  it("without a model call uses the template", async () => {
    const r = await generateReport(example, ds);
    expect(r.narrativeSource).toBe("template");
    expect(r.scoring.results.filter((x) => x.status === "top")).toHaveLength(3);
  });

  it("accepts a valid model narrative and sends it only the report input", async () => {
    const call = vi.fn<ModelCall>(async ({ user }) => templateNarrative(payload(user)));
    const r = await generateReport(example, ds, { call });
    expect(r.narrativeSource).toBe("llm");
    expect(call).toHaveBeenCalledTimes(1);
    const sent = payload(call.mock.calls[0][0].user);
    expect(Object.keys(sent)).toContain("picks");
    expect(JSON.stringify(sent)).not.toMatch(/resume|token|@/);
    expect(call.mock.calls[0][0].system).toMatch(/Use ONLY facts in the input/);
  });

  it("retries once with feedback when the model invents a number, then recovers", async () => {
    let n = 0;
    const call = vi.fn<ModelCall>(async ({ user }) => {
      const t = templateNarrative(payload(user));
      return ++n === 1 ? { ...t, headline: "Only ₹77.77 lakh per month" } : t;
    });
    const r = await generateReport(example, ds, { call });
    expect(r.narrativeSource).toBe("llm");
    expect(r.narrativeProblems.join()).toMatch(/77\.77/);
    expect(call.mock.calls[1][0].user).toMatch(/previous answer was rejected/);
  });

  it("falls back to the template after two bad attempts or a failing model", async () => {
    const bad = vi.fn<ModelCall>(async ({ user }) => ({ ...templateNarrative(payload(user)), situation: "Prices will rise 40.5 percent" }));
    const r1 = await generateReport(example, ds, { call: bad });
    expect(bad).toHaveBeenCalledTimes(2);
    expect(r1.narrativeSource).toBe("template");
    expect(r1.narrativeProblems.length).toBeGreaterThan(0);

    const down = vi.fn<ModelCall>(async () => { throw new Error("boom"); });
    const r2 = await generateReport(example, ds, { call: down });
    expect(r2.narrativeSource).toBe("template");
  });

  it("is reproducible: same profile and data give identical scoring", async () => {
    const a = await generateReport(example, ds);
    const b = await generateReport(example, ds);
    expect(a.scoring).toEqual(b.scoring);
  });
});
