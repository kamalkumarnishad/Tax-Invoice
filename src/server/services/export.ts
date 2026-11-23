import "server-only";
import { and, asc, between, eq } from "drizzle-orm";
import { auditLogs, clients, expenseRecords, incomeRecords } from "@/db/schema";
import { toCsv } from "@/lib/csv";
import { plain } from "@/lib/money";
import { expenseCategories } from "@/validations/expenses";
import { incomeCategories, incomeStatuses, paymentMethods } from "@/validations/income";
import type { DateRange } from "@/validations/reports";
import { type ActionResult, fail, ok, type Tx } from "./shared";

export const MAX_EXPORT_ROWS = 10_000;

const label = (labels: Record<string, string>, key: string) => labels[key] ?? key;

async function incomeCsv(tx: Tx, userId: string, { from, to }: DateRange) {
  const rows = await tx
    .select({ record: incomeRecords, client: clients.name })
    .from(incomeRecords)
    .leftJoin(clients, eq(clients.id, incomeRecords.clientId))
    .where(and(eq(incomeRecords.userId, userId), between(incomeRecords.paymentDate, from, to)))
    .orderBy(asc(incomeRecords.paymentDate), asc(incomeRecords.createdAt))
    .limit(MAX_EXPORT_ROWS + 1);
  const header = [
    "Date", "Description", "Client", "Category", "Status", "Payment method", "Amount", "Currency", "Exchange rate",
    "Amount in base currency", "Base currency", "Gateway fee (payment currency)", "Bank charges", "TDS", "Net received",
    "Notes",
  ];
  return {
    count: rows.length,
    csv: toCsv(
      header,
      rows.map(({ record: r, client }) => [
        r.paymentDate,
        r.description,
        client,
        label(incomeCategories, r.category),
        label(incomeStatuses, r.status),
        label(paymentMethods, r.paymentMethod),
        plain(r.amount),
        r.currency,
        plain(r.exchangeRate),
        plain(r.convertedAmount),
        r.baseCurrency,
        plain(r.gatewayFee),
        plain(r.bankCharges),
        plain(r.tdsDeducted),
        plain(r.netReceived),
        r.notes,
      ]),
    ),
  };
}

async function expensesCsv(tx: Tx, userId: string, { from, to }: DateRange) {
  const rows = await tx
    .select()
    .from(expenseRecords)
    .where(and(eq(expenseRecords.userId, userId), between(expenseRecords.expenseDate, from, to)))
    .orderBy(asc(expenseRecords.expenseDate), asc(expenseRecords.createdAt))
    .limit(MAX_EXPORT_ROWS + 1);
  const header = [
    "Date", "Description", "Vendor", "Category", "Business expense", "Payment method", "Amount", "Currency",
    "Exchange rate", "Amount in base currency", "Base currency", "Notes",
  ];
  return {
    count: rows.length,
    csv: toCsv(
      header,
      rows.map((r) => [
        r.expenseDate,
        r.description,
        r.vendor,
        label(expenseCategories, r.category),
        r.isDeductible ? "Yes" : "No",
        label(paymentMethods, r.paymentMethod),
        plain(r.amount),
        r.currency,
        plain(r.exchangeRate),
        plain(r.convertedAmount),
        r.baseCurrency,
        r.notes,
      ]),
    ),
  };
}

export type ExportKind = "income" | "expenses";

/** Every record in the range, whatever its currency or status. Call inside `withUser`. */
export async function exportRecords(
  tx: Tx,
  userId: string,
  kind: ExportKind,
  range: DateRange,
): Promise<ActionResult<string>> {
  const { csv, count } = await (kind === "income" ? incomeCsv : expensesCsv)(tx, userId, range);
  // A file that silently stopped short would be wrong, so none is given.
  if (count > MAX_EXPORT_ROWS) return fail(`More than ${MAX_EXPORT_ROWS} records. Choose a shorter range.`);
  await tx.insert(auditLogs).values({ userId, action: `${kind}.export`, details: { ...range, count } });
  return ok(csv);
}
