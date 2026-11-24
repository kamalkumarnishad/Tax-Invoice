import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "@/config/env";
import { type Auth, createAuth } from "./create-auth";
import { getDb } from "./db";
import { sendEmail } from "./email";

const store = globalThis as typeof globalThis & { __taxpilotAuth?: Promise<Auth> };

async function build(): Promise<Auth> {
  return createAuth({
    db: await getDb(),
    // Development only: env validation requires both in production.
    secret: env.BETTER_AUTH_SECRET ?? "development-only-secret-not-for-production",
    baseURL: env.BETTER_AUTH_URL ?? "http://localhost:3000",
    sendEmail,
  });
}

export function getAuth(): Promise<Auth> {
  store.__taxpilotAuth ??= build().catch((error: unknown) => {
    store.__taxpilotAuth = undefined;
    throw error;
  });
  return store.__taxpilotAuth;
}

export const getSession = cache(async () => {
  // First, so that a build sees this page is dynamic and stops before opening the database.
  const requestHeaders = await headers();
  const auth = await getAuth();
  const session = await auth.api.getSession({ headers: requestHeaders });
  return session?.user.isActive ? session : null;
});

/** For pages and layouts: the signed-in user, or a redirect to the login page. */
export async function requireUser() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session.user;
}
