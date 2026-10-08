// All rates are placeholders. Every value must be checked against the official source before
// any real report is shown to users. Logic must read from here and never hard-code rates.

export const RATES = {
  /** Annual home-loan interest rate, percent. */
  loanInterestRatePct: 8.75, // VERIFY against official source (lender quotes / RBI)
  /** Loan tenure in years. */
  loanTenureYears: 20, // VERIFY against official source (lender terms)
  /** Stamp duty as a percent of property value (Karnataka). */
  stampDutyPct: 5, // VERIFY against official source (Karnataka stamp duty schedule)
  /** Registration fee as a percent of property value. */
  registrationPct: 1, // VERIFY against official source (Karnataka registration dept)
  /** GST on under-construction property, percent. */
  gstUnderConstructionPct: 5, // VERIFY against official source (GST council notifications)
  /** Annual property tax as a percent of property value (BBMP/GBA approximation). */
  propertyTaxPctOfValue: 0.2, // VERIFY against official source (BBMP/GBA SAS rules)
  /** Interiors budget as a percent of property value. */
  interiorsPctOfValue: 8, // VERIFY against official source (own estimate, not a statutory rate)
  /** Deposits (e.g. maintenance corpus, utilities) as a percent of property value. */
  depositsPctOfValue: 1, // VERIFY against official source (typical builder terms)
  /** Monthly maintenance per sq ft of carpet area, rupees. */
  maintenancePerSqftMonthly: 4, // VERIFY against official source (typical society data)
  /** Maximum comfortable EMI share of household income, percent. */
  comfortableEmiSharePct: 40, // VERIFY against official source (lender FOIR norms)
  /** Minimum liquidity buffer after closing, in months of household expenses and EMIs. */
  minLiquidityBufferMonths: 6, // VERIFY against official source (own policy, not statutory)
} as const;

export type Rates = typeof RATES;
