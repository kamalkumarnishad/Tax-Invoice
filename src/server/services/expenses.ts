import "server-only";
import { and, eq } from "drizzle-orm";
import { auditLogs, expenseRecords } from "@/db/schema";
import { taxYearStartFor } from "@/lib/dates";
import { orNull } from "@/validations/common";
import type { ExpenseInput } from "@/validations/expenses";
import { convertToBase } from "./currency/convert";
import { type ActionResult, done, fail, ok, type Tx } from "./shared";

/** Every function here runs inside `withUser`; the owner check repeats what RLS enforces. */
const owned = (userId: string, id: string) => and(eq(expenseRecords.id, id), eq(expenseRecords.userId, userId));

const GONE = fail("This record no longer exists.");

const log = (tx: Tx, userId: string, action: string, resourceId: string) =>
  tx.insert(auditLogs).values({ userId, action, resourceType: "expense_record", resourceId });

async function toColumns(tx: Tx, input: ExpenseInput, baseCurrency: string, today: string) {
  if (input.expenseDate > today) return fail("An expense cannot have a future date.");
  const conversion = await convertToBase(tx, { ...input, baseCurrency });
  if (!conversion.ok) return conversion;

  return ok({
    description: input.description,
    vendor: orNull(input.vendor),
    amount: input.amount,
    currency: input.currency,
    exchangeRate: conversion.data.rate,
    convertedAmount: conversion.data.convertedAmount,
    baseCurrency,
    category: input.category,
    expenseDate: input.expenseDate,
    paymentMethod: input.paymentMethod,
    isDeductible: input.isDeductible,
    taxYearStart: taxYearStartFor(input.expenseDate),
    notes: orNull(input.notes),
  });
}

type Context = { userId: string; baseCurrency: string; today: string };

export async function createExpense(
  tx: Tx,
  { userId, baseCurrency, today }: Context,
  input: ExpenseInput,
): Promise<ActionResult<{ id: string }>> {
  const columns = await toColumns(tx, input, baseCurrency, today);
  if (!columns.ok) return columns;
  const [row] = await tx
    .insert(expenseRecords)
    .values({ userId, ...columns.data })
    .returning({ id: expenseRecords.id });
  await log(tx, userId, "expense.create", row!.id);
  return ok({ id: row!.id });
}

/** Keeps the base currency the record was made in, even if the user's default has changed. */
export async function updateExpense(
  tx: Tx,
  { userId, today }: Omit<Context, "baseCurrency">,
  id: string,
  input: ExpenseInput,
): Promise<ActionResult> {
  const [existing] = await tx
    .select({ baseCurrency: expenseRecords.baseCurrency })
    .from(expenseRecords)
    .where(owned(userId, id));
  if (!existing) return GONE;

  const columns = await toColumns(tx, input, existing.baseCurrency, today);
  if (!columns.ok) return columns;
  await tx.update(expenseRecords).set(columns.data).where(owned(userId, id));
  await log(tx, userId, "expense.update", id);
  return done;
}

export async function deleteExpense(tx: Tx, userId: string, id: string): Promise<ActionResult> {
  const rows = await tx.delete(expenseRecords).where(owned(userId, id)).returning({ id: expenseRecords.id });
  if (rows.length === 0) return GONE;
  await log(tx, userId, "expense.delete", id);
  return done;
}
