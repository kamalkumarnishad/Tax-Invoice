import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "@/db/schema";
import { siteConfig } from "@/config/site";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/validations/auth";

type Email = { to: string; subject: string; text: string };

type CreateAuthOptions = {
  db: PgDatabase<PgQueryResultHKT, typeof schema>;
  secret: string;
  baseURL: string;
  sendEmail: (email: Email) => Promise<void>;
};

const MINUTE = 60;
const HOUR = 60 * MINUTE;

export function createAuth({ db, secret, baseURL, sendEmail }: CreateAuthOptions) {
  return betterAuth({
    appName: siteConfig.name,
    secret,
    baseURL,
    telemetry: { enabled: false },
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: schema.users,
        session: schema.sessions,
        account: schema.accounts,
        verification: schema.verifications,
        rateLimit: schema.rateLimits,
      },
    }),
    advanced: { database: { generateId: "uuid" } },
    user: {
      additionalFields: {
        // `input: false` stops these being set through sign-up or profile updates.
        role: { type: "string", input: false, defaultValue: "user" },
        isActive: { type: "boolean", input: false, defaultValue: true },
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      resetPasswordTokenExpiresIn: HOUR,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await sendEmail({
          to: user.email,
          subject: `Reset your ${siteConfig.name} password`,
          text: `Open this link within an hour to choose a new password:\n\n${url}\n\nIf you did not ask for this, ignore this email.`,
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: 24 * HOUR,
      sendVerificationEmail: async ({ user, url }) => {
        await sendEmail({
          to: user.email,
          subject: `Verify your email for ${siteConfig.name}`,
          text: `Open this link within 24 hours to verify your email address:\n\n${url}\n\nIf you did not create an account, ignore this email.`,
        });
      },
    },
    session: {
      expiresIn: 7 * 24 * HOUR,
      updateAge: 24 * HOUR,
      // No cookie cache: revoking a session or suspending a user takes effect at once.
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: MINUTE,
      max: 60,
      customRules: {
        "/sign-in/email": { window: 15 * MINUTE, max: 5 },
        "/sign-up/email": { window: HOUR, max: 3 },
        "/request-password-reset": { window: HOUR, max: 3 },
        "/send-verification-email": { window: 15 * MINUTE, max: 5 },
        "/change-password": { window: 15 * MINUTE, max: 5 },
      },
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await db.insert(schema.userSettings).values({ userId: user.id }).onConflictDoNothing();
          },
        },
      },
      account: {
        update: {
          // With email and password as the only method, an account changes when its password does.
          after: async (account) => {
            await db.insert(schema.auditLogs).values({ userId: account.userId, action: "user.password_change" });
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            const [user] = await db
              .select({ isActive: schema.users.isActive })
              .from(schema.users)
              .where(eq(schema.users.id, session.userId));
            if (!user?.isActive) {
              throw new APIError("FORBIDDEN", { message: "This account is suspended. Contact support." });
            }
          },
          after: async (session) => {
            await db.insert(schema.auditLogs).values({
              userId: session.userId,
              action: "session.create",
              ipAddress: session.ipAddress ?? null,
              userAgent: session.userAgent ?? null,
            });
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
