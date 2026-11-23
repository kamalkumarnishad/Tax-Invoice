import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { taxCalculations } from "@/db/schema";
import { withUser } from "@/lib/db";

const RECENT = 10;

export function listCalculations(userId: string) {
  return withUser(userId, (tx) =>
    tx
      .select({
        id: taxCalculations.id,
        createdAt: taxCalculations.createdAt,
        taxYearStart: taxCalculations.taxYearStart,
        results: taxCalculations.results,
      })
      .from(taxCalculations)
      .where(eq(taxCalculations.userId, userId))
      .orderBy(desc(taxCalculations.createdAt))
      .limit(RECENT),
  );
}

export function getCalculation(userId: string, id: string) {
  return withUser(userId, async (tx) => {
    const [row] = await tx
      .select()
      .from(taxCalculations)
      .where(and(eq(taxCalculations.id, id), eq(taxCalculations.userId, userId)));
    return row ?? null;
  });
}
