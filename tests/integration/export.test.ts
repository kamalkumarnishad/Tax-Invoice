import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runAsUser } from "@/db/run-as-user";
import { auditLogs, clients, expenseRecords, incomeRecords, users } from "@/db/schema";
import { toCsv } from "@/lib/csv";
import { exportRecords, type ExportKind, MAX_EXPORT_ROWS } from "@/server/services/export";
import { createTestDb, createUsers, type TestDb } from "../helpers";

let db: TestDb;
let close: () => Promise<void>;
let alice: string;
let bob: string;

const range = { from: "2026-11-01", to: "2026-11-30" };
const income = (extra: object = {}) => ({
  userId: alice,
  description: "Website",
  amount: "1000",
  currency: "USD",
  exchangeRate: "92.68",
  convertedAmount: "92680",
  baseCurrency: "INR",
  paymentDate: "2026-11-20",
  paymentMethod: "paypal",
  gatewayFee: "44.5",
  netReceived: "88555.74",
  category: "freelance",
  taxYearStart: "2026-04-01",
  status: "received",
  ...extra,
});

async function csv(kind: ExportKind, userId = alice) {
  const result = await runAsUser(db, userId, (tx) => exportRecords(tx, userId, kind, range));
  if (!result.ok) throw new Error(result.error);
  return result.data.slice(1).trimEnd().split("\r\n");
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

describe("toCsv", () => {
  const row = (value: string | null) => toCsv(["h"], [[value]]).split("\r\n")[1];

  it.each([
    ["plain", "plain"],
    ["a,b", '"a,b"'],
    ['say "hi"', '"say ""hi"""'],
    ["two\nlines", '"two\nlines"'],
    ["₹ हिन्दी", "₹ हिन्दी"],
    ["-12.50", "-12.50"],
    [null, ""],
  ])("writes %j", (value, expected) => {
    expect(row(value)).toBe(expected);
  });

  it.each(["=1+1", "+1+1", "-1+1", "@SUM(A1)", "\t=1", " =1", "\r=1"])("neutralises %j", (value) => {
    expect(row(value) ?? "").toMatch(/^"?'/);
  });

  it("starts with a byte order mark", () => {
    expect(toCsv(["h"], []).charCodeAt(0)).toBe(0xfeff);
  });
});

describe("export", () => {
  it("has every income record in the range, whatever its status or currency", async () => {
    const [client] = await db
      .insert(clients)
      .values({ userId: alice, name: '=HYPERLINK("http://evil.test")' })
      .returning({ id: clients.id });
    await db
      .insert(incomeRecords)
      .values([
        income({ clientId: client!.id }),
        income({ paymentDate: "2026-11-01", status: "pending", baseCurrency: "EUR" }),
        income({ paymentDate: "2026-10-31" }),
        income({ paymentDate: "2026-12-01" }),
      ]);
    const lines = await csv("income");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toMatch(/^2026-11-01,Website,,Freelance,Pending,PayPal,1000,USD,92.68,92680,EUR,44.5,0,0,88555.74,$/);
    expect(lines[2]).toContain(`"'=HYPERLINK(""http://evil.test"")"`);
  });

  it("has every expense record in the range", async () => {
    await db.insert(expenseRecords).values({
      userId: alice,
      description: "Licence",
      amount: "49.99",
      currency: "INR",
      exchangeRate: "1",
      convertedAmount: "49.99",
      baseCurrency: "INR",
      category: "software",
      expenseDate: "2026-11-30",
      paymentMethod: "card",
      isDeductible: false,
      taxYearStart: "2026-04-01",
    });
    expect((await csv("expenses"))[1]).toBe("2026-11-30,Licence,,Software,No,Card,49.99,INR,1,49.99,INR,");
  });

  it("never includes another user's records", async () => {
    await db.insert(incomeRecords).values(income({ userId: bob }));
    expect(await csv("income")).toHaveLength(1);
  });

  it("is logged with the range and count, and no figures", async () => {
    await db.insert(incomeRecords).values(income());
    await csv("income");
    const logs = await db.select().from(auditLogs);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ action: "income.export", userId: alice, details: { ...range, count: 1 } });
  });

  it("refuses rather than leaving records out", async () => {
    const rows = Array.from({ length: 1001 }, () => income());
    for (let sent = 0; sent <= MAX_EXPORT_ROWS; sent += rows.length) await db.insert(incomeRecords).values(rows);
    const result = await runAsUser(db, alice, (tx) => exportRecords(tx, alice, "income", range));
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/shorter range/) });
    expect(await db.select().from(auditLogs)).toEqual([]);
  });
});
