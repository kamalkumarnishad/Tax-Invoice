import { date, index, integer, jsonb, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import type { Regime, RuleSet, TaxInput, TaxResult } from "@/server/services/tax-engine/types";
import { users } from "./auth";

/**
 * A saved calculation is never changed. It keeps its input, its result and the
 * full rules it used, so it can be checked after the rules move on.
 */
export const taxCalculations = pgTable(
  "tax_calculations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    taxYearStart: date("tax_year_start").notNull(),
    ruleId: varchar("rule_id", { length: 50 }).notNull(),
    ruleVersion: integer("rule_version").notNull(),
    input: jsonb("input").$type<TaxInput>().notNull(),
    rules: jsonb("rules").$type<RuleSet>().notNull(),
    results: jsonb("results").$type<Record<Regime, TaxResult>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_tax_calculations_user").on(t.userId, t.createdAt.desc())],
);
