import "server-only";
import { and, eq } from "drizzle-orm";
import { auditLogs, incomeRecords } from "@/db/schema";
import { taxYearStartFor } from "@/lib/dates";
import { compare, isNegative, subtract } from "@/lib/money";
import { orNull } from "@/validations/common";
import type { IncomeInput } from "@/validations/income";
import { convertToBase } from "./currency/convert";
import { type ActionResult, done, fail, isForeignKeyViolation, ok, type Tx } from "./shared";

/** Every function here runs inside `withUser`; the owner check repeats what RLS enforces. */
const owned = (userId: string, id: string) => and(eq(incomeRecords.id, id), eq(incomeRecords.userId, userId));

const GONE = fail("This record no longer exists.");

const log = (tx: Tx, userId: string, action: string, resourceId: string) =>
  tx.insert(auditLogs).values({ userId, action, resourceType: "income_record", resourceId });

async function toColumns(tx: Tx, input: IncomeInput, baseCurrency: string, today: string) {
  if (input.status === "received" && input.paymentDate > today) {
    return fail("Received income cannot have a future date. Mark it as pending.");
  }
  const conversion = await convertToBase(tx, { ...input, baseCurrency });
  if (!conversion.ok) return conversion;
  const { rate, convertedAmount, toBase } = conversion.data;

  const afterFee = subtract(input.amount, input.gatewayFee);
  if (isNegative(afterFee)) return fail("The gateway fee is more than the amount.");
  const netReceived = subtract(toBase(afterFee), input.bankCharges, input.tdsDeducted);
  if (isNegative(netReceived)) return fail("The deductions are more than the amount.");

  return ok({
    clientId: orNull(input.clientId),
    description: input.description,
    amount: input.amount,
    currency: input.currency,
    exchangeRate: rate,
    convertedAmount,
    baseCurrency,
    paymentDate: input.paymentDate,
    paymentMethod: input.paymentMethod,
    gatewayFee: input.gatewayFee,
    bankCharges: input.bankCharges,
    tdsDeducted: input.tdsDeducted,
    netReceived,
    category: input.category,
    taxYearStart: taxYearStartFor(input.paymentDate),
    status: input.status,
    notes: orNull(input.notes),
  });
}

/** Another user's client fails the (client_id, user_id) foreign key. */
async function withClientCheck<T>(tx: Tx, write: (inner: Tx) => Promise<T>): Promise<ActionResult<T>> {
  try {
    return ok(await tx.transaction(write));
  } catch (error) {
    if (isForeignKeyViolation(error)) return fail("Choose a client from the list.");
    throw error;
  }
}

type Context = { userId: string; baseCurrency: string; today: string };

export async function createIncome(
  tx: Tx,
  { userId, baseCurrency, today }: Context,
  input: IncomeInput,
  invoice: { invoiceId: string; invoiceAmount: string } | null = null,
): Promise<ActionResult<{ id: string }>> {
  const columns = await toColumns(tx, input, baseCurrency, today);
  if (!columns.ok) return columns;
  const written = await withClientCheck(tx, (inner) =>
    inner.insert(incomeRecords).values({ userId, ...columns.data, ...invoice }).returning({ id: incomeRecords.id }),
  );
  if (!written.ok) return written;
  const id = written.data[0]!.id;
  await log(tx, userId, "income.create", id);
  return ok({ id });
}

/** Keeps the base currency the record was made in, even if the user's default has changed. */
export async function updateIncome(
  tx: Tx,
  { userId, today }: Omit<Context, "baseCurrency">,
  id: string,
  input: IncomeInput,
): Promise<ActionResult> {
  const [existing] = await tx
    .select()
    .from(incomeRecords)
    .where(owned(userId, id));
  if (!existing) return GONE;
  // The invoice's balance is worked out from these, so they cannot drift from what was settled.
  const unchanged =
    compare(existing.amount, input.amount) === 0 &&
    existing.currency === input.currency &&
    existing.clientId === orNull(input.clientId) &&
    existing.status === input.status;
  if (existing.invoiceId && !unchanged) {
    return fail(
      "This is a payment for an invoice, so its amount, currency, client and status cannot change. Delete it and record the payment again.",
    );
  }

  const columns = await toColumns(tx, input, existing.baseCurrency, today);
  if (!columns.ok) return columns;
  const written = await withClientCheck(tx, (inner) =>
    inner.update(incomeRecords).set(columns.data).where(owned(userId, id)),
  );
  if (!written.ok) return written;
  await log(tx, userId, "income.update", id);
  return done;
}

export async function deleteIncome(tx: Tx, userId: string, id: string): Promise<ActionResult> {
  const rows = await tx.delete(incomeRecords).where(owned(userId, id)).returning({ id: incomeRecords.id });
  if (rows.length === 0) return GONE;
  await log(tx, userId, "income.delete", id);
  return done;
}
