import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runAsUser } from "@/db/run-as-user";
import { auditLogs, clients, incomeRecords, invoices, referenceRates, users } from "@/db/schema";
import type { Buyer, Seller } from "@/lib/invoice";
import { currencyGains } from "@/server/services/currency-analyzer/gains";
import { recordPayment } from "@/server/services/payments";
import { createTestDb, createUsers, type TestDb } from "../helpers";

let db: TestDb;
let close: () => Promise<void>;
let alice: string;
let bob: string;
let acme: string;
let next = 0;

const seller = { name: "A", address: "B", email: null, phone: null, gstin: "X", lutArn: null, paymentInstructions: null } satisfies Seller;
const buyer = { name: "Jo", company: "Acme Inc", address: null, country: "US", email: null, taxId: null } satisfies Buyer;

// One euro is 100 rupees throughout, so the rupee moves only through the other currencies.
const rates: Record<string, Record<string, string>> = {
  "2026-10-01": { INR: "100", USD: "1.25", JPY: "200", AED: "4" },
  "2026-11-02": { INR: "100", USD: "1", JPY: "160", AED: "4" },
  "2026-11-20": { INR: "100", USD: "0.8", JPY: "125", AED: "4" },
  "2026-11-23": { INR: "100", USD: "1.6", JPY: "100" },
};

async function addInvoice(change: object = {}, userId = alice, clientId = acme) {
  const [row] = await db
    .insert(invoices)
    .values({
      userId,
      clientId,
      invoiceNumber: `N${++next}`,
      invoiceDate: "2026-10-01",
      dueDate: "2026-11-01",
      currency: "USD",
      taxMode: "none",
      subtotal: "1000",
      total: "1000",
      status: "issued",
      seller,
      buyer,
      ...change,
    })
    .returning({ id: invoices.id });
  return row!.id;
}

const addIncome = (change: object = {}, userId = alice) =>
  db.insert(incomeRecords).values({
    userId,
    description: "Payment",
    amount: "100",
    currency: "USD",
    exchangeRate: "98",
    convertedAmount: "9800",
    baseCurrency: "INR",
    paymentDate: "2026-11-02",
    paymentMethod: "wise",
    netReceived: "9800",
    category: "freelance",
    taxYearStart: "2026-04-01",
    status: "received",
    ...change,
  });

const pay = (invoiceId: string, change: object = {}) =>
  runAsUser(db, alice, (tx) =>
    recordPayment(tx, { userId: alice, baseCurrency: "INR", today: "2026-11-24" }, invoiceId, {
      amount: "1000",
      paymentDate: "2026-11-02",
      paymentMethod: "wise",
      exchangeRate: "98",
      gatewayFee: "0",
      bankCharges: "0",
      tdsDeducted: "0",
      category: "freelance",
      ...change,
    }),
  );

const gains = (options: { userId?: string; currency?: string; from?: string; to?: string; today?: string } = {}) => {
  const { userId = alice, currency = "INR", from = "2026-04-01", to = "2027-03-31", today = "2026-11-24" } = options;
  return runAsUser(db, userId, (tx) => currencyGains(tx, { userId, currency, today, range: { from, to } }));
};

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(referenceRates).values(
    Object.entries(rates).flatMap(([rateDate, day]) =>
      Object.entries(day).map(([currency, rate]) => ({
        currency,
        rateDate,
        rate,
        baseCurrency: currency === "AED" ? "USD" : "EUR",
        source: "test",
      })),
    ),
  );
});
afterAll(() => close());
beforeEach(async () => {
  await db.delete(auditLogs);
  await db.delete(users);
  [alice, bob] = await createUsers(db);
  const [client] = await db.insert(clients).values({ userId: alice, name: "Acme" }).returning({ id: clients.id });
  acme = client!.id;
});

describe("a paid invoice", () => {
  it("compares the invoice date, the payment date and the recorded rate", async () => {
    const id = await addInvoice();
    await pay(id, { gatewayFee: "10", bankCharges: "20", tdsDeducted: "100" });
    const { paid, totals } = await gains();
    // 80 rupees a dollar when invoiced, 100 when paid, 98 recorded.
    expect(paid).toMatchObject([
      {
        client: "Acme",
        currency: "USD",
        amount: "1000",
        recordedRate: "98",
        invoice: { id, date: "2026-10-01" },
        invoiceRate: { date: "2026-10-01", rate: "80" },
        paymentRate: { date: "2026-11-02", rate: "100" },
        lookedUp: false,
        breakdown: {
          start: "80000.00",
          movement: "20000",
          margin: "-2000",
          fees: "1000",
          tds: "100",
          received: "96900",
        },
      },
    ]);
    expect(totals).toEqual({ movement: "20000", margin: "-2000", fees: "1000", tds: "100", received: "96900" });
  });

  it("works out each part payment on its own", async () => {
    const id = await addInvoice();
    await pay(id, { amount: "400" });
    await pay(id, { amount: "600", paymentDate: "2026-11-20", exchangeRate: "125" });
    const { paid, totals, unpaid } = await gains();
    expect(paid.map((row) => [row.amount, row.breakdown!.movement])).toEqual([
      ["600", "27000"],
      ["400", "8000"],
    ]);
    expect(totals.movement).toBe("35000");
    expect(unpaid).toEqual([]);
  });

  it("leaves GST out", async () => {
    const id = await addInvoice({ taxMode: "igst", taxRate: "18", taxAmount: "180", total: "1180" });
    await pay(id, { amount: "1180" });
    expect((await gains()).paid).toMatchObject([{ amount: "1000", breakdown: { start: "80000.00", movement: "20000" } }]);
  });

  it.each(["2026-11-02", "2026-11-20"])("has no movement when paid on or before %s", async (invoiceDate) => {
    const id = await addInvoice({ invoiceDate });
    await pay(id);
    expect((await gains()).paid).toMatchObject([
      { invoice: { id }, invoiceRate: null, breakdown: { start: "100000.00", movement: null, margin: "-2000" } },
    ]);
  });

  it("uses the last working day before a weekend", async () => {
    const id = await addInvoice();
    await pay(id, { paymentDate: "2026-11-22", exchangeRate: "125" });
    expect((await gains()).paid).toMatchObject([{ paymentRate: { date: "2026-11-20", rate: "125" }, lookedUp: true }]);
  });

  it("is listed, but not added up, when a rate is missing", async () => {
    const id = await addInvoice({ invoiceDate: "2020-01-01" });
    await pay(id);
    const result = await gains();
    expect(result.paid).toMatchObject([{ invoiceRate: null, paymentRate: { rate: "100" }, breakdown: null }]);
    expect(result).toMatchObject({ missing: 1, byCurrency: [], totals: { received: "0" } });
  });
});

describe("other foreign income", () => {
  it("has a margin but no movement", async () => {
    await addIncome();
    expect((await gains()).paid).toMatchObject([
      { invoice: null, breakdown: { start: "10000.00", movement: null, margin: "-200", fees: "0" } },
    ]);
  });

  it("counts rates that were probably looked up", async () => {
    await addIncome({ exchangeRate: "100.01", convertedAmount: "10001", netReceived: "10001" });
    await addIncome();
    expect((await gains()).lookedUp).toBe(1);
  });

  it("covers yen and dirhams", async () => {
    await addIncome({ currency: "JPY", exchangeRate: "0.6", convertedAmount: "60", netReceived: "60" });
    await addIncome({ currency: "AED", exchangeRate: "24", convertedAmount: "2400", netReceived: "2400" });
    const { byCurrency } = await gains();
    expect(byCurrency).toMatchObject([
      { code: "AED", payments: 1, amount: "100", margin: "-100", received: "2400" },
      { code: "JPY", payments: 1, amount: "100", margin: "-2.5", received: "60" },
    ]);
  });

  it("leaves out pending income, home currency, other years and other default currencies", async () => {
    await addIncome({ status: "pending" });
    await addIncome({ currency: "INR", exchangeRate: "1", convertedAmount: "100", netReceived: "100" });
    await addIncome({ paymentDate: "2026-03-31" });
    await addIncome({ baseCurrency: "USD", currency: "EUR" });
    expect(await gains()).toMatchObject({ paid: [], byCurrency: [], otherCurrencyRecords: 1 });
  });

  it("works in another home currency", async () => {
    await addIncome({ baseCurrency: "JPY", exchangeRate: "150", convertedAmount: "15000", netReceived: "15000" });
    // 160 yen a dollar that day, in whole yen.
    expect((await gains({ currency: "JPY" })).paid).toMatchObject([{ breakdown: { start: "16000", margin: "-1000" } }]);
  });
});

describe("unpaid invoices", () => {
  it("compare the invoice date with today", async () => {
    const id = await addInvoice();
    const result = await gains({ today: "2026-11-20" });
    expect(result.unpaid).toMatchObject([
      { id, client: "Acme Inc", amount: "1000", result: { start: "80000.00", now: "125000.00", movement: "45000" } },
    ]);
    expect(result.unpaidMovement).toBe("45000");
    expect(result.totals.movement).toBe("0");
  });

  it("count only what is left, without GST", async () => {
    const id = await addInvoice({ taxMode: "igst", taxRate: "18", taxAmount: "180", total: "1180" });
    await pay(id, { amount: "295" });
    expect((await gains()).unpaid).toMatchObject([{ amount: "750" }]);
  });

  it("can show a loss", async () => {
    await addInvoice({ invoiceDate: "2026-11-20" });
    expect((await gains()).unpaidMovement).toBe("-62500");
  });

  it("have no movement when dated today or later", async () => {
    await addInvoice({ invoiceDate: "2026-11-24" });
    await addInvoice({ invoiceDate: "2027-01-01" });
    expect((await gains()).unpaid.map((row) => row.result?.movement)).toEqual(["0", "0"]);
  });

  it("leave out drafts, cancelled invoices and the home currency", async () => {
    await addInvoice({ status: "draft" });
    await addInvoice({ status: "cancelled" });
    await addInvoice({ currency: "INR" });
    expect((await gains()).unpaid).toEqual([]);
  });

  it("appear whatever year is chosen", async () => {
    await addInvoice();
    expect((await gains({ from: "2025-04-01", to: "2026-03-31" })).unpaid).toHaveLength(1);
  });

  it("are counted as missing without a rate", async () => {
    await addInvoice({ invoiceDate: "2020-01-01" });
    expect(await gains()).toMatchObject({ unpaidMissing: 1, unpaidMovement: "0" });
  });
});

describe("privacy", () => {
  it("never shows another user's records", async () => {
    await addIncome({}, alice);
    await addInvoice();
    expect(await gains({ userId: bob })).toMatchObject({ paid: [], unpaid: [], otherCurrencyRecords: 0 });
  });

  it("holds even when the wrong user id is asked for", async () => {
    await addIncome({}, alice);
    await addInvoice();
    const options = { userId: alice, currency: "INR", today: "2026-11-24", range: { from: "2026-04-01", to: "2027-03-31" } };
    expect(await runAsUser(db, bob, (tx) => currencyGains(tx, options))).toMatchObject({ paid: [], unpaid: [] });
  });

  it("changes nothing", async () => {
    await addIncome();
    const before = await db.select().from(incomeRecords);
    await gains();
    expect(await db.select().from(incomeRecords)).toEqual(before);
    expect(await db.select().from(auditLogs)).toEqual([]);
  });
});
