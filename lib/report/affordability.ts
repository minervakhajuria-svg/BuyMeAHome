import { RATES, type Rates } from "@/config/rates";
import { formatRupees } from "@/lib/format";
import {
  emiShareOfIncomePct,
  liquidityBufferRequired,
  maxAffordablePrice,
  monthlyEmi,
  ongoingCosts,
  oneTimeCosts,
  type OneTimeCosts,
} from "@/lib/money";
import type { ResolvedProfile } from "@/lib/profile/defaults";
import { priceForMinBhk } from "@/lib/scoring";
import type { MicroMarketRow, PropertyStatus } from "@/lib/schemas";

/** "The honest math": every figure is computed here, in code, from the buyer's numbers and config/rates.ts. */

export interface PricePoint {
  label: "low" | "typical" | "high";
  price: number;
  priceText: string;
  loan: number;
  emi: number;
  emiText: string;
  /** (EMI + existing EMIs) / income, in percent; null when income was not given. */
  emiSharePct: number | null;
}

export interface PickAffordability {
  microMarketId: string;
  bhk: number;
  points: PricePoint[];
  oneTimeAtTypical: Partial<Record<PropertyStatus, OneTimeCosts & { totalText: string }>>;
  ongoing: { monthlyMaintenance: number; annualPropertyTax: number; maintenanceText: string; propertyTaxText: string } | null;
  liquidityBufferRequired: number;
  liquidityBufferText: string;
}

export interface Affordability {
  assumptions: {
    interestRatePct: number;
    tenureYears: number;
    comfortableEmiSharePct: number;
    minLiquidityBufferMonths: number;
    note: string;
  };
  maxPrice: { value: number; text: string; binding: "all_in_budget" | "emi_cap" } | null;
  picks: PickAffordability[];
  notAvailable: string[];
}

export function buildAffordability(
  p: ResolvedProfile,
  picks: MicroMarketRow[],
  rates: Rates = RATES,
): Affordability {
  const notAvailable: string[] = [];
  if (!p.budget) notAvailable.push("No budget given, so the maximum price could not be worked out");
  if (p.downPayment === null) notAvailable.push("No down payment given, so loan amounts and EMIs could not be worked out");
  if (p.householdMonthlyIncome === null) notAvailable.push("No household income given, so EMI as a share of income could not be worked out");
  if (p.minCarpetSqft === null) notAvailable.push("No minimum carpet area given, so monthly maintenance could not be estimated");

  let maxPrice: Affordability["maxPrice"] = null;
  if (p.budget) {
    const best = p.propertyStatuses
      .map((status) =>
        maxAffordablePrice(
          { allInBudget: p.budget!.max, status, downPayment: p.downPayment, monthlyIncome: p.householdMonthlyIncome, existingEmis: p.existingMonthlyEmis },
          rates,
        ),
      )
      .sort((a, b) => b.maxPrice - a.maxPrice)[0];
    maxPrice = { value: best.maxPrice, text: formatRupees(best.maxPrice), binding: best.binding };
  }

  const out: PickAffordability[] = [];
  for (const m of picks) {
    const band = priceForMinBhk(m, p.minBhk);
    if (!band) {
      notAvailable.push(`${m.name}: no typical price for ${p.minBhk}+ BHK in our data`);
      continue;
    }
    const prices: [PricePoint["label"], number][] = [
      ["low", band.min],
      ["typical", Math.round((band.min + band.max) / 2)],
      ["high", band.max],
    ];
    const points: PricePoint[] = prices.map(([label, price]) => {
      const loan = p.downPayment === null ? 0 : Math.max(price - p.downPayment, 0);
      const emi = p.downPayment === null ? 0 : monthlyEmi(loan, rates.loanInterestRatePct, rates.loanTenureYears);
      return {
        label,
        price,
        priceText: formatRupees(price),
        loan,
        emi,
        emiText: p.downPayment === null ? "not available" : formatRupees(emi),
        emiSharePct:
          p.downPayment === null || p.householdMonthlyIncome === null
            ? null
            : Math.round(emiShareOfIncomePct(emi, p.existingMonthlyEmis, p.householdMonthlyIncome) * 10) / 10,
      };
    });
    const typical = points[1];
    const oneTimeAtTypical: PickAffordability["oneTimeAtTypical"] = {};
    for (const status of p.propertyStatuses) {
      const c = oneTimeCosts(typical.price, status, rates);
      oneTimeAtTypical[status] = { ...c, totalText: formatRupees(c.total) };
    }
    const ongoing =
      p.minCarpetSqft === null
        ? null
        : (() => {
            const o = ongoingCosts(typical.price, p.minCarpetSqft, rates);
            return { ...o, maintenanceText: formatRupees(o.monthlyMaintenance), propertyTaxText: formatRupees(o.annualPropertyTax) };
          })();
    const buffer = liquidityBufferRequired(typical.emi, p.existingMonthlyEmis, rates);
    out.push({
      microMarketId: m.id ?? m.name,
      bhk: band.bhk,
      points,
      oneTimeAtTypical,
      ongoing,
      liquidityBufferRequired: buffer,
      liquidityBufferText: formatRupees(buffer),
    });
  }

  return {
    assumptions: {
      interestRatePct: rates.loanInterestRatePct,
      tenureYears: rates.loanTenureYears,
      comfortableEmiSharePct: rates.comfortableEmiSharePct,
      minLiquidityBufferMonths: rates.minLiquidityBufferMonths,
      note: "Rates and cost percentages are assumptions to verify with your lender and the registration department; they are not quotes.",
    },
    maxPrice,
    picks: out,
    notAvailable,
  };
}
