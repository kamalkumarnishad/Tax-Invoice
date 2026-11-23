import "server-only";
import { and, count, eq, ne, sql, sum } from "drizzle-orm";
import { auditLogs, expenseRecords, incomeRecords, taxCalculations } from "@/db/schema";
import { add, plain } from "@/lib/money";
import { type TaxFormInput, toTaxInput } from "@/validations/tax";
import { type ActionResult, done, fail, ok, type Tx } from "./shared";
import { calculate } from "./tax-engine/calculator";
import type { Outcome, RuleSet } from "./tax-engine/types";

/** The engine is for India, so only records kept in rupees count. */
const CURRENCY = "INR";

const PROFESSIONAL = new Set(["freelance", "consulting"]);

/** Starting figures for the calculator, from what the user has recorded. */
export async function prefill(tx: Tx, userId: string, year: string) {
  const income = and(eq(incomeRecords.userId, userId), eq(incomeRecords.taxYearStart, year));
  const expenses = and(eq(expenseRecords.userId, userId), eq(expenseRecords.taxYearStart, year));

  const rows = await tx
    .select({
      category: incomeRecords.category,
      cash: sql<boolean>`${incomeRecords.paymentMethod} = 'cash'`,
      gross: sum(incomeRecords.convertedAmount),
      // Whatever lies between gross and net, apart from TDS, was a fee or charge.
      charges: sql<string>`sum(${incomeRecords.convertedAmount} - ${incomeRecords.netReceived} - ${incomeRecords.tdsDeducted})`,
      tds: sum(incomeRecords.tdsDeducted),
    })
    .from(incomeRecords)
    .where(and(income, eq(incomeRecords.status, "received"), eq(incomeRecords.baseCurrency, CURRENCY)))
    .groupBy(incomeRecords.category, sql`${incomeRecords.paymentMethod} = 'cash'`);
  const [spent] = await tx
    .select({ total: sum(expenseRecords.convertedAmount) })
    .from(expenseRecords)
    .where(and(expenses, eq(expenseRecords.isDeductible, true), eq(expenseRecords.baseCurrency, CURRENCY)));
  const [otherIncome] = await tx
    .select({ value: count() })
    .from(incomeRecords)
    .where(and(income, eq(incomeRecords.status, "received"), ne(incomeRecords.baseCurrency, CURRENCY)));
  const [otherExpenses] = await tx
    .select({ value: count() })
    .from(expenseRecords)
    .where(and(expenses, ne(expenseRecords.baseCurrency, CURRENCY)));

  const total = (list: typeof rows, key: "gross" | "charges" | "tds") => add(...list.map((row) => row[key] ?? "0"));
  const professional = rows.filter((row) => PROFESSIONAL.has(row.category));
  const interest = rows.filter((row) => row.category === "interest");
  const unplaced = rows.filter((row) => !PROFESSIONAL.has(row.category) && row.category !== "interest");

  return {
    receipts: total(professional, "gross"),
    cashReceipts: total(professional.filter((row) => row.cash), "gross"),
    expenses: add(spent?.total ?? "0", total(professional, "charges")),
    interest: total(interest, "gross"),
    taxDeducted: total([...professional, ...interest], "tds"),
    /** Royalty and other income, which the user has to place. */
    unplacedIncome: plain(total(unplaced, "gross")),
    otherCurrencyRecords: otherIncome!.value + otherExpenses!.value,
  };
}

export type Prefill = Awaited<ReturnType<typeof prefill>>;

export function estimate(rules: RuleSet, form: TaxFormInput): Outcome {
  return calculate(rules, toTaxInput(form));
}

/** Recalculates before saving, so a figure from the browser is never stored. */
export async function saveCalculation(
  tx: Tx,
  userId: string,
  rules: RuleSet,
  form: TaxFormInput,
): Promise<ActionResult<{ id: string }>> {
  const outcome = estimate(rules, form);
  if (!outcome.ok) return fail(outcome.error);
  const [row] = await tx
    .insert(taxCalculations)
    .values({
      userId,
      taxYearStart: rules.taxYearStart,
      ruleId: rules.id,
      ruleVersion: rules.version,
      input: toTaxInput(form),
      rules,
      results: outcome.results,
    })
    .returning({ id: taxCalculations.id });
  await tx.insert(auditLogs).values({
    userId,
    action: "tax_calculation.save",
    resourceType: "tax_calculation",
    resourceId: row!.id,
  });
  return ok({ id: row!.id });
}

export async function deleteCalculation(tx: Tx, userId: string, id: string): Promise<ActionResult> {
  const rows = await tx
    .delete(taxCalculations)
    .where(and(eq(taxCalculations.id, id), eq(taxCalculations.userId, userId)))
    .returning({ id: taxCalculations.id });
  if (rows.length === 0) return fail("This calculation no longer exists.");
  await tx.insert(auditLogs).values({
    userId,
    action: "tax_calculation.delete",
    resourceType: "tax_calculation",
    resourceId: id,
  });
  return done;
}
