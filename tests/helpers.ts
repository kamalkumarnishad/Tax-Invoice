import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/db/schema";

export async function createTestDb() {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: path.join(import.meta.dirname, "..", "drizzle") });
  return { db, close: () => client.close() };
}

export type TestDb = Awaited<ReturnType<typeof createTestDb>>["db"];

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
