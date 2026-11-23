import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runAsUser } from "@/db/run-as-user";
import { auditLogs, expenseRecords, users } from "@/db/schema";
import { createExpense, deleteExpense, updateExpense } from "@/server/services/expenses";
import { type ExpenseFormValues, expenseSchema, parseExpenseFilters } from "@/validations/expenses";
import { createTestDb, createUsers, type TestDb } from "../helpers";

let db: TestDb;
let close: () => Promise<void>;
let alice: string;
let bob: string;

const base: ExpenseFormValues = {
  description: "Editor licence",
  vendor: "Acme",
  amount: "49.99",
  currency: "USD",
  exchangeRate: "92.68",
  expenseDate: "2026-11-20",
  category: "software",
  paymentMethod: "card",
  isDeductible: true,
  notes: "",
};
const today = "2026-11-23";

const create = (change: Partial<ExpenseFormValues> = {}, userId = alice) =>
  runAsUser(db, userId, (tx) =>
    createExpense(tx, { userId, baseCurrency: "INR", today }, expenseSchema.parse({ ...base, ...change })),
  );
const update = (id: string, change: Partial<ExpenseFormValues>, userId = alice) =>
  runAsUser(db, userId, (tx) => updateExpense(tx, { userId, today }, id, expenseSchema.parse({ ...base, ...change })));
const find = async (id: string) => (await db.select().from(expenseRecords).where(eq(expenseRecords.id, id)))[0];

async function created(...args: Parameters<typeof create>) {
  const result = await create(...args);
  if (!result.ok) throw new Error(result.error);
  return result.data.id;
}

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(async () => {
  await db.delete(auditLogs);
  await db.delete(users);
  [alice, bob] = await createUsers(db);
});

describe("expenses", () => {
  it("converts to the base currency and files under a tax year", async () => {
    expect(await find(await created())).toMatchObject({
      amount: "49.9900",
      // 49.99 x 92.68 = 4,633.0732
      convertedAmount: "4633.0700",
      baseCurrency: "INR",
      taxYearStart: "2026-04-01",
      isDeductible: true,
    });
  });

  it("updates, recalculates and deletes", async () => {
    const id = await created();
    expect((await update(id, { amount: "100", isDeductible: false, vendor: "" })).ok).toBe(true);
    expect(await find(id)).toMatchObject({ convertedAmount: "9268.0000", isDeductible: false, vendor: null });
    expect((await runAsUser(db, alice, (tx) => deleteExpense(tx, alice, id))).ok).toBe(true);
    const actions = (await db.select().from(auditLogs)).map((row) => row.action);
    expect(actions).toEqual(["expense.create", "expense.update", "expense.delete"]);
  });

  it.each([
    [{ exchangeRate: "" }, /exchange rate/],
    [{ expenseDate: "2026-11-24" }, /future/],
    [{ currency: "XXX" }, /currency/],
  ])("refuses %j", async (change, message) => {
    const result = await create(change);
    expect(result.ok ? "" : result.error).toMatch(message);
    expect(await db.select().from(expenseRecords)).toEqual([]);
  });

  it("does not reach another user's expense", async () => {
    const id = await created({}, bob);
    expect((await update(id, { description: "Stolen" })).ok).toBe(false);
    expect((await runAsUser(db, alice, (tx) => deleteExpense(tx, alice, id))).ok).toBe(false);
    expect(await runAsUser(db, alice, (tx) => tx.select().from(expenseRecords))).toEqual([]);
    expect(await find(id)).toMatchObject({ description: "Editor licence" });
  });
});

describe("expense input", () => {
  it.each([
    [{ amount: "0" }, "amount"],
    [{ category: "yachts" }, "category"],
    [{ description: "" }, "description"],
    [{ expenseDate: "tomorrow" }, "expenseDate"],
  ])("rejects %j", (change, field) => {
    const result = expenseSchema.safeParse({ ...base, ...change });
    expect(result.error?.issues[0]?.path).toEqual([field]);
  });

  it("ignores filters that make no sense", () => {
    expect(parseExpenseFilters({ category: "yachts", year: "2026-01-01" })).toEqual({ category: "", year: "" });
  });
});
