import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runAsUser } from "@/db/run-as-user";
import { auditLogs, clients, incomeRecords, invoices, users } from "@/db/schema";
import { incomePart } from "@/lib/invoice";
import { deleteIncome, updateIncome } from "@/server/services/income";
import { amountPaid, cancelInvoice, createInvoice, issueInvoice, saveBusiness } from "@/server/services/invoices";
import { recordPayment } from "@/server/services/payments";
import { saveTaxProfile } from "@/server/services/settings";
import type { Tx } from "@/server/services/shared";
import { incomeSchema } from "@/validations/income";
import { type InvoiceFormValues, invoiceSchema, type PaymentFormValues, paymentSchema } from "@/validations/invoices";
import { createTestDb, createUsers, type TestDb } from "../helpers";

let db: TestDb;
let close: () => Promise<void>;
let alice: string;
let bob: string;
let acme: string;

const today = "2026-11-24";
const as = <T>(userId: string, work: (tx: Tx) => Promise<T>) => runAsUser(db, userId, work);
const income = () => db.select().from(incomeRecords).orderBy(incomeRecords.createdAt);

async function issued(change: Partial<InvoiceFormValues> = {}) {
  const input = invoiceSchema.parse({
    clientId: acme,
    invoiceNumber: "INV/26-27/0001",
    invoiceDate: today,
    dueDate: "2026-12-24",
    currency: "INR",
    taxMode: "none",
    taxRate: "",
    sacCode: "",
    placeOfSupply: "",
    discount: "",
    items: [{ description: "Work", quantity: "1", unitPrice: "1000" }],
    notes: "",
    ...change,
  });
  const created = await as(alice, (tx) => createInvoice(tx, alice, input));
  if (!created.ok) throw new Error(created.error);
  const result = await as(alice, (tx) => issueInvoice(tx, alice, created.data.id));
  if (!result.ok) throw new Error(result.error);
  return created.data.id;
}

const pay = (id: string, amount: string, change: Partial<PaymentFormValues> = {}, userId = alice) =>
  as(userId, (tx) =>
    recordPayment(
      tx,
      { userId, baseCurrency: "INR", today },
      id,
      paymentSchema.parse({
        amount,
        paymentDate: today,
        paymentMethod: "bank_transfer",
        exchangeRate: "",
        gatewayFee: "",
        bankCharges: "",
        tdsDeducted: "",
        category: "freelance",
        ...change,
      }),
    ),
  );
const paid = (id: string) => as(alice, (tx) => amountPaid(tx, alice, id));

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(async () => {
  await db.delete(auditLogs);
  await db.delete(users);
  [alice, bob] = await createUsers(db);
  const [client] = await db.insert(clients).values({ userId: alice, name: "Acme" }).returning({ id: clients.id });
  acme = client!.id;
  await as(alice, (tx) =>
    saveBusiness(tx, alice, { businessName: "A", address: "B", email: "", phone: "", paymentInstructions: "" }),
  );
  await as(alice, (tx) =>
    saveTaxProfile(tx, alice, {
      taxYearStart: "2026-04-01",
      ageGroup: "under_60",
      regime: "new_regime",
      businessStructure: "freelancer",
      presumptiveTaxation: false,
      pan: "",
      removePan: false,
      gstin: "27ABCDE1234F1Z5",
      gstFiling: "monthly",
      hasLut: false,
      lutArn: "",
      lutValidFrom: "",
      lutValidTo: "",
    }),
  );
});

describe("payments", () => {
  it("add an income record for the client", async () => {
    const id = await issued();
    expect((await pay(id, "400", { tdsDeducted: "40" })).ok).toBe(true);
    expect(await income()).toMatchObject([
      {
        description: "Invoice INV/26-27/0001",
        clientId: acme,
        invoiceId: id,
        invoiceAmount: "400.0000",
        amount: "400.0000",
        netReceived: "360.0000",
        status: "received",
      },
    ]);
    expect(Number(await paid(id))).toBe(400);
  });

  it("cannot go over the balance", async () => {
    const id = await issued();
    await pay(id, "400");
    const result = await pay(id, "600.01");
    expect(result.ok ? "" : result.error).toMatch(/600\.00 is still due/);
    expect((await pay(id, "600")).ok).toBe(true);
    expect((await pay(id, "0.01")).ok).toBe(false);
  });

  it("leave GST out of income, and the parts add up to the taxable value", async () => {
    const id = await issued({ taxMode: "igst", taxRate: "18" });
    for (const amount of ["333.33", "333.33", "513.34"]) expect((await pay(id, amount)).ok).toBe(true);
    const rows = await income();
    expect(rows.map((row) => row.amount)).toEqual(["282.4800", "282.4800", "435.0400"]);
    expect(Number(await paid(id))).toBe(1180);
  });

  it("convert a foreign invoice", async () => {
    const id = await issued({ currency: "USD" });
    expect((await pay(id, "1000")).ok).toBe(false);
    expect((await pay(id, "1000", { exchangeRate: "92.68", gatewayFee: "44.5" })).ok).toBe(true);
    expect((await income())[0]).toMatchObject({ convertedAmount: "92680.0000", netReceived: "88555.7400" });
  });

  it("need an issued invoice and a date that has come", async () => {
    const id = await issued();
    expect((await pay(id, "1", { paymentDate: "2026-11-25" })).ok).toBe(false);
    await as(alice, (tx) => cancelInvoice(tx, alice, id));
    const result = await pay(id, "1");
    expect(result.ok ? "" : result.error).toMatch(/issued/);
    expect(await income()).toEqual([]);
  });

  it("stop the invoice being cancelled until they are deleted", async () => {
    const id = await issued();
    await pay(id, "400");
    const cancel = () => as(alice, (tx) => cancelInvoice(tx, alice, id));
    expect((await cancel()).ok).toBe(false);
    const [record] = await income();
    await as(alice, (tx) => deleteIncome(tx, alice, record!.id));
    expect(Number(await paid(id))).toBe(0);
    expect((await cancel()).ok).toBe(true);
  });

  it("cannot be recorded against another user's invoice", async () => {
    const id = await issued();
    expect((await pay(id, "400", {}, bob)).ok).toBe(false);
    const stolen = { ...base, userId: bob, invoiceId: id, invoiceAmount: "1" };
    await expect(as(bob, (tx) => tx.insert(incomeRecords).values(stolen))).rejects.toThrow();
  });

  it("go with the account when it is deleted", async () => {
    await pay(await issued(), "400");
    await db.delete(users).where(eq(users.id, alice));
    expect(await income()).toEqual([]);
    expect(await db.select().from(invoices)).toEqual([]);
  });
});

const base = {
  description: "x",
  amount: "1",
  currency: "INR",
  exchangeRate: "1",
  convertedAmount: "1",
  baseCurrency: "INR",
  paymentDate: today,
  paymentMethod: "other",
  netReceived: "1",
  category: "freelance",
  taxYearStart: "2026-04-01",
  status: "received",
};

describe("editing a payment's income record", () => {
  const form = {
    description: "Invoice INV/26-27/0001",
    amount: "400",
    currency: "INR",
    exchangeRate: "",
    paymentDate: today,
    paymentMethod: "bank_transfer",
    gatewayFee: "",
    bankCharges: "",
    tdsDeducted: "",
    category: "freelance",
    status: "received",
    notes: "",
  } as const;

  it.each([
    [{ bankCharges: "5" }, true],
    [{ notes: "late" }, true],
    [{ amount: "401" }, false],
    [{ status: "pending" }, false],
    [{ clientId: "" }, false],
    [{ currency: "USD", exchangeRate: "90" }, false],
  ] as const)("%j: allowed %s", async (change, allowed) => {
    const id = await issued();
    await pay(id, "400");
    const [record] = await income();
    const input = incomeSchema.parse({ ...form, clientId: acme, ...change });
    const result = await as(alice, (tx) => updateIncome(tx, { userId: alice, today }, record!.id, input));
    expect(result.ok).toBe(allowed);
    expect((await income())[0]).toMatchObject({ invoiceId: id, invoiceAmount: "400.0000" });
  });
});

describe("incomePart", () => {
  const whole = { alreadySettled: "0", alreadyIncome: "0", total: "118", taxable: "100", decimals: 2 };
  it.each([
    [{ settled: "118" }, "100"],
    [{ settled: "59" }, "50"],
    [{ settled: "10" }, "8.47"],
    [{ settled: "108", alreadySettled: "10", alreadyIncome: "8.47" }, "91.53"],
    [{ settled: "0.01", alreadySettled: "117.99", alreadyIncome: "100" }, "0"],
  ])("%j is %s", (change, expected) => {
    expect(incomePart({ ...whole, ...change })).toBe(expected);
  });
});
