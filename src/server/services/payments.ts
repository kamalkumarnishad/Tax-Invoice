import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { auditLogs, currencies, incomeRecords, invoices } from "@/db/schema";
import { formatCurrency } from "@/lib/format";
import { incomePart } from "@/lib/invoice";
import { compare, subtract } from "@/lib/money";
import type { PaymentInput } from "@/validations/invoices";
import { createIncome } from "./income";
import { amountPaid } from "./invoices";
import { type ActionResult, done, fail, type Tx } from "./shared";

type Context = { userId: string; baseCurrency: string; today: string };

/** A payment is an income record that points at the invoice, so money is only ever recorded once. */
export async function recordPayment(
  tx: Tx,
  context: Context,
  invoiceId: string,
  input: PaymentInput,
): Promise<ActionResult> {
  const { userId } = context;
  // Locked, so two payments at once cannot both fit the same balance.
  const [invoice] = await tx
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.userId, userId)))
    .for("update");
  if (!invoice) return fail("This invoice no longer exists.");
  if (invoice.status !== "issued") return fail("Payments can only be recorded for an issued invoice.");

  const alreadySettled = await amountPaid(tx, userId, invoiceId);
  const balance = subtract(invoice.total, alreadySettled);
  if (compare(input.amount, balance) > 0) {
    return fail(`Only ${formatCurrency(balance, invoice.currency)} is still due.`);
  }
  const [recorded] = await tx
    .select({ income: sql<string>`coalesce(sum(${incomeRecords.amount}), 0)` })
    .from(incomeRecords)
    .where(and(eq(incomeRecords.userId, userId), eq(incomeRecords.invoiceId, invoiceId)));
  const [currency] = await tx
    .select({ decimals: currencies.decimalPlaces })
    .from(currencies)
    .where(eq(currencies.code, invoice.currency));

  const amount = incomePart({
    settled: input.amount,
    alreadySettled,
    alreadyIncome: recorded!.income,
    total: invoice.total,
    taxable: subtract(invoice.subtotal, invoice.discount),
    decimals: currency!.decimals,
  });
  if (compare(amount, "0") <= 0) return fail("This payment is too small to record.");

  const result = await createIncome(
    tx,
    context,
    {
      description: `Invoice ${invoice.invoiceNumber}`,
      clientId: invoice.clientId,
      amount,
      currency: invoice.currency,
      exchangeRate: input.exchangeRate,
      paymentDate: input.paymentDate,
      paymentMethod: input.paymentMethod,
      gatewayFee: input.gatewayFee,
      bankCharges: input.bankCharges,
      tdsDeducted: input.tdsDeducted,
      category: input.category,
      status: "received",
      notes: "",
    },
    { invoiceId, invoiceAmount: input.amount },
  );
  if (!result.ok) return result;
  await tx
    .insert(auditLogs)
    .values({ userId, action: "invoice.payment", resourceType: "invoice", resourceId: invoiceId });
  return done;
}
