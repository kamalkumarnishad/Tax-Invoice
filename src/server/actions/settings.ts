"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { savePreferences, saveTaxProfile } from "@/server/services/settings";
import { preferencesSchema, taxProfileSchema } from "@/validations/settings";

export type ActionResult = { ok: true } | { ok: false; error: string };

const invalid: ActionResult = { ok: false, error: "Some values are not valid. Check the form and try again." };

export async function saveTaxProfileAction(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = taxProfileSchema.safeParse(input);
  if (!parsed.success) return invalid;

  await withUser(user.id, (tx) => saveTaxProfile(tx, user.id, parsed.data));
  revalidatePath("/app", "layout");
  return { ok: true };
}

export async function savePreferencesAction(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = preferencesSchema.safeParse(input);
  if (!parsed.success) return invalid;

  const saved = await withUser(user.id, (tx) => savePreferences(tx, user.id, parsed.data));
  if (!saved) return invalid;
  revalidatePath("/app", "layout");
  return { ok: true };
}
