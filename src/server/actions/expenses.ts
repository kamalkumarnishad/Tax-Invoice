"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { getUserDefaults } from "@/server/queries/settings";
import { createExpense, deleteExpense, updateExpense } from "@/server/services/expenses";
import { type ActionResult, INVALID } from "@/server/services/shared";
import { uuid } from "@/validations/common";
import { expenseSchema } from "@/validations/expenses";

export async function createExpenseAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const parsed = expenseSchema.safeParse(input);
  if (!parsed.success) return INVALID;
  const { currency, today } = await getUserDefaults(user.id);
  const context = { userId: user.id, baseCurrency: currency, today };
  const result = await withUser(user.id, (tx) => createExpense(tx, context, parsed.data));
  revalidatePath("/app", "layout");
  return result;
}

export async function updateExpenseAction(id: unknown, input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = z.tuple([uuid, expenseSchema]).safeParse([id, input]);
  if (!parsed.success) return INVALID;
  const { today } = await getUserDefaults(user.id);
  const result = await withUser(user.id, (tx) => updateExpense(tx, { userId: user.id, today }, ...parsed.data));
  revalidatePath("/app", "layout");
  return result;
}

export async function deleteExpenseAction(id: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = uuid.safeParse(id);
  if (!parsed.success) return INVALID;
  const result = await withUser(user.id, (tx) => deleteExpense(tx, user.id, parsed.data));
  revalidatePath("/app", "layout");
  return result;
}
