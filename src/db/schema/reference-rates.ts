import { sql } from "drizzle-orm";
import { check, date, integer, numeric, pgTable, primaryKey, timestamp, varchar } from "drizzle-orm/pg-core";
import { currencies } from "./reference";

/**
 * Daily rates for the currency analyzer, shared by all users. Separate from
 * exchange_rates, which holds the rates used on income and expenses.
 */
export const referenceRates = pgTable(
  "reference_rates",
  {
    currency: varchar("currency", { length: 3 })
      .notNull()
      .references(() => currencies.code),
    rateDate: date("rate_date").notNull(),
    /** One unit of this buys `rate` of `currency`. */
    baseCurrency: varchar("base_currency", { length: 3 })
      .notNull()
      .references(() => currencies.code),
    rate: numeric("rate", { precision: 19, scale: 8 }).notNull(),
    source: varchar("source", { length: 100 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.currency, t.rateDate] }),
    check("reference_rates_positive", sql`${t.rate} > 0`),
  ],
);

/** A single row, so that visitors share one limit on how often rates are fetched. */
export const rateRefreshes = pgTable(
  "rate_refreshes",
  {
    id: integer("id").primaryKey().default(1),
    attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull(),
  },
  (t) => [check("rate_refreshes_single", sql`${t.id} = 1`)],
);
