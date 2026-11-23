import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runAsUser } from "@/db/run-as-user";
import { auditLogs, clients, incomeRecords, users } from "@/db/schema";
import { blankClient } from "@/validations/clients";
import { type IncomeFormValues, incomeSchema, parseIncomeFilters } from "@/validations/income";
import { createClient, deleteClient } from "@/server/services/clients";
import { createIncome, deleteIncome, updateIncome } from "@/server/services/income";
import { createTestDb, createUsers, type TestDb } from "../helpers";

let db: TestDb;
let close: () => Promise<void>;
let alice: string;
let bob: string;

const base: IncomeFormValues = {
  description: "Website",
  clientId: "",
  amount: "1,000",
  currency: "USD",
  exchangeRate: "92.68",
  paymentDate: "2026-11-20",
  paymentMethod: "paypal",
  gatewayFee: "44.50",
  bankCharges: "100",
  tdsDeducted: "",
  category: "freelance",
  status: "received",
  notes: "",
};
const today = "2026-11-23";

const create = (change: Partial<IncomeFormValues> = {}, userId = alice, baseCurrency = "INR") =>
  runAsUser(db, userId, (tx) =>
    createIncome(tx, { userId, baseCurrency, today }, incomeSchema.parse({ ...base, ...change })),
  );
const update = (id: string, change: Partial<IncomeFormValues>, userId = alice) =>
  runAsUser(db, userId, (tx) => updateIncome(tx, { userId, today }, id, incomeSchema.parse({ ...base, ...change })));
const find = async (id: string) => (await db.select().from(incomeRecords).where(eq(incomeRecords.id, id)))[0];

async function created(...args: Parameters<typeof create>) {
  const result = await create(...args);
  if (!result.ok) throw new Error(result.error);
  return result.data.id;
}

async function addClient(userId: string) {
  const result = await runAsUser(db, userId, (tx) => createClient(tx, userId, { ...blankClient, name: "Acme" }));
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

describe("income figures", () => {
  it("converts the amount and works out what was received", async () => {
    expect(await find(await created())).toMatchObject({
      amount: "1000.0000",
      exchangeRate: "92.68000000",
      convertedAmount: "92680.0000",
      // (1000 - 44.50) x 92.68 = 88,555.74, less 100 bank charges
      netReceived: "88455.7400",
      baseCurrency: "INR",
      taxYearStart: "2026-04-01",
    });
  });

  it("uses a rate of 1 in the base currency, whatever the form says", async () => {
    const id = await created({ currency: "INR", exchangeRate: "5", gatewayFee: "", tdsDeducted: "100" });
    expect(await find(id)).toMatchObject({
      exchangeRate: "1.00000000",
      convertedAmount: "1000.0000",
      netReceived: "800.0000",
    });
  });

  it("rounds to whole units for a currency without decimals", async () => {
    const change = { amount: "10", exchangeRate: "155.555", gatewayFee: "", bankCharges: "" };
    expect(await find(await created(change, alice, "JPY"))).toMatchObject({ convertedAmount: "1556.0000" });
  });

  it.each([
    [{ paymentDate: "2026-03-31" }, "2025-04-01"],
    [{ paymentDate: "2026-04-01" }, "2026-04-01"],
  ])("files %j under the year starting %s", async (change, year) => {
    expect((await find(await created(change)))!.taxYearStart).toBe(year);
  });

  it.each([
    [{ exchangeRate: "" }, /exchange rate/],
    [{ gatewayFee: "1000.01" }, /gateway fee/],
    [{ bankCharges: "90000" }, /deductions/],
    [{ currency: "XXX" }, /currency/],
    [{ paymentDate: "2026-11-24" }, /future/],
    [{ amount: "9999999999999", exchangeRate: "1000", gatewayFee: "" }, /too large/],
  ])("refuses %j", async (change, message) => {
    const result = await create(change);
    expect(result.ok ? "" : result.error).toMatch(message);
    expect(await db.select().from(incomeRecords)).toEqual([]);
  });

  it("allows a future date for pending income", async () => {
    expect((await create({ status: "pending", paymentDate: "2026-12-01" })).ok).toBe(true);
  });

  it("recalculates on update and keeps the original base currency", async () => {
    const id = await created();
    await update(id, { amount: "2000", gatewayFee: "", bankCharges: "" });
    expect(await find(id)).toMatchObject({ convertedAmount: "185360.0000", baseCurrency: "INR" });
  });
});

describe("income ownership", () => {
  it("refuses another user's client", async () => {
    const result = await create({ clientId: await addClient(bob) });
    expect(result.ok ? "" : result.error).toMatch(/client/);
    const id = await created();
    expect((await update(id, { clientId: await addClient(bob) })).ok).toBe(false);
  });

  it("does not update or delete another user's record", async () => {
    const id = await created({}, bob);
    expect((await update(id, { description: "Stolen" })).ok).toBe(false);
    expect((await runAsUser(db, alice, (tx) => deleteIncome(tx, alice, id))).ok).toBe(false);
    expect(await find(id)).toMatchObject({ description: "Website" });
  });

  it("hides other users' records even from an unfiltered query", async () => {
    await created({}, bob);
    expect(await runAsUser(db, alice, (tx) => tx.select().from(incomeRecords))).toEqual([]);
  });

  it("deletes and logs the user's own record", async () => {
    const id = await created();
    expect((await runAsUser(db, alice, (tx) => deleteIncome(tx, alice, id))).ok).toBe(true);
    const actions = (await db.select().from(auditLogs)).map((row) => row.action);
    expect(actions).toEqual(["income.create", "income.delete"]);
  });
});

describe("clients with income", () => {
  it("cannot be deleted, and the transaction stays usable", async () => {
    const clientId = await addClient(alice);
    await created({ clientId });
    const [result, rows] = await runAsUser(db, alice, async (tx) => [
      await deleteClient(tx, alice, clientId),
      await tx.select().from(clients),
    ]);
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/Archive/) });
    expect(rows).toHaveLength(1);
  });

  it("go with their records when the account is deleted", async () => {
    await created({ clientId: await addClient(alice) });
    await db.delete(users).where(eq(users.id, alice));
    expect(await db.select().from(incomeRecords)).toEqual([]);
    expect(await db.select().from(clients)).toEqual([]);
  });
});

describe("income input", () => {
  it.each([
    [{ amount: "0.00" }, "amount"],
    [{ amount: "-5" }, "amount"],
    [{ amount: "1e5" }, "amount"],
    [{ amount: "1.23456" }, "amount"],
    [{ amount: "" }, "amount"],
    [{ exchangeRate: "0" }, "exchangeRate"],
    [{ gatewayFee: "-1" }, "gatewayFee"],
    [{ paymentDate: "2026-02-30" }, "paymentDate"],
    [{ paymentDate: "1999-12-31" }, "paymentDate"],
    [{ clientId: "1" }, "clientId"],
    [{ status: "paid" }, "status"],
    [{ description: " " }, "description"],
  ])("rejects %j", (change, field) => {
    const result = incomeSchema.safeParse({ ...base, ...change });
    expect(result.error?.issues[0]?.path).toEqual([field]);
  });

  it("reads Indian digit grouping", () => {
    expect(incomeSchema.parse({ ...base, amount: "1,00,000.50" }).amount).toBe("100000.50");
  });

  it("ignores filters that make no sense", () => {
    expect(parseIncomeFilters({ client: "x", status: ["a"], year: "2026" })).toEqual({
      client: "",
      status: "",
      year: "",
    });
  });
});
