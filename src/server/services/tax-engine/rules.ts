import "server-only";
import { india202627 } from "./jurisdictions/india-2026-27";
import type { RuleSet } from "./types";

export const currentRules: RuleSet = india202627;

/** In production, rules a chartered accountant has not checked are switched off. */
export function reviewed(status: RuleSet["status"]): boolean {
  return status === "approved" || process.env.NODE_ENV !== "production";
}

export function calculatorAvailable(rules: RuleSet = currentRules): boolean {
  return reviewed(rules.status);
}
