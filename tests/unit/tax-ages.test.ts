import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { calculate } from "@/server/services/tax-engine/calculator";
import { india202627 as rules } from "@/server/services/tax-engine/jurisdictions/india-2026-27";
import type { AgeGroup, Regime, TaxInput, TaxResult } from "@/server/services/tax-engine/types";
import { taxProfileSchema } from "@/validations/settings";
import { taxFormSchema } from "@/validations/tax";

const blank: TaxInput = {
  ageGroup: "under_18",
  receipts: "0",
  method: "actual",
  expenses: "0",
  cashReceipts: "0",
  declaredProfit: "0",
  professionConfirmed: false,
  salary: "0",
  savingsInterest: "0",
  otherInterest: "0",
  savings: "0",
  nps: "0",
  healthSelf: "0",
  healthParents: "0",
  parentsSenior: false,
  taxDeducted: "0",
};
const both = ["new_regime", "old_regime"] as const;

function run(input: Partial<TaxInput>, regime: Regime = "new_regime"): TaxResult {
  const outcome = calculate(rules, { ...blank, ...input });
  if (!outcome.ok) throw new Error(outcome.error);
  return outcome.results[regime];
}

describe("under 18", () => {
  it.each(both)("own work is taxed as for 18 to 59 in the %s", (regime) => {
    for (const receipts of ["250001", "400000", "900000", "1210000", "5100000", "20100000"]) {
      const own = run({ receipts, salary: "100000" }, regime);
      expect(own).toEqual(run({ receipts, salary: "100000", ageGroup: "under_60" }, regime));
    }
  });

  it.each(both)("interest is left out in the %s, as a parent's", (regime) => {
    const result = run({ receipts: "900000", savingsInterest: "20000", otherInterest: "30000" }, regime);
    expect(result).toMatchObject({ interestIncome: "0", parentInterest: "50000", grossTotalIncome: "900000", deductions: [] });
    expect(result.totalTax).toBe(run({ receipts: "900000" }, regime).totalTax);
  });

  it("interest counts when it is taxed as their own", () => {
    const interest = { savingsInterest: "20000", otherInterest: "30000", interestIsOwn: true };
    expect(run({ receipts: "900000", ...interest }, "old_regime")).toMatchObject({
      interestIncome: "50000",
      parentInterest: "0",
      deductions: [{ label: "Section 153: savings interest", amount: "10000" }],
    });
  });

  it("get no senior benefits", () => {
    const health = { receipts: "900000", healthSelf: "60000" };
    expect(run(health, "old_regime").deductions).toEqual([{ label: "Section 126: health insurance, you and family", amount: "25000" }]);
    expect(run({ salary: "3000000" }).advanceTax.required).toBe(true);
  });

  it("the interest choice changes nothing for anyone else", () => {
    for (const ageGroup of ["under_60", "60_to_79", "80_plus"] as AgeGroup[]) {
      const input = { ageGroup, receipts: "900000", otherInterest: "50000" };
      expect(run({ ...input, interestIsOwn: true })).toEqual(run(input));
      expect(run(input).parentInterest).toBe("0");
    }
  });
});

describe("every age is accepted", () => {
  it.each(["under_18", "under_60", "60_to_79", "80_plus"])("%s", (ageGroup) => {
    expect(taxFormSchema.safeParse({ ...blank, ageGroup, scopeConfirmed: true }).success).toBe(true);
    const profile = {
      taxYearStart: "2026-04-01", ageGroup, regime: "new_regime", businessStructure: "freelancer", presumptiveTaxation: false,
      pan: "", removePan: false, gstin: "", gstFiling: "", hasLut: false, lutArn: "", lutValidFrom: "", lutValidTo: "",
    };
    expect(taxProfileSchema.safeParse(profile).success).toBe(true);
  });
});

describe("a loss", () => {
  it.each(both)("counts as no income in the %s, and is not set against other income", (regime) => {
    const result = run({ ageGroup: "under_60", receipts: "100000", expenses: "150000.50", salary: "2000000" }, regime);
    expect(result).toMatchObject({ professionalIncome: "0", loss: "50000.5" });
    expect(result.totalTax).toBe(run({ ageGroup: "under_60", salary: "2000000" }, regime).totalTax);
  });

  it("alone means no tax", () => {
    expect(run({ ageGroup: "under_60", expenses: "1000" })).toMatchObject({ totalTax: "0", effectiveRate: "0", loss: "1000" });
  });

  it("is zero for a profit", () => {
    expect(run({ receipts: "10", expenses: "10" }).loss).toBe("0");
  });
});

/**
 * Made by a second calculator, written in another language from the rule sheet
 * alone. The whole run was 41,638 results with no difference; this is a sample.
 */
describe("an independent calculator", () => {
  type Case = { input: Partial<TaxInput>; want: Record<"new" | "old", [number, number]> };
  const file = path.join(import.meta.dirname, "..", "fixtures", "tax-cases.json");
  const cases: Case[] = JSON.parse(fs.readFileSync(file, "utf8"));

  it("agrees on income and tax in both regimes", () => {
    expect(cases.length).toBe(300);
    for (const { input, want } of cases) {
      const outcome = calculate(rules, { ...blank, ...input, professionConfirmed: true });
      if (!outcome.ok) throw new Error(outcome.error);
      const found = {
        new: [outcome.results.new_regime.totalIncome, outcome.results.new_regime.totalTax].map(Number),
        old: [outcome.results.old_regime.totalIncome, outcome.results.old_regime.totalTax].map(Number),
      };
      expect({ input, found }).toEqual({ input, found: want });
    }
  });
});
