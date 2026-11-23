import { sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "./schema";

type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

export function runAsUser<T>(db: Database, userId: string, fn: (tx: Database) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    // Both settings are transaction-local, so a pooled connection cannot leak them.
    await tx.execute(sql`select set_config('app.current_user_id', ${userId}, true)`);
    await tx.execute(sql`set local role taxpilot_app`);
    return fn(tx);
  });
}
