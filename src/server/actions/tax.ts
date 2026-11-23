"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { type ActionResult, fail, INVALID, ok } from "@/server/services/shared";
import { deleteCalculation, estimate, saveCalculation } from "@/server/services/tax";
import { calculatorAvailable, currentRules } from "@/server/services/tax-engine/rules";
import type { Regime, TaxResult } from "@/server/services/tax-engine/types";
import { uuid } from "@/validations/common";
import { taxFormSchema } from "@/validations/tax";

const UNAVAILABLE = fail("The tax rules are being reviewed. The calculator will open once that is done.");

export async function calculateTaxAction(input: unknown): Promise<ActionResult<Record<Regime, TaxResult>>> {
  await requireUser();
  if (!calculatorAvailable()) return UNAVAILABLE;
  const parsed = taxFormSchema.safeParse(input);
  if (!parsed.success) return INVALID;
  const outcome = estimate(currentRules, parsed.data);
  return outcome.ok ? ok(outcome.results) : fail(outcome.error);
}

export async function saveCalculationAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  if (!calculatorAvailable()) return UNAVAILABLE;
  const parsed = taxFormSchema.safeParse(input);
  if (!parsed.success) return INVALID;
  const result = await withUser(user.id, (tx) => saveCalculation(tx, user.id, currentRules, parsed.data));
  revalidatePath("/app/tax-calculator");
  return result;
}

export async function deleteCalculationAction(id: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = uuid.safeParse(id);
  if (!parsed.success) return INVALID;
  const result = await withUser(user.id, (tx) => deleteCalculation(tx, user.id, parsed.data));
  revalidatePath("/app/tax-calculator");
  return result;
}
