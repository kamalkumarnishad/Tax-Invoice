import "server-only";
import { randomBytes } from "node:crypto";
import { isAPIError } from "better-auth/api";
import { and, eq, like } from "drizzle-orm";
import { siteConfig } from "@/config/site";
import { auditLogs, verifications } from "@/db/schema";
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

// What Better Auth looks for when it is given the token.
const TOKEN_PREFIX = "delete-account-";
const LINK_MS = 60 * 60_000;

type SendEmail = (email: { to: string; subject: string; text: string }) => Promise<void>;
type Delivery = { baseURL: string; sendEmail: SendEmail };

/** Emails a link to the page with the last question. Nothing is deleted yet. */
export async function requestDeletion(
  context: Context,
  user: Person,
  password: string,
  { baseURL, sendEmail }: Delivery,
): Promise<ActionResult> {
  const { db, auth, now } = context;
  const checked = await checkPassword(context, user, password);
  if (!checked.ok) return checked;
  if (!(await withinLimit(db, user.id, "deletion", now))) return fail(limits.deletion.message);

  const dropLinks = () =>
    db.delete(verifications).where(and(eq(verifications.value, user.id), like(verifications.identifier, `${TOKEN_PREFIX}%`)));
  // Only the newest link works.
  await dropLinks();
  const token = randomBytes(32).toString("base64url");
  const { internalAdapter } = await auth.$context;
  await internalAdapter.createVerificationValue({
    identifier: `${TOKEN_PREFIX}${token}`,
    value: user.id,
    expiresAt: new Date(now.getTime() + LINK_MS),
  });
  try {
    await sendEmail({
      to: user.email,
      subject: `Delete your ${siteConfig.name} account`,
      text: `Open this link within an hour, in the browser where you are signed in, to delete your account:

${baseURL}/app/settings/delete?token=${token}

The page asks once more before anything is deleted. If this was not you, change your password.`,
    });
  } catch (error) {
    console.error("Deletion link not sent:", error instanceof Error ? error.message : "unknown error");
    await dropLinks();
    return fail("The email could not be sent, so nothing was deleted. Try again later.");
  }
  await db.insert(auditLogs).values({ userId: user.id, action: "account.delete_request" });
  return done;
}
