import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runAsUser } from "@/db/run-as-user";
import { clients, expenseRecords, incomeRecords, users } from "@/db/schema";
import { endOfMonth, monthsBetween, taxYearStartFor } from "@/lib/dates";
import { buildReport } from "@/server/services/reports";
import { parseRange, presetRanges } from "@/validations/reports";
import { createTestDb, createUsers, type TestDb } from "../helpers";

let db: TestDb;
let close: () => Promise<void>;
let alice: string;
let bob: string;

const shared = { description: "x", currency: "INR", exchangeRate: "1", baseCurrency: "INR", paymentMethod: "other" };

const addIncome = (amount: string, date: string, extra: object = {}, userId = alice) =>
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
const addExpense = (amount: string, date: string, extra: object = {}, userId = alice) =>
  db.insert(expenseRecords).values({
    ...shared,
    userId,
    amount,
    convertedAmount: amount,
    expenseDate: date,
    taxYearStart: taxYearStartFor(date),
    category: "software",
    ...extra,
  });
const report = (range = { from: "2026-04-01", to: "2027-03-31" }, currency = "INR") =>
  runAsUser(db, alice, (tx) => buildReport(tx, { userId: alice, currency, ...range }));

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(async () => {
  await db.delete(users);
  [alice, bob] = await createUsers(db);
});

describe("report figures", () => {
  it("are zero without records", async () => {
    expect(await report()).toMatchObject({
      gross: "0",
      fees: "0",
      profit: "0",
      net: "0",
      clients: [],
      incomeCategories: [],
      expenseCategories: [],
      pending: { total: "0", records: 0 },
    });
  });

  it("work from gross income down to profit", async () => {
    await addIncome("1000", "2026-11-20", { netReceived: "850.50", tdsDeducted: "100" });
    await addIncome("0.1", "2026-11-21");
    await addExpense("200.20", "2026-11-05");
    await addExpense("75", "2026-11-06", { isDeductible: false });
    expect(await report()).toMatchObject({
      gross: "1000.1",
      tds: "100",
      fees: "49.5",
      net: "850.6",
      businessExpenses: "200.2",
      otherSpending: "75",
      profit: "750.4",
    });
  });

  it("include both ends of the range and nothing outside it", async () => {
    await addIncome("1", "2026-11-01");
    await addIncome("2", "2026-11-30");
    await addIncome("4", "2026-10-31");
    await addIncome("8", "2026-12-01");
    await addExpense("16", "2026-10-31");
    const result = await report({ from: "2026-11-01", to: "2026-11-30" });
    expect(result).toMatchObject({ gross: "3", businessExpenses: "0" });
    expect(result.months).toEqual([{ month: "2026-11", income: "3", expenses: "0" }]);
  });

  it("keep pending and disputed income out of the totals", async () => {
    await addIncome("10", "2026-11-20", { status: "pending" });
    await addIncome("20", "2026-11-20", { status: "disputed" });
    expect(await report()).toMatchObject({ gross: "0", pending: { total: "10", records: 1 } });
  });

  it("show a loss as a negative profit", async () => {
    await addExpense("5", "2026-11-20");
    expect((await report()).profit).toBe("-5");
  });

  it("group by client and category, largest first by value", async () => {
    const [acme, zed] = await db
      .insert(clients)
      .values([
        { userId: alice, name: "Acme" },
        { userId: alice, name: "Zed" },
      ])
      .returning({ id: clients.id });
    await addIncome("9", "2026-11-20", { clientId: acme!.id });
    await addIncome("100", "2026-11-20", { clientId: zed!.id, category: "consulting" });
    await addIncome("50", "2026-11-20");
    await addExpense("9", "2026-11-20", { category: "travel" });
    await addExpense("10", "2026-11-20");
    const result = await report();
    expect(result.clients.map(({ name, total }) => [name, total])).toEqual([
      ["Zed", "100"],
      [null, "50"],
      ["Acme", "9"],
    ]);
    expect(result.incomeCategories.map(({ key, records }) => [key, records])).toEqual([
      ["consulting", 1],
      ["freelance", 2],
    ]);
    expect(result.expenseCategories.map((row) => row.key)).toEqual(["software", "travel"]);
  });

  it("keeps two clients with the same name apart", async () => {
    const rows = await db
      .insert(clients)
      .values([
        { userId: alice, name: "Same" },
        { userId: alice, name: "Same" },
      ])
      .returning({ id: clients.id });
    for (const { id } of rows) await addIncome("1", "2026-11-20", { clientId: id });
    expect((await report()).clients).toHaveLength(2);
  });

  it("count but never add records in another currency", async () => {
    await addIncome("100", "2026-11-20", { baseCurrency: "USD" });
    await addExpense("100", "2026-11-20", { baseCurrency: "USD" });
    expect(await report()).toMatchObject({ gross: "0", businessExpenses: "0", otherCurrencyRecords: 2 });
    expect(await report(undefined, "USD")).toMatchObject({ gross: "100", otherCurrencyRecords: 0 });
  });

  it("never include another user's records", async () => {
    await addIncome("999", "2026-11-20", {}, bob);
    await addExpense("999", "2026-11-20", {}, bob);
    expect(await report()).toMatchObject({ gross: "0", businessExpenses: "0", otherCurrencyRecords: 0 });
  });
});

describe("date ranges", () => {
  const today = "2026-11-23";
  const thisYear = { from: "2026-04-01", to: "2027-03-31" };

  it("default to the current tax year", () => {
    expect(parseRange({}, today)).toEqual(thisYear);
  });

  it("accept a custom range", () => {
    expect(parseRange({ from: "2026-01-05", to: "2026-02-03" }, today)).toEqual({
      from: "2026-01-05",
      to: "2026-02-03",
    });
  });

  it.each([
    [{ from: "2026-02-01", to: "2026-01-01" }, /before/],
    [{ from: "2024-01-01", to: "2026-01-01" }, /24 months/],
    [{ from: "nonsense", to: "2026-01-01" }, /valid dates/],
    [{ from: "2026-01-01" }, /valid dates/],
    [{ from: ["2026-01-01"], to: "2026-02-01" }, /valid dates/],
    [{ from: "2026-02-30", to: "2026-03-01" }, /valid dates/],
  ])("explain what is wrong with %j", (raw, message) => {
    const result = parseRange(raw, today);
    expect(result.error).toMatch(message);
    expect(result).toMatchObject(thisYear);
  });

  it("allow exactly 24 months", () => {
    expect(parseRange({ from: "2024-01-01", to: "2025-12-31" }, today).error).toBeUndefined();
  });

  it("offer presets", () => {
    expect(presetRanges("2027-02-10").map(({ from, to }) => [from, to])).toEqual([
      ["2026-04-01", "2027-03-31"],
      ["2025-04-01", "2026-03-31"],
      ["2027-02-01", "2027-02-28"],
    ]);
  });

  it("count months across years and leap days", () => {
    expect(monthsBetween("2026-11-30", "2027-02-01")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
    expect(monthsBetween("2027-02-01", "2026-11-30")).toEqual([]);
    expect(endOfMonth("2028-02-10")).toBe("2028-02-29");
    expect(endOfMonth("2026-12-01")).toBe("2026-12-31");
  });
});
