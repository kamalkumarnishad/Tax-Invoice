import { randomUUID } from "node:crypto";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzleServer } from "drizzle-orm/node-postgres";
import { migrate as migrateServer } from "drizzle-orm/node-postgres/migrator";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { Pool } from "pg";
import { createPool } from "@/db/pool";
import * as schema from "@/db/schema";

const migrationsFolder = path.join(import.meta.dirname, "..", "drizzle");

async function createInMemory() {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });
  return { db, close: () => client.close() };
}

export type TestDb = Awaited<ReturnType<typeof createInMemory>>["db"];

/** A new, empty database on a Postgres server, reached as the app reaches one in production. */
export async function createOnServer(serverUrl: string) {
  const name = `test_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: serverUrl, max: 1 });
  await admin.query(`create database ${name}`);
  const url = new URL(serverUrl);
  url.pathname = `/${name}`;
  const pool = createPool(url.href);
  const db = drizzleServer(pool, { schema });
  await migrateServer(db, { migrationsFolder });
  return {
    db,
    admin,
    name,
    close: async () => {
      await pool.end();
      await admin.query(`drop database ${name} with (force)`);
      await admin.end();
    },
  };
}

/** In memory, or on the server in TEST_DATABASE_URL, whose files must then run one at a time. */
export async function createTestDb(): Promise<{ db: TestDb; close: () => Promise<void> }> {
  const serverUrl = process.env.TEST_DATABASE_URL;
  if (!serverUrl) return createInMemory();
  const { db, close } = await createOnServer(serverUrl);
  // Both are the same Drizzle interface over a different driver.
  return { db: db as unknown as TestDb, close };
}

/** Two users, to check that neither can reach the other's data. */
export async function createUsers(db: TestDb): Promise<[string, string]> {
  const rows = await db
    .insert(schema.users)
    .values([
      { name: "Alice", email: "alice@example.test" },
      { name: "Bob", email: "bob@example.test" },
    ])
    .returning({ id: schema.users.id });
  return [rows[0]!.id, rows[1]!.id];
}
