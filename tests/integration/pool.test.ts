import { EventEmitter } from "node:events";
import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createPool } from "@/db/pool";
import { runAsUser } from "@/db/run-as-user";
import { clients, users } from "@/db/schema";
import { createOnServer } from "../helpers";

afterEach(() => vi.restoreAllMocks());

describe("the connection pool", () => {
  it("survives losing an unused connection", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const pool = createPool("postgres://nobody@127.0.0.1:1/none");
    const lost = new Error("terminating connection due to administrator command");
    expect(() => pool.emit("error", lost, undefined as never)).not.toThrow();
    expect(warn).toHaveBeenCalledWith("A database connection was lost:", lost.message);
    await pool.end();
  });

  it("survives losing a connection in use", async () => {
    const pool = createPool("postgres://nobody@127.0.0.1:1/none");
    const client = new EventEmitter();
    pool.emit("connect", client as never);
    expect(() => client.emit("error", new Error("Connection terminated unexpectedly"))).not.toThrow();
    await pool.end();
  });

  it("fails with an error when there is no server", async () => {
    const pool = createPool("postgres://nobody@127.0.0.1:1/none");
    await expect(pool.query("select 1")).rejects.toThrow();
    await pool.end();
  });
});

const serverUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!serverUrl)("on a real server", () => {
  let server: Awaited<ReturnType<typeof createOnServer>>;
  beforeAll(async () => {
    server = await createOnServer(serverUrl!);
  });
  afterAll(() => server.close());

  // What a database does when it goes to sleep or is restarted.
  const cutConnections = () =>
    server.admin.query("select pg_terminate_backend(pid) from pg_stat_activity where datname = $1", [server.name]);
  const ping = () => server.db.execute(sql`select 1 as one`);

  it("is not reached as a superuser", async () => {
    const { rows } = await server.db.execute(sql`select usesuper from pg_user where usename = current_user`);
    expect(rows).toEqual([{ usesuper: false }]);
  });

  it("works again after every connection is cut", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await Promise.all(Array.from({ length: 5 }, ping));
    await cutConnections();
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect((await ping()).rows).toEqual([{ one: 1 }]);
  });

  it("fails, and then recovers, when cut in the middle of a transaction", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const interrupted = server.db.transaction(async (tx) => {
      await tx.insert(users).values({ name: "Half", email: "half@example.test" });
      await cutConnections();
      await tx.execute(sql`select 1`);
    });
    await expect(interrupted).rejects.toThrow();
    expect(await server.db.select().from(users)).toEqual([]);
  });

  it("never leaves a user's identity on a shared connection", async () => {
    const [alice] = await server.db
      .insert(users)
      .values({ name: "Alice", email: "alice@example.test" })
      .returning({ id: users.id });
    await runAsUser(server.db, alice!.id, (tx) => tx.insert(clients).values({ userId: alice!.id, name: "Client" }));
    const checks = Array.from({ length: 10 }, () =>
      server.db.execute(sql`select current_user = session_user as same, current_setting('app.current_user_id', true) as id`),
    );
    for (const { rows } of await Promise.all(checks)) {
      expect(rows[0]!.same).toBe(true);
      expect(rows[0]!.id || null).toBeNull();
    }
  });
});
