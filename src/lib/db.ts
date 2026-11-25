import "server-only";
import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { env } from "@/config/env";
import * as schema from "@/db/schema";
import { runAsUser } from "@/db/run-as-user";

export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

async function connect(): Promise<Database> {
  if (env.DATABASE_URL) {
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { createPool } = await import("@/db/pool");
    return drizzle(createPool(env.DATABASE_URL), { schema });
  }

  // Development only: env validation requires DATABASE_URL in production.
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const db = drizzle(new PGlite(path.join(process.cwd(), ".pglite")), { schema });
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return db;
}

// Kept on globalThis so hot reload does not open a second connection.
const store = globalThis as typeof globalThis & { __taxpilotDb?: Promise<Database> };

/**
 * Full-access connection. Only for auth, migrations and system work.
 * Anything that touches a user's own data goes through `withUser`.
 */
export function getDb(): Promise<Database> {
  store.__taxpilotDb ??= connect().catch((error: unknown) => {
    store.__taxpilotDb = undefined;
    throw error;
  });
  return store.__taxpilotDb;
}

/** Runs `fn` in a transaction where row level security limits it to `userId`'s rows. */
export async function withUser<T>(userId: string, fn: (tx: Database) => Promise<T>): Promise<T> {
  return runAsUser(await getDb(), userId, fn);
}
