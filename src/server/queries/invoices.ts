import "server-only";
import { and, asc, desc, eq, ilike, or, type SQL, sql, sum } from "drizzle-orm";
import { businessProfiles, clients, incomeRecords, invoiceItems, invoices } from "@/db/schema";
import { taxYearStartFor } from "@/lib/dates";
import { withUser } from "@/lib/db";
import { invoiceState, nextInvoiceNumber } from "@/lib/invoice";
import { amountPaid, currentParties } from "@/server/services/invoices";
import { containsPattern, PAGE_SIZE } from "@/validations/common";
import type { InvoiceFilter } from "@/validations/invoices";

const paid = sql<string>`coalesce((
  select sum(${incomeRecords.invoiceAmount}) from ${incomeRecords}
  where ${incomeRecords.invoiceId} = ${invoices.id} and ${incomeRecords.status} = 'received'
), 0)`;

function matches(filter: InvoiceFilter, today: string): SQL | undefined {
  const issued = eq(invoices.status, "issued");
  switch (filter) {
    case "draft":
    case "cancelled":
      return eq(invoices.status, filter);
    case "unpaid":
      return and(issued, sql`${paid} < ${invoices.total}`);
    case "overdue":
      return and(issued, sql`${paid} < ${invoices.total}`, sql`${invoices.dueDate} < ${today}`);
    case "paid":
      return and(issued, sql`${paid} >= ${invoices.total}`);
    default:
      return undefined;
  }
}

type ListOptions = { q: string; page: number; filter: InvoiceFilter; today: string };

export function listInvoices(userId: string, { q, page, filter, today }: ListOptions) {
  const pattern = containsPattern(q);
  const where = and(
    eq(invoices.userId, userId),
    matches(filter, today),
    q ? or(ilike(invoices.invoiceNumber, pattern), ilike(clients.name, pattern)) : undefined,
  );

  return withUser(userId, async (tx) => {
    const [total] = await tx
      .select({ value: sql<number>`count(*)::int` })
      .from(invoices)
      .leftJoin(clients, eq(clients.id, invoices.clientId))
      .where(where);
    // Each currency on its own: they cannot be added together.
    const outstanding = await tx
      .select({ currency: invoices.currency, total: sum(sql`${invoices.total} - ${paid}`) })
      .from(invoices)
      .leftJoin(clients, eq(clients.id, invoices.clientId))
      .where(and(where, matches("unpaid", today)))
      .groupBy(invoices.currency)
      .orderBy(invoices.currency);
    const rows = await tx
      .select({ invoice: invoices, clientName: clients.name, paid })
      .from(invoices)
      .leftJoin(clients, eq(clients.id, invoices.clientId))
      .where(where)
      .orderBy(desc(invoices.invoiceDate), desc(invoices.createdAt), desc(invoices.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE);
    return {
      total: total!.value,
      outstanding,
      rows: rows.map((row) => ({
        ...row,
        state: invoiceState({ ...row.invoice, paid: row.paid, today }),
      })),
    };
  });
}

/** The invoice with its items and payments, and the parties as issued, or as they are now for a draft. */
export function getInvoice(userId: string, id: string, today: string) {
  return withUser(userId, async (tx) => {
    const [invoice] = await tx
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, id), eq(invoices.userId, userId)));
    if (!invoice) return null;
    const items = await tx
      .select()
      .from(invoiceItems)
      .where(and(eq(invoiceItems.invoiceId, id), eq(invoiceItems.userId, userId)))
      .orderBy(asc(invoiceItems.sortOrder));
    const payments = await tx
      .select()
      .from(incomeRecords)
      .where(and(eq(incomeRecords.invoiceId, id), eq(incomeRecords.userId, userId)))
      .orderBy(asc(incomeRecords.paymentDate), asc(incomeRecords.createdAt));
    const settled = await amountPaid(tx, userId, id);
    const now = await currentParties(tx, userId, invoice.clientId, invoice.invoiceDate);
    return {
      invoice,
      items,
      payments,
      paid: settled,
      seller: invoice.seller ?? now.seller,
      buyer: invoice.buyer ?? now.buyer,
      state: invoiceState({ ...invoice, paid: settled, today }),
    };
  });
}

export type InvoiceDetail = NonNullable<Awaited<ReturnType<typeof getInvoice>>>;

export function suggestInvoiceNumber(userId: string, date: string) {
  return withUser(userId, async (tx) => {
    const rows = await tx
      .select({ number: invoices.invoiceNumber })
      .from(invoices)
      .where(eq(invoices.userId, userId));
    return nextInvoiceNumber(
      taxYearStartFor(date),
      rows.map((row) => row.number),
    );
  });
}

export function getBusiness(userId: string) {
  return withUser(userId, async (tx) => {
    const [row] = await tx.select().from(businessProfiles).where(eq(businessProfiles.userId, userId));
    return row ?? null;
  });
}
