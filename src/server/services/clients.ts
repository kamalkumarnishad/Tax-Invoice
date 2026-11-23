import "server-only";
import { and, eq } from "drizzle-orm";
import { auditLogs, clients } from "@/db/schema";
import { type ClientInput } from "@/validations/clients";
import { orNull } from "@/validations/common";
import { isActiveCurrency } from "./currency/currencies";
import { type ActionResult, done, fail, isForeignKeyViolation, ok, type Tx } from "./shared";

/** Every function here runs inside `withUser`; the owner check repeats what RLS enforces. */
const owned = (userId: string, id: string) => and(eq(clients.id, id), eq(clients.userId, userId));

const toColumns = (input: ClientInput) => ({
  name: input.name,
  company: orNull(input.company),
  email: orNull(input.email),
  country: orNull(input.country),
  currency: orNull(input.currency),
  taxId: orNull(input.taxId),
  billingAddress: orNull(input.billingAddress),
  notes: orNull(input.notes),
});

const log = (tx: Tx, userId: string, action: string, resourceId: string) =>
  tx.insert(auditLogs).values({ userId, action, resourceType: "client", resourceId });

export async function createClient(tx: Tx, userId: string, input: ClientInput): Promise<ActionResult<{ id: string }>> {
  if (input.currency && !(await isActiveCurrency(tx, input.currency))) return fail("Choose a currency from the list.");
  const [row] = await tx
    .insert(clients)
    .values({ userId, ...toColumns(input) })
    .returning({ id: clients.id });
  await log(tx, userId, "client.create", row!.id);
  return ok({ id: row!.id });
}

export async function updateClient(tx: Tx, userId: string, id: string, input: ClientInput): Promise<ActionResult> {
  if (input.currency && !(await isActiveCurrency(tx, input.currency))) return fail("Choose a currency from the list.");
  const rows = await tx.update(clients).set(toColumns(input)).where(owned(userId, id)).returning({ id: clients.id });
  if (rows.length === 0) return fail("This client no longer exists.");
  await log(tx, userId, "client.update", id);
  return done;
}

export async function setClientActive(tx: Tx, userId: string, id: string, isActive: boolean): Promise<ActionResult> {
  const rows = await tx.update(clients).set({ isActive }).where(owned(userId, id)).returning({ id: clients.id });
  if (rows.length === 0) return fail("This client no longer exists.");
  await log(tx, userId, isActive ? "client.restore" : "client.archive", id);
  return done;
}

export async function deleteClient(tx: Tx, userId: string, id: string): Promise<ActionResult> {
  try {
    // A nested transaction is a savepoint, so a refused delete leaves `tx` usable.
    const rows = await tx.transaction((inner) =>
      inner.delete(clients).where(owned(userId, id)).returning({ id: clients.id }),
    );
    if (rows.length === 0) return fail("This client no longer exists.");
  } catch (error) {
    if (isForeignKeyViolation(error)) return fail("This client has records. Archive it instead of deleting it.");
    throw error;
  }
  await log(tx, userId, "client.delete", id);
  return done;
}
