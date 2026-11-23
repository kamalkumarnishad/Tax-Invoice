import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runAsUser } from "@/db/run-as-user";
import { expenseRecords, incomeRecords, users } from "@/db/schema";
import { monthsOfTaxYear, taxYearStartFor } from "@/lib/dates";
import { summarise } from "@/server/services/dashboard";
import { createTestDb, createUsers, type TestDb } from "../helpers";

let db: TestDb;
let close: () => Promise<void>;
let alice: string;
let bob: string;

const shared = { description: "x", currency: "INR", exchangeRate: "1", baseCurrency: "INR", paymentMethod: "other" };

const addIncome = (userId: string, amount: string, date: string, extra: object = {}) =>
  db.insert(incomeRecords).values({
    ...shared,
    userId,
    amount,
    convertedAmount: amount,
    netReceived: amount,
    paymentDate: date,
    taxYearStart: taxYearStartFor(date),
    category: "freelance",
    status: "received",
    ...extra,
  });
const addExpense = (userId: string, amount: string, date: string, extra: object = {}) =>
  db.insert(expenseRecords).values({
    ...shared,
    userId,
    amount,
    convertedAmount: amount,
    expenseDate: date,
    taxYearStart: taxYearStartFor(date),
    category: "other",
    ...extra,
  });
const summary = (userId = alice) =>
  runAsUser(db, userId, (tx) => summarise(tx, { userId, currency: "INR", year: "2026-04-01" }));

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(async () => {
  await db.delete(users);
  [alice, bob] = await createUsers(db);
});

describe("dashboard figures", () => {
  it("are zero without records", async () => {
    const result = await summary();
    expect(result).toMatchObject({ income: "0", pending: "0", expenses: "0", profit: "0", otherCurrencyRecords: 0 });
    expect(result.months).toHaveLength(12);
  });

  it("add up exactly and keep pending and disputed income apart", async () => {
    await addIncome(alice, "0.1", "2026-04-01");
    await addIncome(alice, "0.2", "2026-11-20");
    await addIncome(alice, "50", "2026-11-21", { status: "pending" });
    await addIncome(alice, "70", "2026-11-21", { status: "disputed" });
    await addExpense(alice, "1", "2026-11-05");
    expect(await summary()).toMatchObject({ income: "0.3", pending: "50", expenses: "1", profit: "-0.7" });
  });

  it("place records in their own month, up to both ends of the year", async () => {
    await addIncome(alice, "1", "2026-04-01");
    await addIncome(alice, "2", "2027-03-31");
    await addIncome(alice, "4", "2026-03-31");
    await addIncome(alice, "8", "2027-04-01");
    const result = await summary();
    expect(result.income).toBe("3");
    expect(result.months[0]).toMatchObject({ month: "2026-04", income: "1" });
    expect(result.months[11]).toMatchObject({ month: "2027-03", income: "2" });
  });

  it("leave out and count records in another base currency", async () => {
    await addIncome(alice, "100", "2026-11-20", { baseCurrency: "USD" });
    await addExpense(alice, "5", "2026-11-20", { baseCurrency: "USD" });
    await addIncome(alice, "10", "2026-11-20");
    expect(await summary()).toMatchObject({ income: "10", expenses: "0", otherCurrencyRecords: 2 });
  });

  it("never include another user's records", async () => {
    await addIncome(bob, "999", "2026-11-20");
    await addExpense(bob, "999", "2026-11-20");
    expect(await summary()).toMatchObject({ income: "0", expenses: "0", otherCurrencyRecords: 0 });
  });
});

it("lists the months of a tax year in order", () => {
  const months = monthsOfTaxYear("2026-04-01");
  expect(months).toHaveLength(12);
  expect([months[0], months[8], months[9], months[11]]).toEqual(["2026-04", "2026-12", "2027-01", "2027-03"]);
});
