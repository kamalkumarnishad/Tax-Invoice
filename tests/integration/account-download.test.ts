import { eq, getTableName } from "drizzle-orm";
import { strFromU8, unzipSync } from "fflate";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { accounts, auditLogs, rateLimits, sessions, users, verifications } from "@/db/schema";
import type { Auth } from "@/lib/create-auth";
import { prepareDownload } from "@/server/services/account/account";
import { buildArchive, collectUserData, exportedTables, toStream } from "@/server/services/account/export";
import { limits, withinLimit } from "@/server/services/account/limits";
import { countRows, createTestAuth, fillAccount, type Outbox, password, signedIn, tablesWithUsers } from "../account-helpers";
import { createTestDb, type TestDb } from "../helpers";

type Person = Awaited<ReturnType<typeof signedIn>>;

let db: TestDb;
let close: () => Promise<void>;
let auth: Auth;
let asha: Person;
let bina: Person;
const outbox: Outbox = [];
const now = new Date("2026-11-25T10:00:00Z");
const later = (minutes: number) => new Date(now.getTime() + minutes * 60_000);

const get = (person: Person, pass = password, at = now) =>
  prepareDownload({ db, auth, headers: person.headers, now: at }, person.user, pass);

async function filesOf(person: Person): Promise<Record<string, string>> {
  const result = await get(person);
  if (!result.ok) throw new Error(result.error);
  return Object.fromEntries(Object.entries(unzipSync(result.data)).map(([name, bytes]) => [name, strFromU8(bytes)]));
}

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  auth = createTestAuth(db, outbox);
});
afterAll(() => close());
beforeEach(async () => {
  for (const table of [auditLogs, rateLimits, verifications, sessions, accounts, users]) await db.delete(table);
  asha = await signedIn(db, auth, outbox, "asha@example.test");
  bina = await signedIn(db, auth, outbox, "bina@example.test");
  await fillAccount(db, asha.user.id, "asha");
  await fillAccount(db, bina.user.id, "bina");
});

describe("what the download holds", () => {
  it("covers every table that has a user's data", async () => {
    const covered = exportedTables.map((table) => getTableName(table));
    // Passwords and sign-in tokens only.
    expect([...covered, "accounts"].sort()).toEqual(await tablesWithUsers(db));
  });

  it("has a row of each kind, as the test data does", async () => {
    for (const table of await tablesWithUsers(db)) expect([table, await countRows(db, table, asha.user.id) > 0]).toEqual([table, true]);
    for (const section of await collectUserData(db, asha.user.id)) {
      expect([section.file, section.rows.length > 0]).toEqual([section.file, true]);
    }
  });

  it("has a spreadsheet for each kind, one complete file and a note", async () => {
    const files = await filesOf(asha);
    expect(Object.keys(files).sort()).toEqual(
      [
        "README.txt", "activity.csv", "business-details.csv", "clients.csv", "deadlines-marked.csv", "everything.json",
        "expenses.csv", "income.csv", "invoice-items.csv", "invoices.csv", "profile.csv", "reminders-sent.csv",
        "settings.csv", "signed-in-devices.csv", "tasks.csv", "tax-calculations.csv", "tax-profiles.csv",
      ].sort(),
    );
    expect(files["profile.csv"]).toContain("asha@example.test");
    expect(files["income.csv"]!.split("\r\n")[0]).toContain("Payment date");
    expect(files["income.csv"]).toContain("income-asha,100,USD,92.5,9250,INR,2026-11-20");
    expect(JSON.parse(files["everything.json"]!).tasks).toMatchObject([{ title: "task-asha", dueDate: "2026-12-01" }]);
  });

  it("has nothing of anyone else", async () => {
    const all = Object.values(await filesOf(asha)).join("\n");
    expect(all).toContain("asha");
    expect(all).not.toContain("bina");
    expect(all).not.toContain(bina.user.id);
  });

  it("has no password, sign-in token or full PAN", async () => {
    const all = Object.values(await filesOf(asha)).join("\n");
    const [account] = await db.select().from(accounts).where(eq(accounts.userId, asha.user.id));
    const tokens = await db.select().from(sessions).where(eq(sessions.userId, asha.user.id));
    expect(tokens.length).toBeGreaterThan(0);
    for (const secret of [account!.password!, password, "encrypted-pan", ...tokens.map(({ token }) => token)]) {
      expect(all).not.toContain(secret);
    }
    expect(all).toContain("234F");
  });

  it("is safe to open in a spreadsheet", async () => {
    expect((await filesOf(asha))["clients.csv"]).toContain("'=client-asha");
  });

  it("works for an account with nothing in it", async () => {
    const empty = await signedIn(db, auth, outbox, "empty@example.test");
    const files = await filesOf(empty);
    expect(files["income.csv"]!.trimEnd().split("\r\n")).toHaveLength(1);
    expect(files["profile.csv"]).toContain("empty@example.test");
  });

  it("works for a large account", () => {
    const rows = Array.from({ length: 20_000 }, (_, i) => ({ id: String(i), text: "x".repeat(50) }));
    const files = unzipSync(buildArchive([{ file: "big", columns: ["id", "text"], rows }], "2026-11-25"));
    expect(strFromU8(files["big.csv"]!).trimEnd().split("\r\n")).toHaveLength(20_001);
  });

  it("is sent in pieces that make the same file", async () => {
    const bytes = new Uint8Array(200_000).map((_, i) => i % 251);
    const received = new Uint8Array(await new Response(toStream(bytes)).arrayBuffer());
    expect(Buffer.from(received).equals(Buffer.from(bytes))).toBe(true);
  });
});

describe("who may download", () => {
  it("refuses a wrong password, and records nothing", async () => {
    expect(await get(asha, "not the password")).toEqual({ ok: false, error: "The password is incorrect." });
    expect(await get(asha, "")).toMatchObject({ ok: false });
    expect(await get(asha, "x".repeat(5000))).toMatchObject({ ok: false });
    expect(await db.select().from(auditLogs).where(eq(auditLogs.action, "account.download"))).toEqual([]);
  });

  it("refuses without a session", async () => {
    const result = await prepareDownload({ db, auth, headers: new Headers(), now }, asha.user, password);
    expect(result).toMatchObject({ ok: false });
  });

  it("records a download in the activity list", async () => {
    expect((await filesOf(asha))["activity.csv"]).toContain("account.download");
  });

  it("stops guessing after five tries, even with the right password", async () => {
    for (let i = 0; i < 5; i++) await get(asha, "not the password");
    expect(await get(asha)).toEqual({ ok: false, error: limits.password.message });
    expect(await get(bina)).toMatchObject({ ok: true });
    expect(await get(asha, password, later(16))).toMatchObject({ ok: true });
  });

  it("allows five downloads a day", async () => {
    for (let i = 0; i < 5; i++) expect(await get(asha, password, later(i * 20))).toMatchObject({ ok: true });
    expect(await get(asha, password, later(120))).toEqual({ ok: false, error: limits.download.message });
    expect(await get(asha, password, later(24 * 60 + 1))).toMatchObject({ ok: true });
  });

  it("counts uses at the same moment one by one", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => withinLimit(db, asha.user.id, "password", now)));
    expect(results.filter(Boolean)).toHaveLength(5);
  });
});
