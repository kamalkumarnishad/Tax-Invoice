import "server-only";
import { and, count, desc, eq, ilike, or, sum } from "drizzle-orm";
import { clients, incomeRecords } from "@/db/schema";
import { withUser } from "@/lib/db";
import { containsPattern, PAGE_SIZE } from "@/validations/common";
import type { parseIncomeFilters } from "@/validations/income";

type ListOptions = ReturnType<typeof parseIncomeFilters> & { q: string; page: number };

export function listIncome(userId: string, { q, page, client, status, year }: ListOptions) {
  const pattern = containsPattern(q);
  const where = and(
    eq(incomeRecords.userId, userId),
    client ? eq(incomeRecords.clientId, client) : undefined,
    status ? eq(incomeRecords.status, status) : undefined,
    year ? eq(incomeRecords.taxYearStart, year) : undefined,
    q ? or(ilike(incomeRecords.description, pattern), ilike(clients.name, pattern)) : undefined,
  );

  return withUser(userId, async (tx) => {
    const [total] = await tx
      .select({ value: count() })
      .from(incomeRecords)
      .leftJoin(clients, eq(clients.id, incomeRecords.clientId))
      .where(where);
    // Amounts in different base currencies cannot be added together.
    const received = await tx
      .select({ currency: incomeRecords.baseCurrency, total: sum(incomeRecords.convertedAmount) })
      .from(incomeRecords)
      .leftJoin(clients, eq(clients.id, incomeRecords.clientId))
      .where(and(where, eq(incomeRecords.status, "received")))
      .groupBy(incomeRecords.baseCurrency)
      .orderBy(incomeRecords.baseCurrency);
    const rows = await tx
      .select({ record: incomeRecords, clientName: clients.name })
      .from(incomeRecords)
      .leftJoin(clients, eq(clients.id, incomeRecords.clientId))
      .where(where)
      .orderBy(desc(incomeRecords.paymentDate), desc(incomeRecords.createdAt), desc(incomeRecords.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE);
    return { rows, total: total!.value, received };
  });
}

export function getIncome(userId: string, id: string) {
  return withUser(userId, async (tx) => {
    const [row] = await tx
      .select()
      .from(incomeRecords)
      .where(and(eq(incomeRecords.id, id), eq(incomeRecords.userId, userId)));
    return row ?? null;
  });
}

export function listIncomeYears(userId: string) {
  return withUser(userId, async (tx) => {
    const rows = await tx
      .selectDistinct({ year: incomeRecords.taxYearStart })
      .from(incomeRecords)
      .where(eq(incomeRecords.userId, userId))
      .orderBy(desc(incomeRecords.taxYearStart));
    return rows.map((row) => row.year);
  });
}
