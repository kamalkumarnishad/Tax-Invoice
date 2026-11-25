import "server-only";
import { india202627 } from "./jurisdictions/india-2026-27";
import type { RuleSet } from "./types";

export const currentRules: RuleSet = india202627;

/**
 * In production, rules a chartered accountant has not checked are switched off,
 * unless the owner has chosen to show them. Every page then says that they are
 * unchecked.
 */
export function reviewed(status: RuleSet["status"]): boolean {
  if (status === "approved" || process.env.NODE_ENV !== "production") return true;
  return process.env.SHOW_UNREVIEWED_RULES === "true";
}

export function calculatorAvailable(rules: RuleSet = currentRules): boolean {
  return reviewed(rules.status);
}
