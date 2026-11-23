import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runAsUser } from "@/db/run-as-user";
import { auditLogs, clients, users } from "@/db/schema";
import { createClient, deleteClient, setClientActive, updateClient } from "@/server/services/clients";
import { blankClient, clientSchema } from "@/validations/clients";
import { containsPattern, parseListParams } from "@/validations/common";
import { createTestDb, createUsers, type TestDb } from "../helpers";

let db: TestDb;
let close: () => Promise<void>;
let alice: string;
let bob: string;

const input = { ...blankClient, name: "Acme", currency: "USD", country: "US" };

async function addClient(userId: string) {
  const result = await runAsUser(db, userId, (tx) => createClient(tx, userId, input));
  if (!result.ok) throw new Error(result.error);
  return result.data.id;
}
const find = async (id: string) => (await db.select().from(clients).where(eq(clients.id, id)))[0];

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());
beforeEach(async () => {
  await db.delete(auditLogs);
  await db.delete(users);
  [alice, bob] = await createUsers(db);
});

describe("clients", () => {
  it("creates, updates, archives, restores and deletes", async () => {
    const id = await addClient(alice);
    expect(await find(id)).toMatchObject({ userId: alice, name: "Acme", company: null, isActive: true });

    await runAsUser(db, alice, (tx) => updateClient(tx, alice, id, { ...input, name: "Acme Ltd" }));
    await runAsUser(db, alice, (tx) => setClientActive(tx, alice, id, false));
    expect(await find(id)).toMatchObject({ name: "Acme Ltd", isActive: false });

    await runAsUser(db, alice, (tx) => setClientActive(tx, alice, id, true));
    expect((await runAsUser(db, alice, (tx) => deleteClient(tx, alice, id))).ok).toBe(true);
    expect(await find(id)).toBeUndefined();

    const actions = (await db.select().from(auditLogs)).map((row) => row.action);
    expect(actions).toEqual(["client.create", "client.update", "client.archive", "client.restore", "client.delete"]);
  });

  it("does not touch another user's client", async () => {
    const id = await addClient(bob);
    const results = await runAsUser(db, alice, async (tx) => [
      await updateClient(tx, alice, id, { ...input, name: "Stolen" }),
      await setClientActive(tx, alice, id, false),
      await deleteClient(tx, alice, id),
    ]);
    expect(results.every((r) => !r.ok)).toBe(true);
    expect(await find(id)).toMatchObject({ name: "Acme", isActive: true });
  });

  it("hides other users' clients even from an unfiltered query", async () => {
    await addClient(bob);
    expect(await runAsUser(db, alice, (tx) => tx.select().from(clients))).toEqual([]);
  });

  it("refuses a currency that is not offered", async () => {
    const result = await runAsUser(db, alice, (tx) => createClient(tx, alice, { ...input, currency: "XXX" }));
    expect(result.ok).toBe(false);
  });

  it("stores markup as plain text", async () => {
    const name = "<script>alert(1)</script>";
    const result = await runAsUser(db, alice, (tx) => createClient(tx, alice, { ...input, name }));
    expect(result.ok && (await find(result.data.id))!.name).toBe(name);
  });
});

describe("client input", () => {
  it.each([
    [{ name: "  " }, "name"],
    [{ email: "nope" }, "email"],
    [{ country: "ZZ" }, "country"],
    [{ notes: "x".repeat(2001) }, "notes"],
  ])("rejects %j", (change, field) => {
    const result = clientSchema.safeParse({ ...input, ...change });
    expect(result.error?.issues[0]?.path).toEqual([field]);
  });
});

describe("list parameters", () => {
  it.each([
    [{}, { q: "", page: 1 }],
    [{ q: " a ", page: "3" }, { q: "a", page: 3 }],
    [{ q: ["a", "b"], page: "-1" }, { q: "", page: 1 }],
    [{ page: "abc" }, { q: "", page: 1 }],
  ])("reads %j", (raw, expected) => {
    expect(parseListParams(raw)).toEqual(expected);
  });

  it("escapes search wildcards", () => {
    expect(containsPattern("50%_\\")).toBe("%50\\%\\_\\\\%");
  });
});
