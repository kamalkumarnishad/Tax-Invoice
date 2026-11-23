import "server-only";
import { and, count, desc, eq, ilike, or, sum } from "drizzle-orm";
import { expenseRecords } from "@/db/schema";
import { withUser } from "@/lib/db";
import { containsPattern, PAGE_SIZE } from "@/validations/common";
import type { parseExpenseFilters } from "@/validations/expenses";

type ListOptions = ReturnType<typeof parseExpenseFilters> & { q: string; page: number };

export function listExpenses(userId: string, { q, page, category, year }: ListOptions) {
  const pattern = containsPattern(q);
  const where = and(
    eq(expenseRecords.userId, userId),
    category ? eq(expenseRecords.category, category) : undefined,
    year ? eq(expenseRecords.taxYearStart, year) : undefined,
    q ? or(ilike(expenseRecords.description, pattern), ilike(expenseRecords.vendor, pattern)) : undefined,
  );

  return withUser(userId, async (tx) => {
    const [total] = await tx.select({ value: count() }).from(expenseRecords).where(where);
    // Amounts in different base currencies cannot be added together.
    const spent = await tx
      .select({ currency: expenseRecords.baseCurrency, total: sum(expenseRecords.convertedAmount) })
      .from(expenseRecords)
      .where(where)
      .groupBy(expenseRecords.baseCurrency)
      .orderBy(expenseRecords.baseCurrency);
    const rows = await tx
      .select()
      .from(expenseRecords)
      .where(where)
      .orderBy(desc(expenseRecords.expenseDate), desc(expenseRecords.createdAt), desc(expenseRecords.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE);
    return { rows, total: total!.value, spent };
  });
}

export function getExpense(userId: string, id: string) {
  return withUser(userId, async (tx) => {
    const [row] = await tx
      .select()
      .from(expenseRecords)
      .where(and(eq(expenseRecords.id, id), eq(expenseRecords.userId, userId)));
    return row ?? null;
  });
}

export function listExpenseYears(userId: string) {
  return withUser(userId, async (tx) => {
    const rows = await tx
      .selectDistinct({ year: expenseRecords.taxYearStart })
      .from(expenseRecords)
      .where(eq(expenseRecords.userId, userId))
      .orderBy(desc(expenseRecords.taxYearStart));
    return rows.map((row) => row.year);
  });
}
