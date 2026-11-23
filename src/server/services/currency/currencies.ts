import "server-only";
import { and, eq } from "drizzle-orm";
import { currencies } from "@/db/schema";
import type { Tx } from "../shared";

export async function isActiveCurrency(tx: Tx, code: string): Promise<boolean> {
  const rows = await tx
    .select({ code: currencies.code })
    .from(currencies)
    .where(and(eq(currencies.code, code), eq(currencies.isActive, true)));
  return rows.length > 0;
}
