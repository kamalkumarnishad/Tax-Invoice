"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { createClient, deleteClient, setClientActive, updateClient } from "@/server/services/clients";
import { type ActionResult, INVALID } from "@/server/services/shared";
import { clientSchema } from "@/validations/clients";
import { uuid } from "@/validations/common";

export async function createClientAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const parsed = clientSchema.safeParse(input);
  if (!parsed.success) return INVALID;
  const result = await withUser(user.id, (tx) => createClient(tx, user.id, parsed.data));
  revalidatePath("/app", "layout");
  return result;
}

export async function updateClientAction(id: unknown, input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = z.tuple([uuid, clientSchema]).safeParse([id, input]);
  if (!parsed.success) return INVALID;
  const result = await withUser(user.id, (tx) => updateClient(tx, user.id, ...parsed.data));
  revalidatePath("/app", "layout");
  return result;
}

export async function setClientActiveAction(id: unknown, isActive: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = z.tuple([uuid, z.boolean()]).safeParse([id, isActive]);
  if (!parsed.success) return INVALID;
  const result = await withUser(user.id, (tx) => setClientActive(tx, user.id, ...parsed.data));
  revalidatePath("/app", "layout");
  return result;
}

export async function deleteClientAction(id: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = uuid.safeParse(id);
  if (!parsed.success) return INVALID;
  const result = await withUser(user.id, (tx) => deleteClient(tx, user.id, parsed.data));
  revalidatePath("/app", "layout");
  return result;
}
