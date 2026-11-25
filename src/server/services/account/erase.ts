import "server-only";
import { eq, like } from "drizzle-orm";
import { auditLogs, rateLimits, users, verifications } from "@/db/schema";
import type { Tx } from "../shared";
import { limitKey } from "./limits";

/**
 * Removes a user and everything that belongs to them, all or nothing. `db` is
 * the full-access connection. Records with a user id go with the user's row;
 * the rest only mention the user, so they are removed here.
 */
export async function eraseUser(db: Tx, userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(auditLogs).where(eq(auditLogs.userId, userId));
    // Unused links, such as for a new password.
    await tx.delete(verifications).where(eq(verifications.value, userId));
    await tx.delete(rateLimits).where(like(rateLimits.key, `${limitKey(userId, "")}%`));
    await tx.delete(users).where(eq(users.id, userId));
    // That it happened, and when, but not whose it was.
    await tx.insert(auditLogs).values({ action: "account.deleted" });
  });
}
