import "server-only";
import { and, eq, sql } from "drizzle-orm";
import {
  auditLogs,
  businessProfiles,
  clients,
  currencies,
  incomeRecords,
  invoiceItems,
  invoices,
  taxProfiles,
} from "@/db/schema";
import { taxYearStartFor } from "@/lib/dates";
import { type Buyer, chargesGst, invoiceTotals, type Seller, type TaxMode } from "@/lib/invoice";
import { compare, isNegative } from "@/lib/money";
import { orNull } from "@/validations/common";
import type { BusinessInput, InvoiceInput } from "@/validations/invoices";
import { type ActionResult, done, fail, isForeignKeyViolation, isUniqueViolation, ok, type Tx } from "./shared";

/** Every function here runs inside `withUser`; the owner check repeats what RLS enforces. */
const owned = (userId: string, id: string) => and(eq(invoices.id, id), eq(invoices.userId, userId));

const GONE = fail("This invoice no longer exists.");
const NOT_DRAFT = fail("This invoice has been issued, so it cannot be changed. Cancel it and make a new one.");
const MAX_TOTAL = "999999999999999";

const log = (tx: Tx, userId: string, action: string, resourceId: string) =>
  tx.insert(auditLogs).values({ userId, action, resourceType: "invoice", resourceId });

/** Locked until the transaction ends, so two requests cannot act on the same state. */
async function lockInvoice(tx: Tx, userId: string, id: string) {
  const [row] = await tx.select().from(invoices).where(owned(userId, id)).for("update");
  return row ?? null;
}

/** Settled so far, in the invoice's currency. */
export async function amountPaid(tx: Tx, userId: string, invoiceId: string): Promise<string> {
  const [row] = await tx
    .select({ paid: sql<string>`coalesce(sum(${incomeRecords.invoiceAmount}), 0)` })
    .from(incomeRecords)
    .where(
      and(
        eq(incomeRecords.userId, userId),
        eq(incomeRecords.invoiceId, invoiceId),
        eq(incomeRecords.status, "received"),
      ),
    );
  return row!.paid;
}

async function toColumns(tx: Tx, input: InvoiceInput) {
  const [currency] = await tx
    .select({ decimals: currencies.decimalPlaces })
    .from(currencies)
    .where(and(eq(currencies.code, input.currency), eq(currencies.isActive, true)));
  if (!currency) return fail("Choose a currency from the list.");

  const taxRate = chargesGst(input.taxMode) ? input.taxRate : "0";
  const totals = invoiceTotals({ ...input, taxRate, decimals: currency.decimals });
  if (isNegative(totals.taxable)) return fail("The discount is more than the items come to.");
  if (compare(totals.total, "0") <= 0) return fail("The invoice comes to nothing.");
  if (compare(totals.total, MAX_TOTAL) > 0) return fail("The total is too large.");

  return ok({
    invoice: {
      clientId: input.clientId,
      invoiceNumber: input.invoiceNumber,
      invoiceDate: input.invoiceDate,
      dueDate: input.dueDate,
      currency: input.currency,
      taxMode: input.taxMode,
      taxRate,
      sacCode: orNull(input.sacCode),
      placeOfSupply: orNull(input.placeOfSupply),
      subtotal: totals.subtotal,
      discount: totals.discount,
      taxAmount: totals.taxAmount,
      total: totals.total,
      notes: orNull(input.notes),
    },
    items: input.items.map((item, index) => ({ ...item, amount: totals.amounts[index]!, sortOrder: index })),
  });
}

/** Turns the two database refusals a user can cause into messages. */
async function write<T>(tx: Tx, work: (inner: Tx) => Promise<T>): Promise<ActionResult<T>> {
  try {
    return ok(await tx.transaction(work));
  } catch (error) {
    if (isUniqueViolation(error)) return fail("You have already used this invoice number.");
    if (isForeignKeyViolation(error)) return fail("Choose a client from the list.");
    throw error;
  }
}

export async function createInvoice(tx: Tx, userId: string, input: InvoiceInput): Promise<ActionResult<{ id: string }>> {
  const columns = await toColumns(tx, input);
  if (!columns.ok) return columns;
  const written = await write(tx, async (inner) => {
    const [row] = await inner
      .insert(invoices)
      .values({ userId, ...columns.data.invoice })
      .returning({ id: invoices.id });
    const invoiceId = row!.id;
    await inner.insert(invoiceItems).values(columns.data.items.map((item) => ({ ...item, userId, invoiceId })));
    return invoiceId;
  });
  if (!written.ok) return written;
  await log(tx, userId, "invoice.create", written.data);
  return ok({ id: written.data });
}

export async function updateInvoice(tx: Tx, userId: string, id: string, input: InvoiceInput): Promise<ActionResult> {
  const invoice = await lockInvoice(tx, userId, id);
  if (!invoice) return GONE;
  if (invoice.status !== "draft") return NOT_DRAFT;
  const columns = await toColumns(tx, input);
  if (!columns.ok) return columns;
  const written = await write(tx, async (inner) => {
    await inner.update(invoices).set(columns.data.invoice).where(owned(userId, id));
    await inner.delete(invoiceItems).where(and(eq(invoiceItems.invoiceId, id), eq(invoiceItems.userId, userId)));
    await inner.insert(invoiceItems).values(columns.data.items.map((item) => ({ ...item, userId, invoiceId: id })));
  });
  if (!written.ok) return written;
  await log(tx, userId, "invoice.update", id);
  return done;
}

export async function deleteInvoice(tx: Tx, userId: string, id: string): Promise<ActionResult> {
  const invoice = await lockInvoice(tx, userId, id);
  if (!invoice) return GONE;
  // Numbers already sent to a client must stay accounted for.
  if (invoice.status !== "draft") return fail("Only a draft can be deleted. Cancel this invoice instead.");
  await tx.delete(invoices).where(owned(userId, id));
  await log(tx, userId, "invoice.delete", id);
  return done;
}

/** The parties as they are now, for a draft's preview and to copy when issuing. */
export async function currentParties(tx: Tx, userId: string, clientId: string, invoiceDate: string) {
  const [business] = await tx.select().from(businessProfiles).where(eq(businessProfiles.userId, userId));
  const [client] = await tx
    .select()
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.userId, userId)));
  const [tax] = await tx
    .select()
    .from(taxProfiles)
    .where(and(eq(taxProfiles.userId, userId), eq(taxProfiles.taxYearStart, taxYearStartFor(invoiceDate))));

  const lutCovers =
    tax?.hasLut &&
    (!tax.lutValidFrom || tax.lutValidFrom <= invoiceDate) &&
    (!tax.lutValidTo || tax.lutValidTo >= invoiceDate);
  const seller: Seller | null = business
    ? {
        name: business.businessName,
        address: business.address,
        email: business.email,
        phone: business.phone,
        gstin: tax?.gstin ?? null,
        lutArn: lutCovers ? tax.lutArn : null,
        paymentInstructions: business.paymentInstructions,
      }
    : null;
  const buyer: Buyer | null = client
    ? {
        name: client.name,
        company: client.company,
        address: client.billingAddress,
        country: client.country,
        email: client.email,
        taxId: client.taxId,
      }
    : null;
  return { seller, buyer };
}

export async function issueInvoice(tx: Tx, userId: string, id: string): Promise<ActionResult> {
  const invoice = await lockInvoice(tx, userId, id);
  if (!invoice) return GONE;
  if (invoice.status !== "draft") return fail("This invoice has already been issued.");

  const { seller, buyer } = await currentParties(tx, userId, invoice.clientId, invoice.invoiceDate);
  if (!seller) return fail("Add your business details in Settings first.");
  if (!buyer) return fail("Choose a client from the list.");
  const mode = invoice.taxMode as TaxMode;
  if (chargesGst(mode) && !seller.gstin) {
    return fail("Add your GSTIN to this year's tax profile before charging GST.");
  }
  if (mode === "export_lut" && (!seller.gstin || !seller.lutArn)) {
    return fail("An export under LUT needs your GSTIN and an LUT that covers the invoice date. Add them to the tax profile.");
  }

  await tx
    .update(invoices)
    .set({ status: "issued", issuedAt: new Date(), seller, buyer })
    .where(owned(userId, id));
  await log(tx, userId, "invoice.issue", id);
  return done;
}

export async function cancelInvoice(tx: Tx, userId: string, id: string): Promise<ActionResult> {
  const invoice = await lockInvoice(tx, userId, id);
  if (!invoice) return GONE;
  if (invoice.status !== "issued") return fail("Only an issued invoice can be cancelled.");
  const [payment] = await tx
    .select({ id: incomeRecords.id })
    .from(incomeRecords)
    .where(and(eq(incomeRecords.userId, userId), eq(incomeRecords.invoiceId, id)))
    .limit(1);
  if (payment) return fail("This invoice has payments. Delete them before cancelling it.");
  await tx.update(invoices).set({ status: "cancelled" }).where(owned(userId, id));
  await log(tx, userId, "invoice.cancel", id);
  return done;
}

export async function saveBusiness(tx: Tx, userId: string, input: BusinessInput): Promise<ActionResult> {
  const values = {
    businessName: input.businessName,
    address: input.address,
    email: orNull(input.email),
    phone: orNull(input.phone),
    paymentInstructions: orNull(input.paymentInstructions),
  };
  await tx
    .insert(businessProfiles)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: businessProfiles.userId, set: { ...values, updatedAt: new Date() } });
  await tx.insert(auditLogs).values({ userId, action: "business_profile.save", resourceType: "business_profile" });
  return done;
}
