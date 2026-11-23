import { sql } from "drizzle-orm";
import { check, date, numeric, pgTable, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";
import { currencies } from "./reference";

export const exchangeRates = pgTable(
  "exchange_rates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    baseCurrency: varchar("base_currency", { length: 3 })
      .notNull()
      .references(() => currencies.code),
    targetCurrency: varchar("target_currency", { length: 3 })
      .notNull()
      .references(() => currencies.code),
    rate: numeric("rate", { precision: 19, scale: 8 }).notNull(),
    rateDate: date("rate_date").notNull(),
    source: varchar("source", { length: 100 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Also serves lookups by pair and date.
    unique("exchange_rates_pair_date_source").on(t.baseCurrency, t.targetCurrency, t.rateDate, t.source),
    check("exchange_rates_positive", sql`${t.rate} > 0`),
  ],
);
