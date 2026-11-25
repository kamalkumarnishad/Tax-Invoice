import "server-only";
import { isAPIError } from "better-auth/api";
import { auditLogs } from "@/db/schema";
import type { Auth } from "@/lib/create-auth";
import { type ActionResult, done, fail, ok, type Tx } from "../shared";
import { buildArchive, collectUserData } from "./export";
import { limits, withinLimit } from "./limits";

export type Person = { id: string; name: string; email: string };
export type Context = {
  /** The full-access connection. */
  db: Tx;
  auth: Auth;
  /** Of the current request, with the session cookie. */
  headers: Headers;
  now: Date;
};

const WRONG = fail("The password is incorrect.");

/** Whoever holds an open session may not be its owner, so the password is asked for again. */
export async function checkPassword({ db, auth, headers, now }: Context, user: Person, password: string): Promise<ActionResult> {
  if (!(await withinLimit(db, user.id, "password", now))) return fail(limits.password.message);
  if (!password || password.length > 128) return WRONG;
  try {
    await auth.api.verifyPassword({ body: { password }, headers });
    return done;
  } catch (error) {
    if (isAPIError(error)) return WRONG;
    throw error;
  }
}

/** The user's data as one ZIP file. It is made when asked for, and never stored. */
export async function prepareDownload(context: Context, user: Person, password: string): Promise<ActionResult<Uint8Array>> {
  const { db, now } = context;
  const checked = await checkPassword(context, user, password);
  if (!checked.ok) return checked;
  if (!(await withinLimit(db, user.id, "download", now))) return fail(limits.download.message);

  // Recorded first, so that the download appears in its own activity list.
  await db.insert(auditLogs).values({ userId: user.id, action: "account.download" });
  return ok(buildArchive(await collectUserData(db, user.id), now.toISOString().slice(0, 10)));
}
