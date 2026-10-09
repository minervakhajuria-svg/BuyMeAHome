import { describe, expect, it } from "vitest";
import type { Rates } from "@/config/rates";
import {
  emiAtPricePoints,
  emiShareOfIncomePct,
  liquidityBufferRequired,
  loanSupportedByEmi,
  maxAffordablePrice,
  monthlyEmi,
  ongoingCosts,
  oneTimeCosts,
} from "./money";

// Independent of the placeholder values in config/rates.ts.
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

describe("monthlyEmi", () => {
  it("matches standard published figures", () => {
    // Rs 1,00,000 at 12% for 12 months is the textbook Rs 8,884.88 a month, so 10x is 88,848.79 -> 88,849.
    expect(monthlyEmi(1_000_000, 12, 1)).toBe(88_849);
    // Rs 10 lakh at 10% for 10 years is the commonly quoted Rs 13,215 a month.
    expect(monthlyEmi(1_000_000, 10, 10)).toBe(13_215);
  });
  it("handles zero rate and zero principal", () => {
    expect(monthlyEmi(1_200_000, 0, 1)).toBe(100_000); // 12 equal payments
    expect(monthlyEmi(0, 10, 10)).toBe(0);
  });
});

describe("loanSupportedByEmi", () => {
  it("inverts monthlyEmi", () => {
    expect(Math.abs(loanSupportedByEmi(88_849, 12, 1) - 1_000_000)).toBeLessThan(10);
    // 60,000 / 88,848.79 * 1,000,000 = 675,305 (hand calculation)
    expect(Math.abs(loanSupportedByEmi(60_000, 12, 1) - 675_305)).toBeLessThan(10);
  });
});

describe("emiShareOfIncomePct", () => {
  it("includes existing EMIs", () => {
    // (30,000 + 20,000) / 2,00,000 = 25%
    expect(emiShareOfIncomePct(30_000, 20_000, 200_000)).toBe(25);
  });
});

describe("emiAtPricePoints", () => {
  it("applies the down payment and never goes negative", () => {
    const pts = emiAtPricePoints([3_000_000, 1_500_000], 2_000_000, R);
    expect(pts[0]).toEqual({ price: 3_000_000, loan: 1_000_000, emi: 88_849 });
    expect(pts[1]).toEqual({ price: 1_500_000, loan: 0, emi: 0 });
  });
});

describe("oneTimeCosts", () => {
  it("ready property at Rs 1 crore", () => {
    // stamp 5% = 5,00,000; registration 1% = 1,00,000; no GST; interiors 8% = 8,00,000; deposits 1% = 1,00,000
    expect(oneTimeCosts(10_000_000, "ready", R)).toEqual({
      stampDuty: 500_000,
      registration: 100_000,
      gst: 0,
      interiors: 800_000,
      deposits: 100_000,
      total: 1_500_000,
    });
  });
  it("adds GST only for under-construction", () => {
    const uc = oneTimeCosts(10_000_000, "under_construction", R);
    expect(uc.gst).toBe(500_000);
    expect(uc.total).toBe(2_000_000);
    expect(oneTimeCosts(10_000_000, "resale", R).gst).toBe(0);
  });
});

describe("ongoingCosts", () => {
  it("computes maintenance and property tax", () => {
    // 1,000 sqft x Rs 4 = 4,000 a month; 0.2% of 1 crore = 20,000 a year
    expect(ongoingCosts(10_000_000, 1000, R)).toEqual({ monthlyMaintenance: 4000, annualPropertyTax: 20_000 });
  });
});

describe("maxAffordablePrice", () => {
  it("all-in budget binds when no income is given", () => {
    // 1.15 crore / 1.15 (15% of one-time costs for a ready flat) = 1 crore
    const r = maxAffordablePrice({ allInBudget: 11_500_000, status: "ready" }, R);
    expect(r).toMatchObject({ maxPrice: 10_000_000, binding: "all_in_budget", byEmiCap: null });
  });
  it("includes GST for under-construction", () => {
    // 1.2 crore / 1.20 = 1 crore
    expect(maxAffordablePrice({ allInBudget: 12_000_000, status: "under_construction" }, R).maxPrice).toBe(10_000_000);
  });
  it("EMI cap binds for a stretched buyer", () => {
    // Allowed EMI = 40% x 2,00,000 - 20,000 = 60,000 -> loan ~ 6,75,305; plus 30,00,000 down = ~36,75,305
    const r = maxAffordablePrice(
      { allInBudget: 11_500_000, status: "ready", downPayment: 3_000_000, monthlyIncome: 200_000, existingEmis: 20_000 },
      R,
    );
    expect(r.binding).toBe("emi_cap");
    expect(Math.abs(r.maxPrice - 3_675_305)).toBeLessThan(10);
    expect(r.byAllIn).toBe(10_000_000);
  });
  it("existing EMIs above the cap leave only the down payment", () => {
    const r = maxAffordablePrice(
      { allInBudget: 11_500_000, status: "ready", downPayment: 3_000_000, monthlyIncome: 100_000, existingEmis: 50_000 },
      R,
    );
    expect(r.maxPrice).toBe(3_000_000);
  });
});

describe("liquidityBufferRequired", () => {
  it("is months of all EMIs", () => {
    // 6 x (30,000 + 20,000) = 3,00,000
    expect(liquidityBufferRequired(30_000, 20_000, R)).toBe(300_000);
  });
});
