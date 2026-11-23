"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { getUserDefaults } from "@/server/queries/settings";
import { createIncome, deleteIncome, updateIncome } from "@/server/services/income";
import { type ActionResult, INVALID } from "@/server/services/shared";
import { uuid } from "@/validations/common";
import { incomeSchema } from "@/validations/income";

export async function createIncomeAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const parsed = incomeSchema.safeParse(input);
  if (!parsed.success) return INVALID;
  const { currency, today } = await getUserDefaults(user.id);
  const context = { userId: user.id, baseCurrency: currency, today };
  const result = await withUser(user.id, (tx) => createIncome(tx, context, parsed.data));
  revalidatePath("/app", "layout");
  return result;
}

export async function updateIncomeAction(id: unknown, input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = z.tuple([uuid, incomeSchema]).safeParse([id, input]);
  if (!parsed.success) return INVALID;
  const { today } = await getUserDefaults(user.id);
  const result = await withUser(user.id, (tx) => updateIncome(tx, { userId: user.id, today }, ...parsed.data));
  revalidatePath("/app", "layout");
  return result;
}

export async function deleteIncomeAction(id: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = uuid.safeParse(id);
  if (!parsed.success) return INVALID;
  const result = await withUser(user.id, (tx) => deleteIncome(tx, user.id, parsed.data));
  revalidatePath("/app", "layout");
  return result;
}
