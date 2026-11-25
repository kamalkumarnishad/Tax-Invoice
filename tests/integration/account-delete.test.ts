import { eq, like } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { accounts, auditLogs, clients, rateLimits, sessions, users, verifications } from "@/db/schema";
import type { Auth } from "@/lib/create-auth";
import { requestDeletion } from "@/server/services/account/account";
import { eraseUser } from "@/server/services/account/erase";
import { limits } from "@/server/services/account/limits";
import {
  baseURL,
  call,
  cookieFrom,
  countRows,
  createTestAuth,
  fillAccount,
  type Outbox,
  password,
  signedIn,
  tablesWithUsers,
} from "../account-helpers";
import { createTestDb, type TestDb } from "../helpers";

type Person = Awaited<ReturnType<typeof signedIn>>;

let db: TestDb;
let close: () => Promise<void>;
let auth: Auth;
let asha: Person;
let bina: Person;
let emailIsDown = false;
const outbox: Outbox = [];

const sendEmail = async (message: Outbox[number]) => {
  if (emailIsDown) throw new Error("Email provider returned 503");
  outbox.push(message);
};
const ask = (person: Person, pass = password, now = new Date()) =>
  requestDeletion({ db, auth, headers: person.headers, now }, person.user, pass, { baseURL, sendEmail });
const lastToken = () => outbox.at(-1)!.text.match(/token=(\S+)/)![1]!;
const confirm = (person: Person, body: object) => call(auth, "/delete-user", { body, cookie: person.cookie });
const isSignedIn = async (person: Person) => Boolean(await (await call(auth, "/get-session", { cookie: person.cookie })).json());
const exists = async (person: Person) => (await db.select().from(users).where(eq(users.id, person.user.id))).length === 1;

/** How many rows a person has in each table. */
async function counts(person: Person): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  for (const table of await tablesWithUsers(db)) result[table] = await countRows(db, table, person.user.id);
  return result;
}

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  auth = createTestAuth(db, outbox, async () => {
    if (emailIsDown) throw new Error("Email provider returned 503");
  });
});
afterAll(() => close());
beforeEach(async () => {
  emailIsDown = false;
  vi.spyOn(console, "error").mockImplementation(() => {});
  for (const table of [auditLogs, rateLimits, verifications, sessions, accounts, users]) await db.delete(table);
  asha = await signedIn(db, auth, outbox, "asha@example.test");
  bina = await signedIn(db, auth, outbox, "bina@example.test");
  await fillAccount(db, asha.user.id, "asha");
  await fillAccount(db, bina.user.id, "bina");
});
afterEach(() => vi.restoreAllMocks());

describe("deleting an account", () => {
  it("removes the person from every table, and nobody else", async () => {
    const before = await counts(asha);
    expect(Object.entries(before).filter(([, n]) => n === 0)).toEqual([]);
    const others = await counts(bina);
    await call(auth, "/request-password-reset", { body: { email: asha.user.email } });

    await ask(asha);
    expect((await confirm(asha, { token: lastToken() })).status).toBe(200);

    expect(await exists(asha)).toBe(false);
    expect(Object.values(await counts(asha)).every((n) => n === 0)).toBe(true);
    expect(await db.select().from(verifications).where(eq(verifications.value, asha.user.id))).toEqual([]);
    expect(await db.select().from(rateLimits).where(like(rateLimits.key, `%${asha.user.id}%`))).toEqual([]);
    expect(await exists(bina)).toBe(true);
    expect(await counts(bina)).toEqual(others);
  });

  it("leaves one line that says nothing about the person", async () => {
    await ask(asha);
    await confirm(asha, { token: lastToken() });
    const lines = (await db.select().from(auditLogs)).filter((line) => line.userId !== bina.user.id);
    expect(lines).toMatchObject([
      { userId: null, action: "account.deleted", resourceType: null, resourceId: null, details: null, ipAddress: null, userAgent: null },
    ]);
  });

  it("signs out every device", async () => {
    const other = { ...asha, cookie: cookieFrom(await call(auth, "/sign-in/email", { body: { email: asha.user.email, password } })) };
    expect([await isSignedIn(asha), await isSignedIn(other)]).toEqual([true, true]);
    await ask(asha);
    await confirm(asha, { token: lastToken() });
    expect([await isSignedIn(asha), await isSignedIn(other), await isSignedIn(bina)]).toEqual([false, false, true]);
  });

  it("confirms by email, and is not undone when that email fails", async () => {
    await ask(asha);
    await confirm(asha, { token: lastToken() });
    expect(outbox.at(-1)).toMatchObject({ to: asha.user.email, subject: expect.stringContaining("deleted") });

    await ask(bina);
    emailIsDown = true;
    expect((await confirm(bina, { token: lastToken() })).status).toBe(200);
    expect(await exists(bina)).toBe(false);
  });

  it("lets the same email sign up again, with nothing in the new account", async () => {
    await ask(asha);
    await confirm(asha, { token: lastToken() });
    const again = await signedIn(db, auth, outbox, "asha@example.test");
    expect(again.user.id).not.toBe(asha.user.id);
    expect(await db.select().from(clients).where(eq(clients.userId, again.user.id))).toEqual([]);
  });

  it("is all or nothing", async () => {
    const before = await counts(asha);
    const failing = new Proxy(db, {
      get: (target, key) =>
        key === "transaction"
          ? (work: (tx: unknown) => Promise<unknown>) =>
              target.transaction(async (tx) => {
                await work(tx);
                throw new Error("the connection was lost");
              })
          : Reflect.get(target, key),
    });
    await expect(eraseUser(failing, asha.user.id)).rejects.toThrow("the connection was lost");
    expect(await counts(asha)).toEqual(before);
  });
});

describe("asking for the link", () => {
  it("emails it to the account's own address, and deletes nothing", async () => {
    expect(await ask(asha)).toEqual({ ok: true, data: null });
    expect(outbox.at(-1)).toMatchObject({ to: asha.user.email });
    expect(outbox.at(-1)!.text).toContain(`${baseURL}/app/settings/delete?token=`);
    expect(await exists(asha)).toBe(true);
  });

  it("refuses a wrong password, and sends nothing", async () => {
    const sent = outbox.length;
    expect(await ask(asha, "not the password")).toEqual({ ok: false, error: "The password is incorrect." });
    expect(outbox).toHaveLength(sent);
  });

  it("deletes nothing and leaves no link when the email fails", async () => {
    emailIsDown = true;
    expect(await ask(asha)).toMatchObject({ ok: false, error: expect.stringContaining("nothing was deleted") });
    expect(await exists(asha)).toBe(true);
    expect(await db.select().from(verifications).where(eq(verifications.value, asha.user.id))).toEqual([]);
  });

  it("allows three emails an hour", async () => {
    for (let i = 0; i < 3; i++) expect(await ask(asha)).toMatchObject({ ok: true });
    expect(await ask(asha)).toEqual({ ok: false, error: limits.deletion.message });
  });
});

describe("the link", () => {
  it("works once", async () => {
    await ask(asha);
    const token = lastToken();
    expect((await confirm(asha, { token })).status).toBe(200);
    expect((await confirm(asha, { token })).ok).toBe(false);
  });

  it("stops working when a newer one is sent", async () => {
    await ask(asha);
    const old = lastToken();
    await ask(asha);
    expect((await confirm(asha, { token: old })).ok).toBe(false);
    expect(await exists(asha)).toBe(true);
    expect((await confirm(asha, { token: lastToken() })).ok).toBe(true);
  });

  it("expires after an hour", async () => {
    await ask(asha, password, new Date(Date.now() - 61 * 60_000));
    expect((await confirm(asha, { token: lastToken() })).ok).toBe(false);
    expect(await exists(asha)).toBe(true);
  });

  it("deletes nobody in another person's hands", async () => {
    await ask(asha);
    expect((await confirm(bina, { token: lastToken() })).ok).toBe(false);
    expect([await exists(asha), await exists(bina)]).toEqual([true, true]);
  });

  it("does nothing without signing in", async () => {
    await ask(asha);
    expect((await call(auth, "/delete-user", { body: { token: lastToken() } })).ok).toBe(false);
    expect(await exists(asha)).toBe(true);
  });

  it.each(["", "wrong", "%"])("refuses the token %j", async (token) => {
    await ask(asha);
    expect((await confirm(asha, { token })).ok).toBe(false);
    expect(await exists(asha)).toBe(true);
  });
});

describe("ways around it", () => {
  it.each([{}, { password }, { password, callbackURL: "/" }, { token: null, password }])(
    "refuses the sign-in service's own deletion with %j",
    async (body) => {
      expect((await confirm(asha, body)).ok).toBe(false);
      expect(await exists(asha)).toBe(true);
    },
  );

  it("deletes nothing when a link is only opened", async () => {
    await ask(asha);
    const token = lastToken();
    const response = await call(auth, `/delete-user/callback?token=${token}&callbackURL=/`, { cookie: asha.cookie });
    expect(response.status).toBe(404);
    expect(await exists(asha)).toBe(true);
  });

  it("limits tries at the token", async () => {
    for (let i = 0; i < 5; i++) await confirm(asha, { token: `guess-${i}` });
    expect((await confirm(asha, { token: "guess-6" })).status).toBe(429);
  });

  it("refuses requests from another site", async () => {
    await ask(asha);
    const response = await auth.handler(
      new Request(`${baseURL}/api/auth/delete-user`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://evil.example", cookie: asha.cookie, "x-forwarded-for": "203.0.113.7" },
        body: JSON.stringify({ token: lastToken() }),
      }),
    );
    expect(response.status).toBe(403);
    expect(await exists(asha)).toBe(true);
  });
});
