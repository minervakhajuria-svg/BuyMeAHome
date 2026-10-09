import { RATES, type Rates } from "@/config/rates";
import type { PropertyStatus } from "@/lib/schemas";

/** All money is whole rupees. Every rate comes from config/rates.ts (or the `rates` argument). */

export function monthlyEmi(principal: number, annualRatePct: number, years: number): number {
  const n = Math.round(years * 12);
  if (principal <= 0 || n <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  if (r === 0) return Math.round(principal / n);
  const g = Math.pow(1 + r, n);
  return Math.round((principal * r * g) / (g - 1));
}

/** Loan principal that a given monthly EMI can service (inverse of monthlyEmi). */
export function loanSupportedByEmi(emi: number, annualRatePct: number, years: number): number {
  const n = Math.round(years * 12);
  if (emi <= 0 || n <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  if (r === 0) return Math.round(emi * n);
  return Math.round((emi * (1 - Math.pow(1 + r, -n))) / r);
}

/** (new EMI + existing EMIs) as a percentage of monthly household income. */
export function emiShareOfIncomePct(newEmi: number, existingEmis: number, monthlyIncome: number): number {
  if (monthlyIncome <= 0) return Number.POSITIVE_INFINITY;
  return ((newEmi + existingEmis) / monthlyIncome) * 100;
}

export interface EmiPoint {
  price: number;
  loan: number;
  emi: number;
}

/** EMI at several price points, given a fixed down payment. */
export function emiAtPricePoints(prices: number[], downPayment: number, rates: Rates = RATES): EmiPoint[] {
  return prices.map((price) => {
    const loan = Math.max(price - downPayment, 0);
    return { price, loan, emi: monthlyEmi(loan, rates.loanInterestRatePct, rates.loanTenureYears) };
  });
}

export interface OneTimeCosts {
  stampDuty: number;
  registration: number;
  gst: number;
  interiors: number;
  deposits: number;
  total: number;
}

const pct = (price: number, p: number) => Math.round((price * p) / 100);

export function oneTimeCosts(price: number, status: PropertyStatus, rates: Rates = RATES): OneTimeCosts {
  const stampDuty = pct(price, rates.stampDutyPct);
  const registration = pct(price, rates.registrationPct);
  const gst = status === "under_construction" ? pct(price, rates.gstUnderConstructionPct) : 0;
  const interiors = pct(price, rates.interiorsPctOfValue);
  const deposits = pct(price, rates.depositsPctOfValue);
  return { stampDuty, registration, gst, interiors, deposits, total: stampDuty + registration + gst + interiors + deposits };
}

export interface OngoingCosts {
  monthlyMaintenance: number;
  annualPropertyTax: number;
}

export function ongoingCosts(price: number, carpetSqft: number, rates: Rates = RATES): OngoingCosts {
  return {
    monthlyMaintenance: Math.round(carpetSqft * rates.maintenancePerSqftMonthly),
    annualPropertyTax: pct(price, rates.propertyTaxPctOfValue),
  };
}

export interface MaxPriceInput {
  /** All-in budget: property price plus one-time costs. */
  allInBudget: number;
  status: PropertyStatus;
  /** Optional; the EMI-share cap is applied only when both income and down payment are known. */
  downPayment?: number | null;
  monthlyIncome?: number | null;
  existingEmis?: number;
}

export interface MaxPriceResult {
  maxPrice: number;
  binding: "all_in_budget" | "emi_cap";
  byAllIn: number;
  byEmiCap: number | null;
}

/**
 * Buying-discipline maximum price: the lower of (a) the price at which price + one-time costs
 * equals the all-in budget, and (b) down payment + the loan whose EMI keeps total EMIs within
 * the comfortable share of income.
 */
export function maxAffordablePrice(input: MaxPriceInput, rates: Rates = RATES): MaxPriceResult {
  const costPct =
    rates.stampDutyPct +
    rates.registrationPct +
    (input.status === "under_construction" ? rates.gstUnderConstructionPct : 0) +
    rates.interiorsPctOfValue +
    rates.depositsPctOfValue;
  const byAllIn = Math.floor((input.allInBudget * 100) / (100 + costPct));

  let byEmiCap: number | null = null;
  if (input.monthlyIncome != null && input.downPayment != null) {
    const allowedEmi = (input.monthlyIncome * rates.comfortableEmiSharePct) / 100 - (input.existingEmis ?? 0);
    const loan = loanSupportedByEmi(Math.max(allowedEmi, 0), rates.loanInterestRatePct, rates.loanTenureYears);
    byEmiCap = input.downPayment + loan;
  }
  if (byEmiCap !== null && byEmiCap < byAllIn) {
    return { maxPrice: byEmiCap, binding: "emi_cap", byAllIn, byEmiCap };
  }
  return { maxPrice: byAllIn, binding: "all_in_budget", byAllIn, byEmiCap };
}

/** Cash to keep untouched after closing: N months of all EMIs. */
export function liquidityBufferRequired(newEmi: number, existingEmis: number, rates: Rates = RATES): number {
  return Math.round(rates.minLiquidityBufferMonths * (newEmi + existingEmis));
}
