import "server-only";
import { and, desc, eq, gt } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "@/db/schema";
import { sessions } from "@/db/schema";

/**
 * Better Auth's own listSessions needs a sign-in from the last day, which would
 * break the settings page for longer sessions. Tokens are left out on purpose.
 * Takes the full-access connection, because the app role cannot read sessions.
 */
export function listActiveSessions(db: PgDatabase<PgQueryResultHKT, typeof schema>, userId: string) {
  return db
    .select({
      id: sessions.id,
      userAgent: sessions.userAgent,
      ipAddress: sessions.ipAddress,
      createdAt: sessions.createdAt,
    })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), gt(sessions.expiresAt, new Date())))
    .orderBy(desc(sessions.createdAt));
}
