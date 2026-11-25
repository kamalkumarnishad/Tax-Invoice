import { eq, sql } from "drizzle-orm";
import {
  auditLogs,
  businessProfiles,
  clients,
  complianceMarks,
  complianceTasks,
  expenseRecords,
  incomeRecords,
  invoiceItems,
  invoices,
  reminderLog,
  taxCalculations,
  taxJurisdictions,
  taxProfiles,
  users,
} from "@/db/schema";
import { type Auth, createAuth } from "@/lib/create-auth";
import type { TestDb } from "./helpers";

export const baseURL = "http://localhost:3000";
export const password = "correct horse battery";

/** Marks one person's records, so that a test can look for another person's. */
export const marker = (email: string) => email.split("@")[0]!;

export type Outbox = { to: string; subject: string; text: string }[];

export function createTestAuth(db: TestDb, outbox: Outbox, sendEmail?: () => Promise<void>): Auth {
  return createAuth({
    db,
    secret: "test-secret-that-is-at-least-32-characters",
    baseURL,
    sendEmail: async (message) => {
      await sendEmail?.();
      outbox.push(message);
    },
  });
}

export function call(auth: Auth, path: string, init: { body?: unknown; cookie?: string; ip?: string } = {}) {
  return auth.handler(
    new Request(path.startsWith("http") ? path : `${baseURL}/api/auth${path}`, {
      method: init.body ? "POST" : "GET",
      headers: {
        "content-type": "application/json",
        origin: baseURL,
        "x-forwarded-for": init.ip ?? "203.0.113.1",
        ...(init.cookie ? { cookie: init.cookie } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    }),
  );
}

export const cookieFrom = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");

/** Signs up, verifies and signs in a person. */
export async function signedIn(db: TestDb, auth: Auth, outbox: Outbox, email: string) {
  await call(auth, "/sign-up/email", { body: { name: marker(email), email, password }, ip: "203.0.113.9" });
  const response = await call(auth, outbox.at(-1)!.text.match(/https?:\/\/\S+/)![0]);
  const [user] = await db.select().from(users).where(eq(users.email, email));
  const cookie = cookieFrom(response);
  return { user: user!, cookie, headers: new Headers({ cookie }) };
}

/** One record in every table that holds a person's data, with their marker in it. */
export async function fillAccount(db: TestDb, userId: string, name: string) {
  const [india] = await db.select().from(taxJurisdictions).where(eq(taxJurisdictions.code, "IN"));
  await db.insert(taxProfiles).values({
    userId,
    jurisdictionId: india!.id,
    taxYearStart: "2026-04-01",
    taxYearEnd: "2027-03-31",
    panEncrypted: `encrypted-pan-${name}`,
    panLast4: "234F",
    lutArn: `lut-${name}`,
  });
  await db.insert(businessProfiles).values({ userId, businessName: `business-${name}`, address: "x" });
  const [client] = await db.insert(clients).values({ userId, name: `=client-${name}` }).returning({ id: clients.id });
  const [invoice] = await db
    .insert(invoices)
    .values({
      userId,
      clientId: client!.id,
      invoiceNumber: "INV/1",
      invoiceDate: "2026-11-01",
      dueDate: "2026-11-30",
      currency: "USD",
      taxMode: "none",
      subtotal: "100",
      total: "100",
      status: "issued",
      seller: { name: `seller-${name}`, address: "", email: null, phone: null, gstin: null, lutArn: null, paymentInstructions: null },
      buyer: { name: "Buyer", company: null, address: null, country: "US", email: null, taxId: null },
    })
    .returning({ id: invoices.id });
  await db.insert(invoiceItems).values({
    userId,
    invoiceId: invoice!.id,
    description: `item-${name}`,
    quantity: "1",
    unitPrice: "100",
    amount: "100",
    sortOrder: 0,
  });
  await db.insert(incomeRecords).values({
    userId,
    clientId: client!.id,
    invoiceId: invoice!.id,
    invoiceAmount: "100",
    description: `income-${name}`,
    amount: "100",
    currency: "USD",
    exchangeRate: "92.5",
    convertedAmount: "9250",
    baseCurrency: "INR",
    paymentDate: "2026-11-20",
    paymentMethod: "wise",
    netReceived: "9250",
    category: "freelance",
    taxYearStart: "2026-04-01",
    status: "received",
  });
  await db.insert(expenseRecords).values({
    userId,
    description: `expense-${name}`,
    amount: "10",
    currency: "INR",
    exchangeRate: "1",
    convertedAmount: "10",
    baseCurrency: "INR",
    category: "software",
    expenseDate: "2026-11-20",
    paymentMethod: "upi",
    isDeductible: true,
    taxYearStart: "2026-04-01",
  });
  await db.insert(taxCalculations).values({
    userId,
    taxYearStart: "2026-04-01",
    ruleId: "rule",
    ruleVersion: "1",
    input: { note: `calculation-${name}` },
    rules: {},
    results: {},
    // Only its shape matters here, not the figures.
  } as never);
  await db.insert(complianceTasks).values({ userId, title: `task-${name}`, dueDate: "2026-12-01" });
  await db.insert(complianceMarks).values({ userId, deadlineKey: `mark-${name}`, status: "completed" });
  await db.insert(reminderLog).values({ userId, itemKey: `reminder-${name}`, dueDate: "2026-12-01", daysBefore: 7 });
  await db.insert(auditLogs).values({ userId, action: `action-${name}`, ipAddress: `ip-${name}` });
}

/** Every table with a `user_id` column, as the database itself sees it. */
export async function tablesWithUsers(db: TestDb): Promise<string[]> {
  const { rows } = await db.execute<{ name: string }>(sql`
    select table_name as name from information_schema.columns
    where table_schema = 'public' and column_name = 'user_id' order by 1`);
  return rows.map(({ name }) => name);
}

export async function countRows(db: TestDb, table: string, userId: string): Promise<number> {
  const { rows } = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from ${sql.identifier(table)} where user_id = ${userId}`,
  );
  return rows[0]!.n;
}
