import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

const isProduction = process.env.NODE_ENV === "production";

/** Required in production, optional in development and tests. */
const requiredInProduction = <T extends z.ZodType>(schema: T) =>
  (isProduction ? schema : schema.optional()) as z.ZodOptional<T>;

export const env = createEnv({
  server: {
    DATABASE_URL: requiredInProduction(z.url()),
    BETTER_AUTH_SECRET: requiredInProduction(z.string().min(32)),
    BETTER_AUTH_URL: requiredInProduction(z.url()),
    /** 32 random bytes, base64 encoded. Encrypts PAN numbers. */
    ENCRYPTION_KEY: requiredInProduction(
      z.string().refine((v) => Buffer.from(v, "base64").length === 32, "must be 32 bytes, base64 encoded"),
    ),
    RESEND_API_KEY: requiredInProduction(z.string().min(1)),
    EMAIL_FROM: requiredInProduction(z.string().min(3)),
    /** Sent by the scheduler that starts the daily jobs. */
    CRON_SECRET: requiredInProduction(z.string().min(32)),
  },
  client: {},
  experimental__runtimeEnv: {},
  emptyStringAsUndefined: true,
  // `next build` collects page data without secrets; they are checked at start-up instead.
  skipValidation: process.env.NEXT_PHASE === "phase-production-build",
});
