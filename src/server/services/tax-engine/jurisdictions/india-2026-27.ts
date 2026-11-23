import type { Band, RuleSet } from "../types";

/**
 * India, Tax Year 2026-27 (Income-tax Act 2025). Sources and how sure each rule
 * is: docs/tax-rules-fy-2026-27.md.
 *
 * Once anyone has saved a calculation with a version, do not edit that version:
 * add a new one. Set `status` to "approved" only after a chartered accountant
 * has checked the sheet.
 */
const newRegimeSlabs: Band[] = [
  { above: "0", rate: "0" },
  { above: "400000", rate: "5" },
  { above: "800000", rate: "10" },
  { above: "1200000", rate: "15" },
  { above: "1600000", rate: "20" },
  { above: "2000000", rate: "25" },
  { above: "2400000", rate: "30" },
];

export const india202627: RuleSet = {
  id: "IN-2026-27",
  version: 1,
  status: "pending_review",
  label: "India, FY 2026-27",
  taxYearStart: "2026-04-01",
  regimes: {
    // Section 202
    new_regime: {
      slabs: { under_60: newRegimeSlabs, "60_to_79": newRegimeSlabs, "80_plus": newRegimeSlabs },
      // Section 156(2)
      rebate: { incomeUpTo: "1200000", max: "60000", marginalRelief: true },
      surcharge: [
        { above: "5000000", rate: "10" },
        { above: "10000000", rate: "15" },
        { above: "20000000", rate: "25" },
      ],
      // Section 19
      standardDeduction: "75000",
      deductions: false,
    },
    // First Schedule, Part I-B
    old_regime: {
      slabs: {
        under_60: [
          { above: "0", rate: "0" },
          { above: "250000", rate: "5" },
          { above: "500000", rate: "20" },
          { above: "1000000", rate: "30" },
        ],
        "60_to_79": [
          { above: "0", rate: "0" },
          { above: "300000", rate: "5" },
          { above: "500000", rate: "20" },
          { above: "1000000", rate: "30" },
        ],
        "80_plus": [
          { above: "0", rate: "0" },
          { above: "500000", rate: "20" },
          { above: "1000000", rate: "30" },
        ],
      },
      // Section 156(1)
      rebate: { incomeUpTo: "500000", max: "12500", marginalRelief: false },
      surcharge: [
        { above: "5000000", rate: "10" },
        { above: "10000000", rate: "15" },
        { above: "20000000", rate: "25" },
        { above: "50000000", rate: "37" },
      ],
      standardDeduction: "50000",
      deductions: true,
    },
  },
  cessRate: "4",
  deductionLimits: {
    savings: "150000", // section 123
    nps: "50000", // section 124
    health: "25000", // section 126
    healthSenior: "50000",
    savingsInterest: "10000", // section 153
    savingsInterestSenior: "50000",
  },
  // Section 58
  presumptive: { limit: "5000000", limitLowCash: "7500000", maxCashPercent: "5", profitPercent: "50" },
  // Sections 404 and 408
  advanceTax: {
    threshold: "10000",
    instalments: [
      { due: "2026-06-15", percent: "15" },
      { due: "2026-09-15", percent: "45" },
      { due: "2026-12-15", percent: "75" },
      { due: "2027-03-15", percent: "100" },
    ],
    presumptiveDue: "2027-03-15",
  },
};
