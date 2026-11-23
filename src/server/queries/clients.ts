import "server-only";
import { and, asc, count, desc, eq, ilike, or } from "drizzle-orm";
import { clients } from "@/db/schema";
import { withUser } from "@/lib/db";
import { containsPattern, PAGE_SIZE } from "@/validations/common";

type ListOptions = { q: string; page: number; archived: boolean };

export function listClients(userId: string, { q, page, archived }: ListOptions) {
  const pattern = containsPattern(q);
  const where = and(
    eq(clients.userId, userId),
    eq(clients.isActive, !archived),
    q ? or(ilike(clients.name, pattern), ilike(clients.company, pattern), ilike(clients.email, pattern)) : undefined,
  );

  return withUser(userId, async (tx) => {
    const [total] = await tx.select({ value: count() }).from(clients).where(where);
    const rows = await tx
      .select()
      .from(clients)
      .where(where)
      .orderBy(asc(clients.name), asc(clients.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE);
    return { rows, total: total!.value };
  });
}

export function getClient(userId: string, id: string) {
  return withUser(userId, async (tx) => {
    const [row] = await tx
      .select()
      .from(clients)
      .where(and(eq(clients.id, id), eq(clients.userId, userId)));
    return row ?? null;
  });
}

/** For select boxes: active clients first, archived ones after. */
export function listClientOptions(userId: string) {
  return withUser(userId, async (tx) => {
    const rows = await tx
      .select({ id: clients.id, name: clients.name, currency: clients.currency, isActive: clients.isActive })
      .from(clients)
      .where(eq(clients.userId, userId))
      .orderBy(desc(clients.isActive), asc(clients.name));
    return rows.map((row) => ({
      value: row.id,
      label: row.isActive ? row.name : `${row.name} (archived)`,
      currency: row.currency,
    }));
  });
}
