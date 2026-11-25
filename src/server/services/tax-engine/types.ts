/** Amounts and rates are decimal strings throughout. Nothing here is a float. */
export type Amount = string;

export const ageGroups = {
  under_18: "Under 18",
  under_60: "18 to 59",
  "60_to_79": "60 to 79",
  "80_plus": "80 or over",
} as const;
export type AgeGroup = keyof typeof ageGroups;
/** Under 18 has the same slabs as 18 to 59. What differs is whose income interest is. */
export type SlabAge = Exclude<AgeGroup, "under_18">;
export type Regime = "new_regime" | "old_regime";

/** A rate that applies to the part of the income above `above`. */
export type Band = { above: Amount; rate: Amount };

export type RegimeRules = {
  slabs: Record<SlabAge, Band[]>;
  rebate: { incomeUpTo: Amount; max: Amount; marginalRelief: boolean };
  /** The rate of the highest band reached applies to the whole tax. */
  surcharge: Band[];
  standardDeduction: Amount;
  /** Chapter VIII deductions (80C and so on under the 1961 Act). */
  deductions: boolean;
};

export type RuleSet = {
  id: string;
  version: number;
  /** "pending_review" keeps the calculator off in production. */
  status: "pending_review" | "approved";
  label: string;
  taxYearStart: string;
  regimes: Record<Regime, RegimeRules>;
  cessRate: Amount;
  deductionLimits: {
    savings: Amount;
    nps: Amount;
    health: Amount;
    healthSenior: Amount;
    savingsInterest: Amount;
    savingsInterestSenior: Amount;
  };
  presumptive: { limit: Amount; limitLowCash: Amount; maxCashPercent: Amount; profitPercent: Amount };
  advanceTax: { threshold: Amount; instalments: { due: string; percent: Amount }[]; presumptiveDue: string };
};

export type TaxInput = {
  ageGroup: AgeGroup;
  receipts: Amount;
  method: "actual" | "presumptive";
  expenses: Amount;
  cashReceipts: Amount;
  /** Presumptive only: a profit above the minimum, or "0" to use the minimum. */
  declaredProfit: Amount;
  professionConfirmed: boolean;
  salary: Amount;
  savingsInterest: Amount;
  otherInterest: Amount;
  /** Under 18 only: interest is taxed as their own, not added to a parent's income. */
  interestIsOwn?: boolean;
  savings: Amount;
  nps: Amount;
  healthSelf: Amount;
  healthParents: Amount;
  parentsSenior: boolean;
  taxDeducted: Amount;
};

export type Line = { label: string; amount: Amount };

export type TaxResult = {
  regime: Regime;
  professionalIncome: Amount;
  /** Expenses above receipts. Counted as no income, and not set against anything else. */
  loss?: Amount;
  /** Under 18: interest that is normally added to a parent's income instead. */
  parentInterest?: Amount;
  salaryIncome: Amount;
  interestIncome: Amount;
  grossTotalIncome: Amount;
  deductions: Line[];
  totalIncome: Amount;
  slabs: { from: Amount; to: Amount | null; rate: Amount; income: Amount; tax: Amount }[];
  slabTax: Amount;
  rebate: Amount;
  surchargeRate: Amount;
  surcharge: Amount;
  marginalRelief: Amount;
  cess: Amount;
  totalTax: Amount;
  effectiveRate: Amount;
  taxDeducted: Amount;
  /** Negative when a refund is due. */
  balance: Amount;
  advanceTax: { required: boolean; instalments: { due: string; amount: Amount }[] };
};

export type Outcome = { ok: true; results: Record<Regime, TaxResult> } | { ok: false; error: string };
