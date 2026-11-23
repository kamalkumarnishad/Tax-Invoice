import "server-only";
import { and, count, eq, ne, sql, sum } from "drizzle-orm";
import { expenseRecords, incomeRecords } from "@/db/schema";
import { monthsOfTaxYear } from "@/lib/dates";
import { add, subtract } from "@/lib/money";
import type { Tx } from "./shared";

type Options = { userId: string; currency: string; year: string };

/** Figures for one tax year in one currency. Postgres does the sums, exactly. */
export async function summarise(tx: Tx, { userId, currency, year }: Options) {
  const income = and(eq(incomeRecords.userId, userId), eq(incomeRecords.taxYearStart, year));
  const expenses = and(eq(expenseRecords.userId, userId), eq(expenseRecords.taxYearStart, year));
  const incomeMonth = sql<string>`to_char(${incomeRecords.paymentDate}, 'YYYY-MM')`;
  const expenseMonth = sql<string>`to_char(${expenseRecords.expenseDate}, 'YYYY-MM')`;

  const incomeRows = await tx
    .select({ month: incomeMonth, status: incomeRecords.status, total: sum(incomeRecords.convertedAmount) })
    .from(incomeRecords)
    .where(and(income, eq(incomeRecords.baseCurrency, currency)))
    .groupBy(incomeMonth, incomeRecords.status);
  const expenseRows = await tx
    .select({ month: expenseMonth, total: sum(expenseRecords.convertedAmount) })
    .from(expenseRecords)
    .where(and(expenses, eq(expenseRecords.baseCurrency, currency)))
    .groupBy(expenseMonth);
  const [otherIncome] = await tx
    .select({ value: count() })
    .from(incomeRecords)
    .where(and(income, ne(incomeRecords.baseCurrency, currency)));
  const [otherExpenses] = await tx
    .select({ value: count() })
    .from(expenseRecords)
    .where(and(expenses, ne(expenseRecords.baseCurrency, currency)));

  const total = (rows: { total: string | null }[]) => add(...rows.map((row) => row.total ?? "0"));
  const received = incomeRows.filter((row) => row.status === "received");
  const incomeTotal = total(received);
  const expenseTotal = total(expenseRows);

  return {
    income: incomeTotal,
    pending: total(incomeRows.filter((row) => row.status === "pending")),
    expenses: expenseTotal,
    profit: subtract(incomeTotal, expenseTotal),
    /** Records made while another currency was the default, left out of the figures above. */
    otherCurrencyRecords: otherIncome!.value + otherExpenses!.value,
    months: monthsOfTaxYear(year).map((month) => ({
      month,
      income: total(received.filter((row) => row.month === month)),
      expenses: total(expenseRows.filter((row) => row.month === month)),
    })),
  };
}
