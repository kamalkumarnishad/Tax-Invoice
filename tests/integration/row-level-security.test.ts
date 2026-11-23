import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runAsUser } from "@/db/run-as-user";
import { auditLogs, countries, taxJurisdictions, taxProfiles, users, userSettings } from "@/db/schema";
import { createTestDb, type TestDb } from "../helpers";

let db: TestDb;
let close: () => Promise<void>;
let alice: string;
let bob: string;
let indiaId: string;

const year = { taxYearStart: "2026-04-01", taxYearEnd: "2027-03-31" };

/** Drizzle wraps driver errors, so look at the underlying Postgres message. */
async function postgresError(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    const cause = (error as Error).cause;
    return cause instanceof Error ? cause.message : (error as Error).message;
  }
  throw new Error("expected the query to be rejected");
}

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  const [india] = await db.select().from(taxJurisdictions).where(eq(taxJurisdictions.code, "IN"));
  indiaId = india!.id;
});

afterAll(() => close());

beforeEach(async () => {
  await db.delete(auditLogs);
  await db.delete(users);
  const rows = await db
    .insert(users)
    .values([
      { name: "Alice", email: "alice@example.test" },
      { name: "Bob", email: "bob@example.test" },
    ])
    .returning({ id: users.id });
  alice = rows[0]!.id;
  bob = rows[1]!.id;
  await db.insert(taxProfiles).values([
    { userId: alice, jurisdictionId: indiaId, ...year },
    { userId: bob, jurisdictionId: indiaId, ...year },
  ]);
});

describe("row level security", () => {
  it("shows a user only their own rows", async () => {
    const rows = await runAsUser(db, alice, (tx) => tx.select().from(taxProfiles));
    expect(rows.map((r) => r.userId)).toEqual([alice]);
  });

  it("hides another user's row even when its id is known", async () => {
    const [bobs] = await db.select().from(taxProfiles).where(eq(taxProfiles.userId, bob));
    const rows = await runAsUser(db, alice, (tx) =>
      tx.select().from(taxProfiles).where(eq(taxProfiles.id, bobs!.id)),
    );
    expect(rows).toEqual([]);
  });

  it("does not update or delete another user's row", async () => {
    const updated = await runAsUser(db, alice, (tx) =>
      tx.update(taxProfiles).set({ gstin: "X" }).where(eq(taxProfiles.userId, bob)).returning(),
    );
    const deleted = await runAsUser(db, alice, (tx) =>
      tx.delete(taxProfiles).where(eq(taxProfiles.userId, bob)).returning(),
    );
    expect(updated).toEqual([]);
    expect(deleted).toEqual([]);
    expect(await db.select().from(taxProfiles).where(eq(taxProfiles.userId, bob))).toHaveLength(1);
  });

  it("rejects inserting a row for another user", async () => {
    const message = await postgresError(
      runAsUser(db, alice, (tx) => tx.insert(userSettings).values({ userId: bob })),
    );
    expect(message).toMatch(/row-level security/);
  });

  it("rejects handing a row over to another user", async () => {
    const message = await postgresError(
      runAsUser(db, alice, (tx) =>
        tx.update(taxProfiles).set({ userId: bob }).where(eq(taxProfiles.userId, alice)),
      ),
    );
    expect(message).toMatch(/row-level security/);
  });

  it("shows nothing when no user is set", async () => {
    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql`set local role taxpilot_app`);
      return tx.select().from(taxProfiles);
    });
    expect(rows).toEqual([]);
  });

  it("does not carry the user over to the next transaction", async () => {
    await runAsUser(db, alice, (tx) => tx.select().from(taxProfiles));
    const result = await db.execute<{ id: string | null; role: string }>(
      sql`select app_current_user_id() as id, current_user::text as role`,
    );
    expect(result.rows[0]!.id).toBeNull();
    expect(result.rows[0]!.role).not.toBe("taxpilot_app");
  });

  it.each(["sessions", "accounts", "verifications", "users"])("blocks the app role from reading %s", async (table) => {
    const message = await postgresError(
      runAsUser(db, alice, (tx) => tx.execute(sql`select * from ${sql.identifier(table)}`)),
    );
    expect(message).toMatch(/permission denied/);
  });

  it("keeps audit logs append-only", async () => {
    await runAsUser(db, alice, (tx) => tx.insert(auditLogs).values({ userId: alice, action: "test" }));
    const message = await postgresError(runAsUser(db, alice, (tx) => tx.delete(auditLogs)));
    expect(message).toMatch(/permission denied/);
  });
});

describe("schema rules", () => {
  it("allows one profile per jurisdiction and tax year", async () => {
    const message = await postgresError(
      runAsUser(db, alice, (tx) => tx.insert(taxProfiles).values({ userId: alice, jurisdictionId: indiaId, ...year })),
    );
    expect(message).toMatch(/tax_profiles_one_per_year/);
  });

  it("marks only India as supported", async () => {
    const supported = await db.select().from(countries).where(eq(countries.isSupported, true));
    expect(supported.map((c) => c.code)).toEqual(["IN"]);
  });
});
