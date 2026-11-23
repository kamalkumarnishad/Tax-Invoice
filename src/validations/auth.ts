import { z } from "zod";

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

const email = z.email("Enter a valid email address");

export const newPassword = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, `Use at most ${PASSWORD_MAX_LENGTH} characters`);

export const loginSchema = z.object({ email, password: z.string().min(1, "Enter your password") });

export const signupSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(255),
  email,
  password: newPassword,
});

export const emailOnlySchema = z.object({ email });

const passwordsMatch = (v: { password: string; confirm: string }) => v.password === v.confirm;
const mismatch = { path: ["confirm"], message: "The passwords do not match" };

export const resetPasswordSchema = z
  .object({ password: newPassword, confirm: z.string() })
  .refine(passwordsMatch, mismatch);

export const changePasswordSchema = z
  .object({ current: z.string().min(1, "Enter your current password"), password: newPassword, confirm: z.string() })
  .refine(passwordsMatch, mismatch);

const APP_ORIGIN = "http://app.invalid";

/** Accepts only paths on this site, so `?next=` cannot send anyone elsewhere. */
export function safeRedirectPath(value: unknown, fallback = "/app/dashboard"): string {
  if (typeof value !== "string" || !value.startsWith("/")) return fallback;
  try {
    const url = new URL(value, APP_ORIGIN);
    return url.origin === APP_ORIGIN ? url.pathname + url.search : fallback;
  } catch {
    return fallback;
  }
}
