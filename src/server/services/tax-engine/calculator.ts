import { Decimal } from "decimal.js";
import type { AgeGroup, Band, Line, Outcome, Regime, RegimeRules, RuleSet, SlabAge, TaxInput, TaxResult } from "./types";

/** Pure and deterministic: the same rules and input always give the same result. */

const Money = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
type Money = Decimal;

const ZERO = new Money(0);
const money = (value: Decimal.Value) => new Money(value);
const text = (value: Money) => value.toFixed();
const percent = (value: Money, rate: Decimal.Value) => value.times(rate).dividedBy(100);
const lower = (a: Money, b: Decimal.Value) => Money.min(a, b);
const notNegative = (value: Money) => Money.max(value, 0);

const slabAge = (age: AgeGroup): SlabAge => (age === "under_18" ? "under_60" : age);
const isSenior = (age: AgeGroup) => age === "60_to_79" || age === "80_plus";

/** Section 99: a minor's interest is normally a parent's income. What they earn by their own work is theirs. */
const interestGoesToParent = (input: TaxInput) => input.ageGroup === "under_18" && !input.interestIsOwn;

/** Section 516: drop paise, then round to the nearest ten rupees. */
export function roundToTen(value: Money): Money {
  return value.truncated().dividedBy(10).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).times(10);
}

function applySlabs(income: Money, bands: Band[]) {
  return bands.map((band, index) => {
    const next = bands[index + 1];
    const top = next ? lower(income, next.above) : income;
    const taxed = notNegative(top.minus(band.above));
    return {
      from: band.above,
      to: next?.above ?? null,
      rate: band.rate,
      income: text(taxed),
      tax: percent(taxed, band.rate),
    };
  });
}

const slabTaxOn = (income: Money, bands: Band[]) =>
  applySlabs(income, bands).reduce((total, slab) => total.plus(slab.tax), ZERO);

/** Section 156. Never more than the tax itself. */
function rebateOn(tax: Money, income: Money, rebate: RegimeRules["rebate"]): Money {
  const excess = income.minus(rebate.incomeUpTo);
  if (excess.lessThanOrEqualTo(0)) return lower(tax, rebate.max);
  // Just above the limit, tax may not exceed the income above the limit.
  return rebate.marginalRelief ? notNegative(tax.minus(excess)) : ZERO;
}

function surchargeOn(tax: Money, income: Money, rules: RegimeRules, age: AgeGroup) {
  const reached = rules.surcharge.filter((band) => income.greaterThan(band.above));
  const band = reached.at(-1);
  if (!band) return { rate: "0", surcharge: ZERO, relief: ZERO };

  const surcharge = percent(tax, band.rate);
  // Tax plus surcharge may not exceed what is due exactly at the threshold,
  // plus the income above it. At the threshold the band below still applies.
  const taxAtThreshold = slabTaxOn(money(band.above), rules.slabs[slabAge(age)]);
  const dueAtThreshold = taxAtThreshold.plus(percent(taxAtThreshold, reached.at(-2)?.rate ?? 0));
  const cap = dueAtThreshold.plus(income.minus(band.above));
  return { rate: band.rate, surcharge, relief: notNegative(tax.plus(surcharge).minus(cap)) };
}

/** Professional income, below zero for a loss, or why it cannot be worked out. */
function professionalIncome(rules: RuleSet, input: TaxInput): Money | string {
  const receipts = money(input.receipts);
  if (input.method === "actual") return receipts.minus(input.expenses);

  const { limit, limitLowCash, maxCashPercent, profitPercent } = rules.presumptive;
  const cash = money(input.cashReceipts);
  const declared = money(input.declaredProfit);
  if (!input.professionConfirmed) return "Confirm that your profession is on the list before using this scheme.";
  if (cash.greaterThan(receipts)) return "Cash receipts are more than total receipts.";
  if (declared.greaterThan(receipts)) return "The declared profit is more than total receipts.";
  const lowCash = cash.lessThanOrEqualTo(percent(receipts, maxCashPercent));
  if (receipts.greaterThan(lowCash ? limitLowCash : limit)) {
    return "Receipts are above the limit for the presumptive scheme.";
  }
  return Money.max(percent(receipts, profitPercent), declared);
}

function deductionLines(rules: RuleSet, input: TaxInput): Line[] {
  const limits = rules.deductionLimits;
  const senior = isSenior(input.ageGroup);
  const lines: [string, string, string][] = [
    ["Section 123: PPF, ELSS, life insurance and similar", input.savings, limits.savings],
    ["Section 124: extra NPS", input.nps, limits.nps],
    ["Section 126: health insurance, you and family", input.healthSelf, senior ? limits.healthSenior : limits.health],
    [
      "Section 126: health insurance, parents",
      input.healthParents,
      input.parentsSenior ? limits.healthSenior : limits.health,
    ],
    [
      "Section 153: savings interest",
      interestGoesToParent(input) ? "0" : input.savingsInterest,
      senior ? limits.savingsInterestSenior : limits.savingsInterest,
    ],
  ];
  return lines
    .map(([label, amount, limit]) => ({ label, amount: text(lower(money(amount), limit)) }))
    .filter((line) => line.amount !== "0");
}

function advanceTax(rules: RuleSet, input: TaxInput, due: Money): TaxResult["advanceTax"] {
  const { threshold, instalments, presumptiveDue } = rules.advanceTax;
  // Section 403(3): not for a resident senior citizen without professional income.
  const exempt = isSenior(input.ageGroup) && money(input.receipts).isZero();
  if (exempt || due.lessThan(threshold)) return { required: false, instalments: [] };
  if (input.method === "presumptive") {
    return { required: true, instalments: [{ due: presumptiveDue, amount: text(due) }] };
  }

  let paid = ZERO;
  return {
    required: true,
    instalments: instalments.map(({ due: date, percent: share }) => {
      const cumulative = percent(due, share).toDecimalPlaces(0, Decimal.ROUND_UP);
      const amount = cumulative.minus(paid);
      paid = cumulative;
      return { due: date, amount: text(amount) };
    }),
  };
}

function calculateRegime(rules: RuleSet, regime: Regime, input: TaxInput, profit: Money): TaxResult {
  const regimeRules = rules.regimes[regime];
  const bands = regimeRules.slabs[slabAge(input.ageGroup)];
  const professional = notNegative(profit);

  const salary = money(input.salary);
  const salaryIncome = salary.minus(lower(salary, regimeRules.standardDeduction));
  const allInterest = money(input.savingsInterest).plus(input.otherInterest);
  const parentInterest = interestGoesToParent(input) ? allInterest : ZERO;
  const interest = allInterest.minus(parentInterest);
  const gross = professional.plus(salaryIncome).plus(interest);

  const deductions = regimeRules.deductions ? deductionLines(rules, input) : [];
  const deducted = deductions.reduce((total, line) => total.plus(line.amount), ZERO);
  const income = roundToTen(notNegative(gross.minus(deducted)));

  const slabs = applySlabs(income, bands);
  const slabTax = slabs.reduce((total, slab) => total.plus(slab.tax), ZERO);
  const rebate = rebateOn(slabTax, income, regimeRules.rebate);
  const tax = slabTax.minus(rebate);
  const { rate, surcharge, relief } = surchargeOn(tax, income, regimeRules, input.ageGroup);
  const beforeCess = tax.plus(surcharge).minus(relief);
  const cess = percent(beforeCess, rules.cessRate);
  const totalTax = roundToTen(beforeCess.plus(cess));
  const balance = totalTax.minus(input.taxDeducted);

  return {
    regime,
    professionalIncome: text(professional),
    loss: text(notNegative(profit.negated())),
    parentInterest: text(parentInterest),
    salaryIncome: text(salaryIncome),
    interestIncome: text(interest),
    grossTotalIncome: text(gross),
    deductions,
    totalIncome: text(income),
    slabs: slabs.map((slab) => ({ ...slab, tax: text(slab.tax) })),
    slabTax: text(slabTax),
    rebate: text(rebate),
    surchargeRate: rate,
    surcharge: text(surcharge),
    marginalRelief: text(relief),
    cess: text(cess),
    totalTax: text(totalTax),
    effectiveRate: income.isZero() ? "0" : totalTax.dividedBy(income).times(100).toFixed(2),
    taxDeducted: text(money(input.taxDeducted)),
    balance: text(balance),
    advanceTax: advanceTax(rules, input, notNegative(balance)),
  };
}

export function calculate(rules: RuleSet, input: TaxInput): Outcome {
  const professional = professionalIncome(rules, input);
  if (typeof professional === "string") return { ok: false, error: professional };
  return {
    ok: true,
    results: {
      new_regime: calculateRegime(rules, "new_regime", input, professional),
      old_regime: calculateRegime(rules, "old_regime", input, professional),
    },
  };
}
