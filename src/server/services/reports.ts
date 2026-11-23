import "server-only";
import { and, between, count, eq, ne, sql, sum } from "drizzle-orm";
import { clients, expenseRecords, incomeRecords } from "@/db/schema";
import { monthsBetween } from "@/lib/dates";
import { add, compare, subtract } from "@/lib/money";
import type { DateRange } from "@/validations/reports";
import type { Tx } from "./shared";

type Options = DateRange & { userId: string; currency: string };

export type Breakdown = { key: string | null; name: string | null; total: string; records: number };

const byTotal = (a: Breakdown, b: Breakdown) => compare(b.total, a.total);

/** One currency only: amounts in different base currencies cannot be added. Postgres does the sums, exactly. */
export async function buildReport(tx: Tx, { userId, currency, from, to }: Options) {
  const incomeInRange = and(eq(incomeRecords.userId, userId), between(incomeRecords.paymentDate, from, to));
  const expensesInRange = and(eq(expenseRecords.userId, userId), between(expenseRecords.expenseDate, from, to));
  const income = and(incomeInRange, eq(incomeRecords.baseCurrency, currency));
  const received = and(income, eq(incomeRecords.status, "received"));
  const expenses = and(expensesInRange, eq(expenseRecords.baseCurrency, currency));
  const incomeMonth = sql<string>`to_char(${incomeRecords.paymentDate}, 'YYYY-MM')`;
  const expenseMonth = sql<string>`to_char(${expenseRecords.expenseDate}, 'YYYY-MM')`;

  const byMonthIncome = await tx
    .select({
      month: incomeMonth,
      gross: sum(incomeRecords.convertedAmount),
      net: sum(incomeRecords.netReceived),
      tds: sum(incomeRecords.tdsDeducted),
    })
    .from(incomeRecords)
    .where(received)
    .groupBy(incomeMonth);
  const byMonthExpenses = await tx
    .select({ month: expenseMonth, business: expenseRecords.isDeductible, total: sum(expenseRecords.convertedAmount) })
    .from(expenseRecords)
    .where(expenses)
    .groupBy(expenseMonth, expenseRecords.isDeductible);
  const byClient = await tx
    .select({
      key: incomeRecords.clientId,
      name: clients.name,
      total: sum(incomeRecords.convertedAmount),
      records: count(),
    })
    .from(incomeRecords)
    .leftJoin(clients, eq(clients.id, incomeRecords.clientId))
    .where(received)
    .groupBy(incomeRecords.clientId, clients.name);
  const byIncomeCategory = await tx
    .select({ key: incomeRecords.category, total: sum(incomeRecords.convertedAmount), records: count() })
    .from(incomeRecords)
    .where(received)
    .groupBy(incomeRecords.category);
  const byExpenseCategory = await tx
    .select({ key: expenseRecords.category, total: sum(expenseRecords.convertedAmount), records: count() })
    .from(expenseRecords)
    .where(expenses)
    .groupBy(expenseRecords.category);
  const [pending] = await tx
    .select({ total: sum(incomeRecords.convertedAmount), records: count() })
    .from(incomeRecords)
    .where(and(income, eq(incomeRecords.status, "pending")));
  const [otherIncome] = await tx
    .select({ value: count() })
    .from(incomeRecords)
    .where(and(incomeInRange, ne(incomeRecords.baseCurrency, currency)));
  const [otherExpenses] = await tx
    .select({ value: count() })
    .from(expenseRecords)
    .where(and(expensesInRange, ne(expenseRecords.baseCurrency, currency)));

  const total = (values: (string | null)[]) => add(...values.map((value) => value ?? "0"));
  const gross = total(byMonthIncome.map((row) => row.gross));
  const net = total(byMonthIncome.map((row) => row.net));
  const tds = total(byMonthIncome.map((row) => row.tds));
  // Whatever lies between gross and net, apart from TDS, was a fee or charge.
  const fees = subtract(gross, net, tds);
  const business = total(byMonthExpenses.filter((row) => row.business).map((row) => row.total));
  const otherSpending = total(byMonthExpenses.filter((row) => !row.business).map((row) => row.total));
  const tidy = (rows: { key: string | null; name?: string | null; total: string | null; records: number }[]) =>
    rows.map((row): Breakdown => ({ ...row, name: row.name ?? null, total: total([row.total]) })).sort(byTotal);

  return {
    gross,
    fees,
    businessExpenses: business,
    profit: subtract(gross, fees, business),
    tds,
    net,
    otherSpending,
    pending: { total: total([pending!.total]), records: pending!.records },
    otherCurrencyRecords: otherIncome!.value + otherExpenses!.value,
    months: monthsBetween(from, to).map((month) => ({
      month,
      income: total(byMonthIncome.filter((row) => row.month === month).map((row) => row.gross)),
      expenses: total(byMonthExpenses.filter((row) => row.month === month).map((row) => row.total)),
    })),
    clients: tidy(byClient),
    incomeCategories: tidy(byIncomeCategory),
    expenseCategories: tidy(byExpenseCategory),
  };
}
