import { sql } from "drizzle-orm";
import { boolean, check, date, index, numeric, pgTable, text, uuid, varchar } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { money, timestamps } from "./columns";
import { currencies } from "./reference";

export const expenseRecords = pgTable(
  "expense_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    amount: money("amount").notNull(),
    currency: varchar("currency", { length: 3 })
      .notNull()
      .references(() => currencies.code),
    exchangeRate: numeric("exchange_rate", { precision: 19, scale: 8 }).notNull(),
    /** `amount` in `baseCurrency`, the user's currency when this was recorded. */
    convertedAmount: money("converted_amount").notNull(),
    baseCurrency: varchar("base_currency", { length: 3 })
      .notNull()
      .references(() => currencies.code),
    category: varchar("category", { length: 50 }).notNull(),
    expenseDate: date("expense_date").notNull(),
    vendor: varchar("vendor", { length: 255 }),
    paymentMethod: varchar("payment_method", { length: 50 }).notNull(),
    isDeductible: boolean("is_deductible").notNull().default(true),
    taxYearStart: date("tax_year_start").notNull(),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    index("idx_expenses_user_date").on(t.userId, t.expenseDate.desc()),
    index("idx_expenses_user_category").on(t.userId, t.category),
    index("idx_expenses_user_taxyear").on(t.userId, t.taxYearStart),
    check("expenses_amount_positive", sql`${t.amount} > 0 and ${t.exchangeRate} > 0`),
  ],
);
