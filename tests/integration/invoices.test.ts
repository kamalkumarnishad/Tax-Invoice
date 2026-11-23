import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runAsUser } from "@/db/run-as-user";
import { auditLogs, businessProfiles, clients, invoiceItems, invoices, users } from "@/db/schema";
import { deleteClient } from "@/server/services/clients";
import {
  cancelInvoice,
  createInvoice,
  deleteInvoice,
  issueInvoice,
  saveBusiness,
  updateInvoice,
} from "@/server/services/invoices";
import { saveTaxProfile } from "@/server/services/settings";
import type { Tx } from "@/server/services/shared";
import { type InvoiceFormValues, invoiceSchema } from "@/validations/invoices";
import type { TaxProfileInput } from "@/validations/settings";
import { createTestDb, createUsers, type TestDb } from "../helpers";

let db: TestDb;
let close: () => Promise<void>;
let alice: string;
let bob: string;
let acme: string;

const as = <T>(userId: string, work: (tx: Tx) => Promise<T>) => runAsUser(db, userId, work);
const find = async (id: string) => (await db.select().from(invoices).where(eq(invoices.id, id)))[0];

const input = (change: Partial<InvoiceFormValues> = {}) =>
  invoiceSchema.parse({
    clientId: acme,
    invoiceNumber: "INV/26-27/0001",
    invoiceDate: "2026-11-24",
    dueDate: "2026-12-24",
    currency: "USD",
    taxMode: "none",
    taxRate: "",
    sacCode: "",
    placeOfSupply: "",
    discount: "",
    items: [
      { description: "Design", quantity: "2", unitPrice: "100" },
      { description: "Build", quantity: "1.5", unitPrice: "33.333" },
    ],
    notes: "",
    ...change,
  });

async function draft(change: Partial<InvoiceFormValues> = {}, userId = alice) {
  const result = await as(userId, (tx) => createInvoice(tx, userId, input(change)));
  if (!result.ok) throw new Error(result.error);
  return result.data.id;
}

const business = {
  businessName: "Alice Studio",
  address: "1 Test Road",
  email: "",
  phone: "",
  paymentInstructions: "Pay by bank",
};
const addBusiness = () => as(alice, (tx) => saveBusiness(tx, alice, business));

const taxProfile: TaxProfileInput = {
  taxYearStart: "2026-04-01",
  ageGroup: "under_60",
  regime: "new_regime",
  businessStructure: "freelancer",
  presumptiveTaxation: false,
  pan: "",
  removePan: false,
  gstin: "27ABCDE1234F1Z5",
  hasLut: true,
  lutArn: "AD2704260000001",
  lutValidFrom: "2026-04-01",
  lutValidTo: "2027-03-31",
};
const addTaxProfile = (change: Partial<TaxProfileInput> = {}) =>
  as(alice, (tx) => saveTaxProfile(tx, alice, { ...taxProfile, ...change }));
const issue = (id: string, userId = alice) => as(userId, (tx) => issueInvoice(tx, userId, id));

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(async () => {
  await db.delete(auditLogs);
  await db.delete(users);
  [alice, bob] = await createUsers(db);
  const [client] = await db
    .insert(clients)
    .values({ userId: alice, name: "Acme", billingAddress: "9 Client St", country: "US" })
    .returning({ id: clients.id });
  acme = client!.id;
});

describe("drafts", () => {
  it("store totals worked out on the server", async () => {
    const id = await draft({ discount: "50" });
    expect(await find(id)).toMatchObject({ status: "draft", subtotal: "250.0000", discount: "50.0000", total: "200.0000" });
    const items = await db.select().from(invoiceItems).orderBy(invoiceItems.sortOrder);
    expect(items.map((item) => [item.description, item.amount])).toEqual([
      ["Design", "200.0000"],
      ["Build", "50.0000"],
    ]);
  });

  it("drop a rate that does not apply", async () => {
    expect(await find(await draft({ taxRate: "18" }))).toMatchObject({ taxRate: "0.00", taxAmount: "0.0000" });
  });

  it("replace their items when changed", async () => {
    const id = await draft();
    const change = input({ items: [{ description: "Only", quantity: "1", unitPrice: "10" }] });
    expect((await as(alice, (tx) => updateInvoice(tx, alice, id, change))).ok).toBe(true);
    expect(await db.select().from(invoiceItems)).toMatchObject([{ description: "Only" }]);
    expect(await find(id)).toMatchObject({ total: "10.0000" });
  });

  it("can be deleted with their items", async () => {
    const id = await draft();
    expect((await as(alice, (tx) => deleteInvoice(tx, alice, id))).ok).toBe(true);
    expect(await db.select().from(invoiceItems)).toEqual([]);
  });

  it.each([
    [{ discount: "251" }, /discount/],
    [{ discount: "250" }, /nothing/],
    [{ currency: "XXX" }, /currency/],
    [{ items: [{ description: "x", quantity: "99999999", unitPrice: "9999999999999" }] }, /too large/],
  ])("refuse %j", async (change, message) => {
    const result = await as(alice, (tx) => createInvoice(tx, alice, input(change)));
    expect(result.ok ? "" : result.error).toMatch(message);
    expect(await db.select().from(invoices)).toEqual([]);
  });

  it("refuse a number already used, and leave the transaction usable", async () => {
    await draft();
    const [result, rows] = await as(alice, async (tx) => [
      await createInvoice(tx, alice, input()),
      await tx.select().from(invoices),
    ]);
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/already used/) });
    expect(rows).toHaveLength(1);
  });

  it("let two users have the same number", async () => {
    await draft();
    const [client] = await db.insert(clients).values({ userId: bob, name: "Bobco" }).returning({ id: clients.id });
    expect(await draft({ clientId: client!.id }, bob)).toBeTruthy();
  });
});

describe("issuing", () => {
  it("needs business details", async () => {
    const result = await issue(await draft());
    expect(result.ok ? "" : result.error).toMatch(/business details/);
  });

  it("copies both parties, so later changes do not alter it", async () => {
    await addBusiness();
    const id = await draft();
    expect((await issue(id)).ok).toBe(true);
    await as(alice, (tx) => saveBusiness(tx, alice, { ...business, businessName: "Renamed" }));
    await db.update(clients).set({ name: "Renamed" }).where(eq(clients.id, acme));
    expect(await find(id)).toMatchObject({
      status: "issued",
      seller: { name: "Alice Studio", address: "1 Test Road", paymentInstructions: "Pay by bank" },
      buyer: { name: "Acme", address: "9 Client St", country: "US" },
    });
    expect((await find(id))!.issuedAt).toBeInstanceOf(Date);
  });

  it("locks the invoice against edits, deletion and issuing again", async () => {
    await addBusiness();
    const id = await draft();
    await issue(id);
    const results = await as(alice, async (tx) => [
      await updateInvoice(tx, alice, id, input({ notes: "changed" })),
      await deleteInvoice(tx, alice, id),
      await issueInvoice(tx, alice, id),
    ]);
    expect(results.every((result) => !result.ok)).toBe(true);
    expect(await find(id)).toMatchObject({ status: "issued", notes: null });
  });

  it.each(["igst", "cgst_sgst"] as const)("needs a GSTIN to charge %s", async (taxMode) => {
    await addBusiness();
    const id = await draft({ taxMode, taxRate: "18" });
    const refused = await issue(id);
    expect(refused.ok ? "" : refused.error).toMatch(/GSTIN/);
    await addTaxProfile();
    expect((await issue(id)).ok).toBe(true);
    expect((await find(id))!.seller).toMatchObject({ gstin: "27ABCDE1234F1Z5" });
  });

  it.each([
    [{}, true],
    [{ lutValidTo: "2026-11-23" }, false],
    [{ lutValidFrom: "2026-11-25" }, false],
    [{ hasLut: false }, false],
    [{ gstin: "" }, false],
  ])("an export under LUT with %j: allowed %s", async (change, allowed) => {
    await addBusiness();
    await addTaxProfile(change);
    const id = await draft({ taxMode: "export_lut" });
    expect((await issue(id)).ok).toBe(allowed);
    if (allowed) expect((await find(id))!.seller).toMatchObject({ lutArn: "AD2704260000001" });
  });
});

describe("cancelling", () => {
  it("keeps the number and only works once issued", async () => {
    await addBusiness();
    const id = await draft();
    const cancel = () => as(alice, (tx) => cancelInvoice(tx, alice, id));
    expect((await cancel()).ok).toBe(false);
    await issue(id);
    expect((await cancel()).ok).toBe(true);
    expect((await cancel()).ok).toBe(false);
    expect(await find(id)).toMatchObject({ status: "cancelled", invoiceNumber: "INV/26-27/0001" });
    const again = await as(alice, (tx) => createInvoice(tx, alice, input()));
    expect(again.ok).toBe(false);
  });
});

describe("ownership", () => {
  it("refuses another user's client", async () => {
    const result = await as(bob, (tx) => createInvoice(tx, bob, input()));
    expect(result.ok ? "" : result.error).toMatch(/client/);
  });

  it("keeps invoices, items and business details private", async () => {
    await addBusiness();
    const id = await draft();
    const seen = await as(bob, async (tx) => [
      ...(await tx.select().from(invoices)),
      ...(await tx.select().from(invoiceItems)),
      ...(await tx.select().from(businessProfiles)),
    ]);
    expect(seen).toEqual([]);
    const results = await as(bob, async (tx) => [
      await updateInvoice(tx, bob, id, input()),
      await issueInvoice(tx, bob, id),
      await cancelInvoice(tx, bob, id),
      await deleteInvoice(tx, bob, id),
    ]);
    expect(results.every((result) => !result.ok)).toBe(true);
    expect(await find(id)).toMatchObject({ status: "draft" });
  });

  it("cannot add items to another user's invoice", async () => {
    const id = await draft();
    const item = { invoiceId: id, description: "x", quantity: "1", unitPrice: "1", amount: "1", sortOrder: 9 };
    await expect(as(bob, (tx) => tx.insert(invoiceItems).values({ ...item, userId: bob }))).rejects.toThrow();
  });

  it("keeps a client that has invoices", async () => {
    await draft();
    const result = await as(alice, (tx) => deleteClient(tx, alice, acme));
    expect(result.ok ? "" : result.error).toMatch(/Archive/);
  });

  it("goes when the account is deleted", async () => {
    await addBusiness();
    await issue(await draft());
    await db.delete(users).where(eq(users.id, alice));
    expect(await db.select().from(invoices)).toEqual([]);
  });
});
