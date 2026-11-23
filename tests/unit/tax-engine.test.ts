import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";
import { calculate, roundToTen } from "@/server/services/tax-engine/calculator";
import { india202627 as rules } from "@/server/services/tax-engine/jurisdictions/india-2026-27";
import type { Regime, TaxInput, TaxResult } from "@/server/services/tax-engine/types";

const blank: TaxInput = {
  ageGroup: "under_60",
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

function run(input: Partial<TaxInput>, regime: Regime = "new_regime"): TaxResult {
  const outcome = calculate(rules, { ...blank, ...input });
  if (!outcome.ok) throw new Error(outcome.error);
  return outcome.results[regime];
}
const onIncome = (income: number | string, regime: Regime = "new_regime", extra: Partial<TaxInput> = {}) =>
  run({ receipts: String(income), ...extra }, regime);
function failure(input: Partial<TaxInput>): string {
  const outcome = calculate(rules, { ...blank, ...input });
  return outcome.ok ? "" : outcome.error;
}

describe("worked examples from docs/tax-rules-fy-2026-27.md", () => {
  it.each([
    ["new_regime", 1200000, "60000", "60000", "0", "0", "0", "0"],
    ["new_regime", 1210000, "61500", "51500", "0", "0", "400", "10400"],
    ["new_regime", 1270000, "70500", "500", "0", "0", "2800", "72800"],
    ["new_regime", 1280000, "72000", "0", "0", "0", "2880", "74880"],
    ["new_regime", 1500000, "105000", "0", "0", "0", "4200", "109200"],
    ["new_regime", 2400000, "300000", "0", "0", "0", "12000", "312000"],
    ["new_regime", 5000000, "1080000", "0", "0", "0", "43200", "1123200"],
    ["new_regime", 5100000, "1110000", "0", "111000", "41000", "47200", "1227200"],
    ["new_regime", 10100000, "2610000", "0", "391500", "63500", "117520", "3055520"],
    ["new_regime", 20100000, "5610000", "0", "1402500", "495500", "260680", "6777680"],
    ["new_regime", 60000000, "17580000", "0", "4395000", "0", "879000", "22854000"],
    ["old_regime", 500000, "12500", "12500", "0", "0", "0", "0"],
    ["old_regime", 510000, "14500", "0", "0", "0", "580", "15080"],
    ["old_regime", 1000000, "112500", "0", "0", "0", "4500", "117000"],
    ["old_regime", 5100000, "1342500", "0", "134250", "64250", "56500", "1469000"],
    ["old_regime", 50100000, "14842500", "0", "5491725", "1718600", "744625", "19360250"],
  ] as const)("%s on %i", (regime, income, slabTax, rebate, surcharge, marginalRelief, cess, totalTax) => {
    expect(onIncome(income, regime)).toMatchObject({ slabTax, rebate, surcharge, marginalRelief, cess, totalTax });
  });
});

describe("slabs", () => {
  it.each([
    [400000, "0"],
    [400010, "0.5"],
    [800000, "20000"],
    [800010, "20001"],
    [1200000, "60000"],
    [1600000, "120000"],
    [2000000, "200000"],
    [2400000, "300000"],
    [2400010, "300003"],
  ])("new regime tax on %i is %s", (income, tax) => {
    expect(onIncome(income).slabTax).toBe(tax);
  });

  it.each([
    ["under_60", "112500"],
    ["60_to_79", "110000"],
    ["80_plus", "100000"],
  ] as const)("old regime on 10 lakh, %s, is %s", (ageGroup, tax) => {
    expect(onIncome(1000000, "old_regime", { ageGroup }).slabTax).toBe(tax);
  });

  it("does not vary with age in the new regime", () => {
    expect(onIncome(1500000, "new_regime", { ageGroup: "80_plus" }).totalTax).toBe("109200");
  });

  it("gives parts that add up to the whole", () => {
    const result = onIncome(1850000);
    const sum = (key: "income" | "tax") => Decimal.sum(...result.slabs.map((slab) => slab[key])).toFixed();
    expect(sum("income")).toBe(result.totalIncome);
    expect(sum("tax")).toBe(result.slabTax);
  });
});

describe("rebate", () => {
  it("never takes tax below zero", () => {
    expect(onIncome(300000)).toMatchObject({ rebate: "0", totalTax: "0" });
    expect(onIncome(700000)).toMatchObject({ slabTax: "15000", rebate: "15000", totalTax: "0" });
  });

  it("limits tax just above 12 lakh to the income above it", () => {
    expect(onIncome(1200010)).toMatchObject({ rebate: "59991.5", totalTax: "10" });
  });

  it("has no marginal relief in the old regime", () => {
    expect(onIncome(500010, "old_regime")).toMatchObject({ rebate: "0", totalTax: "13000" });
  });
});

describe("surcharge", () => {
  it.each([
    ["new_regime", 5000000, "0"],
    ["new_regime", 5000010, "10"],
    ["new_regime", 10000010, "15"],
    ["new_regime", 20000010, "25"],
    ["new_regime", 500000000, "25"],
    ["old_regime", 50000000, "25"],
    ["old_regime", 50000010, "37"],
  ] as const)("%s at %i is %s%%", (regime, income, rate) => {
    expect(onIncome(income, regime).surchargeRate).toBe(rate);
  });

  it.each(["under_60", "60_to_79", "80_plus"] as const)("relief uses the slabs for %s", (ageGroup) => {
    const at = onIncome(5000000, "old_regime", { ageGroup });
    const above = onIncome(5000010, "old_regime", { ageGroup });
    expect(new Decimal(above.totalTax).minus(at.totalTax).toNumber()).toBe(10);
  });
});

describe("properties over a wide range of incomes", () => {
  const incomes = [
    ...Array.from({ length: 700 }, (_, i) => i * 10_000),
    ...[1200000, 5000000, 10000000, 20000000, 50000000].flatMap((t) => [-20, -10, 0, 10, 20, 1000, 50000].map((d) => t + d)),
    ...Array.from({ length: 200 }, (_, i) => 7_000_000 + i * 300_000),
  ].sort((a, b) => a - b);

  it.each(["new_regime", "old_regime"] as const)("%s: more income never means less tax", (regime) => {
    let last = new Decimal(0);
    for (const income of incomes) {
      const tax = new Decimal(onIncome(income, regime).totalTax);
      expect(tax.greaterThanOrEqualTo(last), `at ${income}`).toBe(true);
      last = tax;
    }
  });

  it("new regime: before cess, an extra rupee never costs more than a rupee", () => {
    let lastLeft = new Decimal(0);
    for (const income of incomes) {
      const r = onIncome(income);
      const beforeCess = new Decimal(r.slabTax).minus(r.rebate).plus(r.surcharge).minus(r.marginalRelief);
      const left = new Decimal(income).minus(beforeCess);
      expect(left.greaterThanOrEqualTo(lastLeft), `at ${income}`).toBe(true);
      lastLeft = left;
    }
  });

  it("gives the same answer every time", () => {
    expect(onIncome(1234560)).toEqual(onIncome(1234560));
  });
});

describe("rounding", () => {
  it.each([
    ["104.99", "100"],
    ["105", "110"],
    ["104", "100"],
    ["0.99", "0"],
    ["114.999", "110"],
    ["115.01", "120"],
  ])("rounds %s to %s", (value, expected) => {
    expect(roundToTen(new Decimal(value)).toFixed()).toBe(expected);
  });

  it("rounds income before tax is worked out", () => {
    expect(onIncome("1200004.99").totalIncome).toBe("1200000");
    expect(onIncome("1200005").totalIncome).toBe("1200010");
  });
});

describe("professional income", () => {
  it("is receipts less expenses", () => {
    expect(run({ receipts: "1000000.50", expenses: "250000.25" }).professionalIncome).toBe("750000.25");
  });

  it("does not guess at losses", () => {
    expect(failure({ receipts: "100", expenses: "101" })).toMatch(/Losses/);
  });
});

describe("presumptive scheme", () => {
  const scheme = { method: "presumptive", professionConfirmed: true } as const;

  it("is half of receipts and ignores expenses", () => {
    expect(run({ ...scheme, receipts: "4000000", expenses: "3900000" }).professionalIncome).toBe("2000000");
  });

  it("uses a higher declared profit but not a lower one", () => {
    expect(run({ ...scheme, receipts: "1000000", declaredProfit: "600000" }).professionalIncome).toBe("600000");
    expect(run({ ...scheme, receipts: "1000000", declaredProfit: "400000" }).professionalIncome).toBe("500000");
  });

  it.each([
    ["5000000", "5000000", true],
    ["5000001", "1000000", false],
    ["5000001", "250000.05", true],
    ["5000001", "250000.06", false],
    ["7500000", "375000", true],
    ["7500000", "375000.01", false],
    ["7500001", "0", false],
  ])("receipts %s with %s in cash: allowed %s", (receipts, cashReceipts, allowed) => {
    expect(failure({ ...scheme, receipts, cashReceipts }) === "").toBe(allowed);
  });

  it("needs the profession to be confirmed", () => {
    expect(failure({ ...scheme, professionConfirmed: false, receipts: "100" })).toMatch(/profession/);
  });

  it("refuses figures that cannot be true", () => {
    expect(failure({ ...scheme, receipts: "100", cashReceipts: "101" })).toMatch(/Cash/);
    expect(failure({ ...scheme, receipts: "100", declaredProfit: "101" })).toMatch(/profit/);
  });
});

describe("salary, interest and deductions", () => {
  it("takes the standard deduction from salary only", () => {
    expect(run({ salary: "1000000" }).salaryIncome).toBe("925000");
    expect(run({ salary: "1000000" }, "old_regime").salaryIncome).toBe("950000");
    expect(run({ salary: "40000" }).salaryIncome).toBe("0");
    expect(run({ receipts: "1000000" }).totalIncome).toBe("1000000");
  });

  const generous = {
    receipts: "2000000",
    savings: "200000",
    nps: "60000",
    healthSelf: "60000",
    healthParents: "60000",
    savingsInterest: "60000",
  };

  it("caps each deduction, in the old regime only", () => {
    expect(run(generous).deductions).toEqual([]);
    const amounts = run(generous, "old_regime").deductions.map((line) => line.amount);
    expect(amounts).toEqual(["150000", "50000", "25000", "25000", "10000"]);
  });

  it("uses senior limits", () => {
    const input = { ...generous, ageGroup: "60_to_79", parentsSenior: true } as const;
    const amounts = run(input, "old_regime").deductions.map((line) => line.amount);
    expect(amounts).toEqual(["150000", "50000", "50000", "50000", "50000"]);
  });

  it("never takes income below zero", () => {
    expect(run({ receipts: "100000", savings: "150000" }, "old_regime").totalIncome).toBe("0");
    expect(run({ receipts: "100000", savings: "150000" }, "old_regime").effectiveRate).toBe("0");
  });
});

describe("tax already deducted and advance tax", () => {
  it("shows a refund as a negative balance", () => {
    expect(onIncome(1000000, "new_regime", { taxDeducted: "25000" })).toMatchObject({
      balance: "-25000",
      advanceTax: { required: false, instalments: [] },
    });
  });

  it.each([
    ["99200.01", false],
    ["99200", true],
  ])("with %s deducted, advance tax is required: %s", (taxDeducted, required) => {
    expect(onIncome(1500000, "new_regime", { taxDeducted }).advanceTax.required).toBe(required);
  });

  it("splits into four instalments that add up", () => {
    const { instalments } = onIncome(1500000).advanceTax;
    expect(instalments).toEqual([
      { due: "2026-06-15", amount: "16380" },
      { due: "2026-09-15", amount: "32760" },
      { due: "2026-12-15", amount: "32760" },
      { due: "2027-03-15", amount: "27300" },
    ]);
  });

  it("is one payment under the presumptive scheme", () => {
    const { instalments } = run({ receipts: "3000000", method: "presumptive", professionConfirmed: true }).advanceTax;
    expect(instalments).toEqual([{ due: "2027-03-15", amount: "109200" }]);
  });

  it("is not due from a senior citizen without professional income", () => {
    expect(run({ ageGroup: "60_to_79", salary: "2000000" }).advanceTax.required).toBe(false);
    expect(run({ ageGroup: "60_to_79", salary: "2000000", receipts: "1" }).advanceTax.required).toBe(true);
  });
});

it("stays marked as pending until an accountant has reviewed the rules", () => {
  // Change this test in the same commit that records the review.
  expect(rules.status).toBe("pending_review");
});
