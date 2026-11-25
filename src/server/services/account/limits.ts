import "server-only";
import { sql } from "drizzle-orm";
import { rateLimits } from "@/db/schema";
import type { Tx } from "../shared";

const MINUTE = 60_000;

export const limits = {
  /** Each check of a password, right or wrong. */
  password: { max: 5, windowMs: 15 * MINUTE, message: "Too many attempts. Wait 15 minutes and try again." },
  download: { max: 5, windowMs: 24 * 60 * MINUTE, message: "You can download your data five times a day. Try again tomorrow." },
  deletion: { max: 3, windowMs: 60 * MINUTE, message: "Too many deletion emails. Wait an hour and try again." },
} as const;

export const limitKey = (userId: string, kind: keyof typeof limits | "") => `account:${userId}:${kind}`;

/** Counts a use. One statement, so requests at the same moment cannot share a place. */
export async function withinLimit(db: Tx, userId: string, kind: keyof typeof limits, now: Date): Promise<boolean> {
  const { max, windowMs } = limits[kind];
  const time = now.getTime();
  const ended = sql`${rateLimits.lastRequest} <= ${time - windowMs}`;
  const [row] = await db
    .insert(rateLimits)
    .values({ key: limitKey(userId, kind), count: 1, lastRequest: time })
    .onConflictDoUpdate({
      target: rateLimits.key,
      // The time stays that of the first use, so the window ends when it should.
      set: {
        count: sql`case when ${ended} then 1 else ${rateLimits.count} + 1 end`,
        lastRequest: sql`case when ${ended} then ${time} else ${rateLimits.lastRequest} end`,
      },
    })
    .returning({ count: rateLimits.count });
  return row!.count <= max;
}
