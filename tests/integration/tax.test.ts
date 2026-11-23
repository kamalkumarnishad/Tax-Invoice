import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { runAsUser } from "@/db/run-as-user";
import { auditLogs, expenseRecords, incomeRecords, taxCalculations, users } from "@/db/schema";
import { taxYearStartFor } from "@/lib/dates";
import { deleteCalculation, estimate, prefill, saveCalculation } from "@/server/services/tax";
import { calculatorAvailable, currentRules } from "@/server/services/tax-engine/rules";
import { type TaxFormValues, taxFormSchema } from "@/validations/tax";
import { createTestDb, createUsers, type TestDb } from "../helpers";

let db: TestDb;
let close: () => Promise<void>;
let alice: string;
let bob: string;

const form: TaxFormValues = {
  ageGroup: "under_60",
  receipts: "15,00,000",
  method: "actual",
  expenses: "",
  cashReceipts: "",
  declaredProfit: "",
  professionConfirmed: false,
  salary: "",
  savingsInterest: "",
  otherInterest: "",
  savings: "",
  nps: "",
  healthSelf: "",
  healthParents: "",
  parentsSenior: false,
  taxDeducted: "",
  scopeConfirmed: true,
};
const parsed = (change: Partial<TaxFormValues> = {}) => taxFormSchema.parse({ ...form, ...change });

async function save(userId = alice, change: Partial<TaxFormValues> = {}) {
  const result = await runAsUser(db, userId, (tx) => saveCalculation(tx, userId, currentRules, parsed(change)));
  if (!result.ok) throw new Error(result.error);
  return result.data.id;
}

const addIncome = (amount: string, extra: object = {}, userId = alice) =>
  db.insert(incomeRecords).values({
    userId,
    description: "x",
    amount,
    currency: "INR",
    exchangeRate: "1",
    convertedAmount: amount,
    baseCurrency: "INR",
    paymentDate: "2026-11-20",
    paymentMethod: "bank_transfer",
    netReceived: amount,
    category: "freelance",
    taxYearStart: "2026-04-01",
    status: "received",
    ...extra,
  });
const addExpense = (amount: string, extra: object = {}) =>
  db.insert(expenseRecords).values({
    userId: alice,
    description: "x",
    amount,
    currency: "INR",
    exchangeRate: "1",
    convertedAmount: amount,
    baseCurrency: "INR",
    category: "software",
    expenseDate: "2026-11-20",
    paymentMethod: "card",
    taxYearStart: taxYearStartFor("2026-11-20"),
    ...extra,
  });
const filled = (userId = alice) => runAsUser(db, userId, (tx) => prefill(tx, userId, "2026-04-01"));

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(async () => {
  await db.delete(auditLogs);
  await db.delete(users);
  [alice, bob] = await createUsers(db);
});

describe("saved calculations", () => {
  it("keep the input, the rules and both results", async () => {
    const id = await save();
    const [row] = await db.select().from(taxCalculations).where(eq(taxCalculations.id, id));
    expect(row).toMatchObject({ userId: alice, ruleId: "IN-2026-27", ruleVersion: 1, taxYearStart: "2026-04-01" });
    expect(row!.input.receipts).toBe("1500000");
    expect(row!.input).not.toHaveProperty("scopeConfirmed");
    expect(row!.rules).toEqual(currentRules);
    expect(row!.results.new_regime.totalTax).toBe("109200");
  });

  it("can be worked out again from what was saved", async () => {
    const [row] = await db.select().from(taxCalculations).where(eq(taxCalculations.id, await save()));
    const again = estimate(row!.rules, { ...row!.input, scopeConfirmed: true });
    expect(again).toEqual({ ok: true, results: row!.results });
  });

  it("cannot be changed, even by their owner", async () => {
    await save();
    await expect(
      runAsUser(db, alice, (tx) => tx.update(taxCalculations).set({ ruleVersion: 2 })),
    ).rejects.toThrow();
  });

  it("are not saved when they cannot be worked out", async () => {
    const result = await runAsUser(db, alice, (tx) =>
      saveCalculation(tx, alice, currentRules, parsed({ expenses: "9999999" })),
    );
    expect(result.ok).toBe(false);
    expect(await db.select().from(taxCalculations)).toEqual([]);
  });

  it("are private to their owner", async () => {
    const id = await save(bob);
    expect(await runAsUser(db, alice, (tx) => tx.select().from(taxCalculations))).toEqual([]);
    expect((await runAsUser(db, alice, (tx) => deleteCalculation(tx, alice, id))).ok).toBe(false);
    expect((await runAsUser(db, bob, (tx) => deleteCalculation(tx, bob, id))).ok).toBe(true);
    const actions = (await db.select().from(auditLogs)).map((row) => row.action);
    expect(actions).toEqual(["tax_calculation.save", "tax_calculation.delete"]);
  });
});

describe("pre-filled figures", () => {
  it("come from received professional income and business expenses", async () => {
    await addIncome("1000", { netReceived: "800", tdsDeducted: "100" });
    await addIncome("500", { category: "consulting", paymentMethod: "cash" });
    await addIncome("40", { category: "interest" });
    await addExpense("200.50");
    await addExpense("999", { isDeductible: false });
    expect(await filled()).toEqual({
      receipts: "1500",
      cashReceipts: "500",
      // 200.50 spent, plus 1000 - 800 - 100 TDS = 100 of fees and charges
      expenses: "300.5",
      interest: "40",
      taxDeducted: "100",
      unplacedIncome: "0",
      otherCurrencyRecords: 0,
    });
  });

  it("leave out pending income, other years and other users", async () => {
    await addIncome("1", { status: "pending" });
    await addIncome("2", { taxYearStart: "2025-04-01", paymentDate: "2026-03-31" });
    await addIncome("4", {}, bob);
    expect(await filled()).toMatchObject({ receipts: "0", expenses: "0" });
  });

  it("point out income they could not place and records in other currencies", async () => {
    await addIncome("70", { category: "royalty" });
    await addIncome("30", { category: "other" });
    await addIncome("5", { baseCurrency: "USD" });
    expect(await filled()).toMatchObject({ receipts: "0", unplacedIncome: "100", otherCurrencyRecords: 1 });
  });
});

describe("the review gate", () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ["production", "pending_review", false],
    ["production", "approved", true],
    ["development", "pending_review", true],
  ] as const)("in %s with %s rules: available %s", (mode, status, available) => {
    vi.stubEnv("NODE_ENV", mode);
    expect(calculatorAvailable({ ...currentRules, status })).toBe(available);
  });
});

describe("calculator input", () => {
  it.each([
    [{ scopeConfirmed: false }, "scopeConfirmed"],
    [{ receipts: "-1" }, "receipts"],
    [{ method: "guess" }, "method"],
    [{ salary: "1e9" }, "salary"],
  ])("rejects %j", (change, field) => {
    const result = taxFormSchema.safeParse({ ...form, ...change });
    expect(result.error?.issues[0]?.path).toEqual([field]);
  });
});
