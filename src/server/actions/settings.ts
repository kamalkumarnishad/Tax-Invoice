"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { savePreferences, saveTaxProfile } from "@/server/services/settings";
import { type ActionResult, done, INVALID } from "@/server/services/shared";
import { preferencesSchema, taxProfileSchema } from "@/validations/settings";

export async function saveTaxProfileAction(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = taxProfileSchema.safeParse(input);
  if (!parsed.success) return INVALID;

  await withUser(user.id, (tx) => saveTaxProfile(tx, user.id, parsed.data));
  revalidatePath("/app", "layout");
  return done;
}

export async function savePreferencesAction(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = preferencesSchema.safeParse(input);
  if (!parsed.success) return INVALID;

  const saved = await withUser(user.id, (tx) => savePreferences(tx, user.id, parsed.data));
  if (!saved) return INVALID;
  revalidatePath("/app", "layout");
  return done;
}
