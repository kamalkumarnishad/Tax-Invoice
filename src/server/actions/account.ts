"use server";

import { headers } from "next/headers";
import { env } from "@/config/env";
import { getAuth, requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { requestDeletion } from "@/server/services/account/account";
import { type ActionResult, INVALID } from "@/server/services/shared";
import { deletionSchema } from "@/validations/account";

export async function requestDeletionAction(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = deletionSchema.safeParse(input);
  if (!parsed.success) return INVALID;

  const context = { db: await getDb(), auth: await getAuth(), headers: await headers(), now: new Date() };
  return requestDeletion(context, user, parsed.data.password, {
    baseURL: env.BETTER_AUTH_URL ?? "http://localhost:3000",
    sendEmail,
  });
}
