import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "@/db/schema";

export type Tx = PgDatabase<PgQueryResultHKT, typeof schema>;

export type Failure = { ok: false; error: string };
export type ActionResult<T = null> = { ok: true; data: T } | Failure;

export const done: ActionResult = { ok: true, data: null };
export const ok = <T>(data: T): ActionResult<T> => ({ ok: true, data });
export const fail = (error: string): Failure => ({ ok: false, error });

export const INVALID = fail("Some values are not valid. Check the form and try again.");

/** Drizzle wraps driver errors, so the Postgres code is on the cause. */
function hasCode(error: unknown, code: string): boolean {
  const cause = error instanceof Error ? (error.cause ?? error) : error;
  return typeof cause === "object" && cause !== null && "code" in cause && cause.code === code;
}

export const isForeignKeyViolation = (error: unknown) => hasCode(error, "23503");
export const isUniqueViolation = (error: unknown) => hasCode(error, "23505");
