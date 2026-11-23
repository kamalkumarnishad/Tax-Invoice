import "server-only";
import { india202627 } from "./jurisdictions/india-2026-27";
import type { RuleSet } from "./types";

export const currentRules: RuleSet = india202627;

/** In production, rules a chartered accountant has not checked give no figures. */
export function calculatorAvailable(rules: RuleSet = currentRules): boolean {
  return rules.status === "approved" || process.env.NODE_ENV !== "production";
}
