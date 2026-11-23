import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();

/** One message per failure kind, with nothing that reveals whether an email is registered. */
export function authErrorMessage(error: { status?: number; message?: string }): string {
  if (error.status === 429) return "Too many attempts. Wait a few minutes and try again.";
  if (error.status === 401) return "The email or password is incorrect.";
  return error.message || "Something went wrong. Try again.";
}
