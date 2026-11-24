import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { runAsUser } from "@/db/run-as-user";
import { auditLogs, clients, incomeRecords, invoices, users } from "@/db/schema";
import type { Buyer, Seller } from "@/lib/invoice";
import { exportRecords } from "@/server/services/export";
import { type CheckedInvoice, type CheckInput, gstChecks } from "@/server/services/gst/checks";
import { gstRules, registrationLimit } from "@/server/services/gst/rules";
import { gstSummary } from "@/server/services/gst/summary";
import { createTestDb, createUsers, type TestDb } from "../helpers";

const invoice = (change: Partial<CheckedInvoice> = {}): CheckedInvoice => ({
  id: "i1",
  number: "INV/1",
  status: "issued",
  invoiceDate: "2026-11-01",
  taxMode: "igst",
  sacCode: "998314",
  placeOfSupply: "Maharashtra",
  country: "IN",
  fullyPaid: false,
  ...change,
});
const input = (change: Partial<CheckInput> = {}): CheckInput => ({
  today: "2026-11-24",
  turnover: "0",
  state: null,
  gstin: "27ABCDE1234F1Z5",
  gstFiling: "monthly",
  hasLut: false,
  lutValidTo: null,
  invoices: [],
  ...change,
});
const keys = (change: Partial<CheckInput>) => gstChecks(input(change)).map((check) => `${check.level} ${check.key}`);

describe("registration limit", () => {
  it.each([
    [null, "2000000"],
    ["Maharashtra", "2000000"],
    ["Sikkim", "2000000"],
    ["Manipur", "1000000"],
    ["Mizoram", "1000000"],
    ["Nagaland", "1000000"],
    ["Tripura", "1000000"],
  ])("in %s is %s", (state, limit) => {
    expect(registrationLimit(state)).toBe(limit);
  });

  it.each([
    ["1599999", null, []],
    ["1600000", null, ["info registration"]],
    ["2000000", null, ["info registration"]],
    ["2000000.01", null, ["warning registration"]],
    ["800000", "Tripura", ["info registration"]],
    ["1000001", "Tripura", ["warning registration"]],
  ])("turnover %s in %s gives %j", (turnover, state, expected) => {
    expect(keys({ gstin: null, gstFiling: null, turnover, state })).toEqual(expected);
  });

  it("says nothing to someone already registered", () => {
    expect(keys({ turnover: "99999999" })).toEqual([]);
  });

  it("stays marked as pending until an accountant has reviewed it", () => {
    // Change this test in the same commit that records the review.
    expect(gstRules.status).toBe("pending_review");
  });
});

describe("checks", () => {
  it.each([
    [{ gstFiling: null }, ["info filing"]],
    [{ hasLut: true, lutValidTo: null }, ["info lut"]],
    [{ hasLut: true, lutValidTo: "2026-11-23" }, ["warning lut"]],
    [{ hasLut: true, lutValidTo: "2026-11-24" }, ["info lut"]],
    [{ hasLut: true, lutValidTo: "2026-12-24" }, ["info lut"]],
    [{ hasLut: true, lutValidTo: "2026-12-25" }, []],
    [{ gstin: null, gstFiling: null, hasLut: true, lutValidTo: "2026-01-01" }, []],
  ])("%j gives %j", (change, expected) => {
    expect(keys(change)).toEqual(expected);
  });

  it.each([
    [{}, []],
    [{ taxMode: "none", sacCode: null, placeOfSupply: null }, []],
    [{ taxMode: "none", country: "US" }, ["info no-gst-abroad:i1"]],
    [{ taxMode: "none", country: null }, []],
    [{ taxMode: "export_lut", country: "US" }, []],
    [{ taxMode: "export_lut", country: "IN" }, ["warning export-in-india:i1"]],
    [{ taxMode: "cgst_sgst", country: "US" }, ["warning local-abroad:i1"]],
    [{ sacCode: null }, ["warning details:i1"]],
    [{ placeOfSupply: null, status: "draft" }, ["info details:i1"]],
    [{ taxMode: "export_lut", country: "US", invoiceDate: "2025-11-24" }, ["info export-unpaid:i1"]],
    [{ taxMode: "export_lut", country: "US", invoiceDate: "2025-11-23" }, ["warning export-unpaid:i1"]],
    [{ taxMode: "export_lut", country: "US", invoiceDate: "2025-11-23", fullyPaid: true }, []],
    [{ taxMode: "export_lut", country: "US", invoiceDate: "2025-11-23", status: "draft" }, []],
  ] as const)("an invoice with %j gives %j", (change, expected) => {
    expect(keys({ invoices: [invoice(change)], hasLut: true, lutValidTo: "2027-03-31" })).toEqual(expected);
  });

  it("notices a draft export without an LUT", () => {
    expect(keys({ invoices: [invoice({ taxMode: "export_lut", country: "US", status: "draft" })] })).toEqual([
      "warning lut",
    ]);
  });

  it("notices GST charged after the GSTIN was removed", () => {
    expect(keys({ gstin: null, gstFiling: null, invoices: [invoice()] })).toEqual(["warning no-gstin:i1"]);
  });

  it("puts warnings first", () => {
    const list = gstChecks(input({ gstFiling: null, invoices: [invoice({ sacCode: null })] }));
    expect(list.map((check) => check.level)).toEqual(["warning", "info"]);
  });
});

let db: TestDb;
let close: () => Promise<void>;
let alice: string;
let bob: string;
let acme: string;

const seller = { name: "A", address: "B", email: null, phone: null, gstin: null, lutArn: null, paymentInstructions: null } satisfies Seller;
const buyer = { name: "Acme", company: null, address: null, country: "US", email: null, taxId: "US1" } satisfies Buyer;
let next = 0;

async function addInvoice(change: object = {}, userId = alice) {
  const [row] = await db
    .insert(invoices)
    .values({
      userId,
      clientId: acme,
      invoiceNumber: `N${++next}`,
      invoiceDate: "2026-11-10",
      dueDate: "2026-12-10",
      currency: "INR",
      taxMode: "igst",
      taxRate: "18",
      subtotal: "1100",
      discount: "100",
      taxAmount: "180",
      total: "1180",
      status: "issued",
      seller,
      buyer,
      ...change,
    })
    .returning({ id: invoices.id });
  return row!.id;
}
const addIncome = (amount: string, change: object = {}, userId = alice) =>
  db.insert(incomeRecords).values({
    userId,
    description: "x",
    amount,
    currency: "INR",
    exchangeRate: "1",
    convertedAmount: amount,
    baseCurrency: "INR",
    paymentDate: "2026-11-20",
    paymentMethod: "other",
    netReceived: amount,
    category: "freelance",
    taxYearStart: "2026-04-01",
    status: "received",
    ...change,
  });
const summary = (userId = alice) => runAsUser(db, userId, (tx) => gstSummary(tx, { userId, today: "2026-11-24" }));

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
afterEach(() => vi.unstubAllEnvs());
beforeEach(async () => {
  await db.delete(auditLogs);
  await db.delete(users);
  [alice, bob] = await createUsers(db);
  const [client] = await db.insert(clients).values({ userId: alice, name: "Acme" }).returning({ id: clients.id });
  acme = client!.id;
});

describe("turnover", () => {
  it("counts invoices before tax, and income without an invoice", async () => {
    await addInvoice();
    await addIncome("500");
    expect((await summary()).turnover).toMatchObject({ invoiced: "1000", direct: "500", total: "1500" });
  });

  it("does not count a payment as well as its invoice", async () => {
    const id = await addInvoice();
    await addIncome("1000", { invoiceId: id, invoiceAmount: "1180" });
    expect((await summary()).turnover.total).toBe("1000");
  });

  it("counts an invoice in the year it is dated, whenever it is paid", async () => {
    const id = await addInvoice({ invoiceDate: "2026-03-31" });
    await addIncome("1000", { invoiceId: id, invoiceAmount: "1180" });
    expect((await summary()).turnover.total).toBe("0");
  });

  it("values a foreign invoice by what was received, and lists the rest", async () => {
    const id = await addInvoice({ currency: "USD", taxMode: "export_lut", subtotal: "100", discount: "0", taxAmount: "0", total: "100" });
    await addIncome("40", { invoiceId: id, invoiceAmount: "40", currency: "USD", convertedAmount: "3600" });
    expect((await summary()).turnover).toMatchObject({
      total: "3600",
      foreignUnpaid: [{ currency: "USD", total: "60" }],
    });
  });

  it("leaves out drafts, cancelled invoices, pending income, interest and other years", async () => {
    await addInvoice({ status: "draft" });
    await addInvoice({ status: "cancelled" });
    await addIncome("1", { status: "pending" });
    await addIncome("2", { category: "interest" });
    await addIncome("4", { paymentDate: "2026-03-31" });
    await addIncome("8", { baseCurrency: "USD" });
    expect((await summary()).turnover).toMatchObject({ total: "0", interest: "2", otherCurrencyRecords: 1 });
  });

  it("never includes another user's records", async () => {
    await addIncome("999", {}, bob);
    expect((await summary()).turnover.total).toBe("0");
    await addInvoice();
    expect((await summary(bob)).sales).toEqual([]);
  });
});

describe("sales by month", () => {
  it("add up by month, kind and currency", async () => {
    await addInvoice();
    await addInvoice();
    await addInvoice({ taxMode: "export_lut", currency: "USD", taxAmount: "0", total: "1000" });
    await addInvoice({ invoiceDate: "2026-12-01" });
    expect((await summary()).sales).toEqual([
      { month: "2026-11", taxMode: "export_lut", currency: "USD", invoices: 1, taxable: "1000", tax: "0" },
      { month: "2026-11", taxMode: "igst", currency: "INR", invoices: 2, taxable: "2000", tax: "360" },
      { month: "2026-12", taxMode: "igst", currency: "INR", invoices: 1, taxable: "1000", tax: "180" },
    ]);
  });
});

describe("checks on saved invoices", () => {
  it("use the country the invoice was issued with", async () => {
    await addInvoice({ taxMode: "cgst_sgst", sacCode: "998314", placeOfSupply: "x" });
    await db.update(clients).set({ country: "IN" });
    const found = (await summary()).checks.map((check) => check.key.split(":")[0]);
    expect(found).toContain("local-abroad");
  });

  it("still look at an old unpaid export", async () => {
    await addInvoice({ taxMode: "export_lut", invoiceDate: "2025-01-01", sacCode: "998314", placeOfSupply: "x" });
    expect((await summary()).checks.map((check) => check.key.split(":")[0])).toEqual(["export-unpaid"]);
  });
});

describe("the review gate", () => {
  it("hides the limit and the checks in production, and keeps the user's own figures", async () => {
    await addInvoice({ sacCode: null });
    vi.stubEnv("NODE_ENV", "production");
    const result = await summary();
    expect(result).toMatchObject({ reviewed: false, limit: null, checks: [] });
    expect(result.turnover.total).toBe("1000");
    expect(result.sales).toHaveLength(1);
  });
});

describe("invoice export", () => {
  const csv = async (userId = alice) => {
    const range = { from: "2026-11-01", to: "2026-11-30" };
    const result = await runAsUser(db, userId, (tx) => exportRecords(tx, userId, "invoices", range));
    if (!result.ok) throw new Error(result.error);
    return result.data.slice(1).trimEnd().split("\r\n");
  };

  it("splits GST and leaves out drafts, but keeps cancelled numbers", async () => {
    await addInvoice({ invoiceNumber: "A1", taxMode: "cgst_sgst", sacCode: "998314", placeOfSupply: "Goa" });
    await addInvoice({ invoiceNumber: "A2", status: "cancelled" });
    await addInvoice({ invoiceNumber: "A3", status: "draft" });
    const lines = await csv();
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe("2026-11-10,A1,Issued,Acme,US1,United States,998314,Goa,CGST and SGST,INR,1000,18,0,90,90,1180,");
    expect(lines[2]).toContain("A2,Cancelled");
  });

  it("is private", async () => {
    await addInvoice();
    expect(await csv(bob)).toHaveLength(1);
    expect(await db.select().from(auditLogs).where(eq(auditLogs.userId, bob))).toMatchObject([
      { action: "invoices.export" },
    ]);
  });
});
