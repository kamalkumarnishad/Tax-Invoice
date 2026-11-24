import "server-only";
import { and, asc, between, count, eq, isNull, ne, sql, sum } from "drizzle-orm";
import { businessProfiles, clients, incomeRecords, invoices, taxProfiles } from "@/db/schema";
import { taxYearEnd } from "@/lib/dates";
import type { TaxMode } from "@/lib/invoice";
import { add, compare, plain } from "@/lib/money";
import type { Tx } from "../shared";
import { reviewed } from "../tax-engine/rules";
import { gstChecks } from "./checks";
import { gstRules, registrationLimit } from "./rules";

const RUPEES = "INR";

type Options = { userId: string; today: string };

/**
 * Turnover as GST counts it: the value of supplies before tax, exports included.
 * An invoice counts by its own date. Income without an invoice counts when
 * received. Interest is left out.
 */
async function turnoverParts(tx: Tx, userId: string, from: string, to: string) {
  const taxable = sql`${invoices.subtotal} - ${invoices.discount}`;
  const invoiced = and(
    eq(invoices.userId, userId),
    eq(invoices.status, "issued"),
    between(invoices.invoiceDate, from, to),
  );

  const [inRupees] = await tx
    .select({ total: sum(taxable) })
    .from(invoices)
    .where(and(invoiced, eq(invoices.currency, RUPEES)));
  // A foreign invoice has a rupee value only once it is paid.
  const [foreignPaid] = await tx
    .select({ total: sum(incomeRecords.convertedAmount) })
    .from(incomeRecords)
    .innerJoin(invoices, eq(invoices.id, incomeRecords.invoiceId))
    .where(
      and(
        invoiced,
        ne(invoices.currency, RUPEES),
        eq(incomeRecords.userId, userId),
        eq(incomeRecords.status, "received"),
        eq(incomeRecords.baseCurrency, RUPEES),
      ),
    );
  const foreignUnpaid = await tx
    .select({
      currency: invoices.currency,
      total: sum(sql`${taxable} - coalesce((
        select sum(${incomeRecords.amount}) from ${incomeRecords}
        where ${incomeRecords.invoiceId} = ${invoices.id} and ${incomeRecords.status} = 'received'
      ), 0)`),
    })
    .from(invoices)
    .where(and(invoiced, ne(invoices.currency, RUPEES)))
    .groupBy(invoices.currency)
    .orderBy(invoices.currency);

  const uninvoiced = and(
    eq(incomeRecords.userId, userId),
    isNull(incomeRecords.invoiceId),
    eq(incomeRecords.status, "received"),
    between(incomeRecords.paymentDate, from, to),
  );
  const [direct] = await tx
    .select({ total: sum(incomeRecords.convertedAmount) })
    .from(incomeRecords)
    .where(and(uninvoiced, eq(incomeRecords.baseCurrency, RUPEES), ne(incomeRecords.category, "interest")));
  const [interest] = await tx
    .select({ total: sum(incomeRecords.convertedAmount) })
    .from(incomeRecords)
    .where(and(uninvoiced, eq(incomeRecords.baseCurrency, RUPEES), eq(incomeRecords.category, "interest")));
  const [otherCurrency] = await tx
    .select({ value: count() })
    .from(incomeRecords)
    .where(
      and(
        eq(incomeRecords.userId, userId),
        eq(incomeRecords.status, "received"),
        ne(incomeRecords.baseCurrency, RUPEES),
        between(incomeRecords.paymentDate, from, to),
      ),
    );

  const value = (total: string | null | undefined) => plain(total ?? "0");
  const invoicedTotal = add(value(inRupees?.total), value(foreignPaid?.total));
  return {
    invoiced: invoicedTotal,
    direct: value(direct?.total),
    total: add(invoicedTotal, value(direct?.total)),
    interest: value(interest?.total),
    foreignUnpaid: foreignUnpaid
      .map((row) => ({ currency: row.currency, total: value(row.total) }))
      .filter((row) => compare(row.total, "0") > 0),
    otherCurrencyRecords: otherCurrency!.value,
  };
}

export async function gstSummary(tx: Tx, { userId, today }: Options) {
  const from = gstRules.taxYearStart;
  const to = taxYearEnd(from);
  const turnover = await turnoverParts(tx, userId, from, to);

  const month = sql<string>`to_char(${invoices.invoiceDate}, 'YYYY-MM')`;
  const sales = await tx
    .select({
      month,
      taxMode: invoices.taxMode,
      currency: invoices.currency,
      invoices: count(),
      taxable: sum(sql`${invoices.subtotal} - ${invoices.discount}`),
      tax: sum(invoices.taxAmount),
    })
    .from(invoices)
    .where(
      and(eq(invoices.userId, userId), eq(invoices.status, "issued"), between(invoices.invoiceDate, from, to)),
    )
    .groupBy(month, invoices.taxMode, invoices.currency)
    .orderBy(asc(month), asc(invoices.taxMode), asc(invoices.currency));

  const [profile] = await tx
    .select()
    .from(taxProfiles)
    .where(and(eq(taxProfiles.userId, userId), eq(taxProfiles.taxYearStart, from)));
  const [business] = await tx
    .select({ state: businessProfiles.state })
    .from(businessProfiles)
    .where(eq(businessProfiles.userId, userId));
  const state = business?.state ?? null;
  // Exports can stay unpaid across years, so those are checked whatever their date.
  const invoiceRows = await tx
    .select({
      invoice: invoices,
      clientCountry: clients.country,
      paid: sql<string>`coalesce((
        select sum(${incomeRecords.invoiceAmount}) from ${incomeRecords}
        where ${incomeRecords.invoiceId} = ${invoices.id} and ${incomeRecords.status} = 'received'
      ), 0)`,
    })
    .from(invoices)
    .innerJoin(clients, eq(clients.id, invoices.clientId))
    .where(
      and(
        eq(invoices.userId, userId),
        ne(invoices.status, "cancelled"),
        sql`(${invoices.invoiceDate} between ${from} and ${to} or ${invoices.taxMode} = 'export_lut')`,
      ),
    )
    .orderBy(asc(invoices.invoiceDate), asc(invoices.invoiceNumber));

  const isReviewed = reviewed(gstRules.status);
  return {
    turnover,
    state,
    gstin: profile?.gstin ?? null,
    lut: profile?.hasLut ? { arn: profile.lutArn, from: profile.lutValidFrom, to: profile.lutValidTo } : null,
    limit: isReviewed ? registrationLimit(state) : null,
    sales: sales.map((row) => ({
      ...row,
      taxMode: row.taxMode as TaxMode,
      taxable: plain(row.taxable ?? "0"),
      tax: plain(row.tax ?? "0"),
    })),
    checks: isReviewed
      ? gstChecks({
          today,
          turnover: turnover.total,
          state,
          gstin: profile?.gstin ?? null,
          gstFiling: profile?.gstFiling ?? null,
          hasLut: profile?.hasLut ?? false,
          lutValidTo: profile?.lutValidTo ?? null,
          invoices: invoiceRows.map(({ invoice, clientCountry, paid }) => ({
            id: invoice.id,
            number: invoice.invoiceNumber,
            status: invoice.status,
            invoiceDate: invoice.invoiceDate,
            taxMode: invoice.taxMode as TaxMode,
            sacCode: invoice.sacCode,
            placeOfSupply: invoice.placeOfSupply,
            country: invoice.buyer ? invoice.buyer.country : clientCountry,
            fullyPaid: compare(paid, invoice.total) >= 0,
          })),
        })
      : [],
    reviewed: isReviewed,
  };
}
