"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { getUserDefaults } from "@/server/queries/settings";
import {
  cancelInvoice,
  createInvoice,
  deleteInvoice,
  issueInvoice,
  saveBusiness,
  updateInvoice,
} from "@/server/services/invoices";
import { recordPayment } from "@/server/services/payments";
import { type ActionResult, INVALID, type Tx } from "@/server/services/shared";
import { uuid } from "@/validations/common";
import { businessSchema, invoiceSchema, paymentSchema } from "@/validations/invoices";

export async function createInvoiceAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const parsed = invoiceSchema.safeParse(input);
  if (!parsed.success) return INVALID;
  const result = await withUser(user.id, (tx) => createInvoice(tx, user.id, parsed.data));
  revalidatePath("/app", "layout");
  return result;
}

export async function updateInvoiceAction(id: unknown, input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = z.tuple([uuid, invoiceSchema]).safeParse([id, input]);
  if (!parsed.success) return INVALID;
  const result = await withUser(user.id, (tx) => updateInvoice(tx, user.id, ...parsed.data));
  revalidatePath("/app", "layout");
  return result;
}

async function onInvoice(id: unknown, work: (tx: Tx, userId: string, id: string) => Promise<ActionResult>) {
  const user = await requireUser();
  const parsed = uuid.safeParse(id);
  if (!parsed.success) return INVALID;
  const result = await withUser(user.id, (tx) => work(tx, user.id, parsed.data));
  revalidatePath("/app", "layout");
  return result;
}

export async function issueInvoiceAction(id: unknown): Promise<ActionResult> {
  return onInvoice(id, issueInvoice);
}

export async function cancelInvoiceAction(id: unknown): Promise<ActionResult> {
  return onInvoice(id, cancelInvoice);
}

export async function deleteInvoiceAction(id: unknown): Promise<ActionResult> {
  return onInvoice(id, deleteInvoice);
}

export async function recordPaymentAction(id: unknown, input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = z.tuple([uuid, paymentSchema]).safeParse([id, input]);
  if (!parsed.success) return INVALID;
  const { currency, today } = await getUserDefaults(user.id);
  const context = { userId: user.id, baseCurrency: currency, today };
  const result = await withUser(user.id, (tx) => recordPayment(tx, context, ...parsed.data));
  revalidatePath("/app", "layout");
  return result;
}

export async function saveBusinessAction(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = businessSchema.safeParse(input);
  if (!parsed.success) return INVALID;
  const result = await withUser(user.id, (tx) => saveBusiness(tx, user.id, parsed.data));
  revalidatePath("/app", "layout");
  return result;
}
