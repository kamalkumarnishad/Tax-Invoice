import { sql } from "drizzle-orm";
import { check, date, foreignKey, index, numeric, pgTable, text, uuid, varchar } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { clients } from "./clients";
import { money, timestamps } from "./columns";
import { currencies } from "./reference";

export const incomeRecords = pgTable(
  "income_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    clientId: uuid("client_id"),
    description: text("description").notNull(),
    /** Invoiced amount, before any fee, in `currency`. */
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
    paymentDate: date("payment_date").notNull(),
    paymentMethod: varchar("payment_method", { length: 50 }).notNull(),
    /** In `currency`. Bank charges, TDS and net received are in `baseCurrency`. */
    gatewayFee: money("payment_gateway_fee").notNull().default("0"),
    bankCharges: money("bank_charges").notNull().default("0"),
    tdsDeducted: money("tds_deducted").notNull().default("0"),
    netReceived: money("net_received").notNull(),
    category: varchar("income_category", { length: 50 }).notNull(),
    taxYearStart: date("tax_year_start").notNull(),
    status: varchar("status", { length: 20 }).notNull(),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    foreignKey({ columns: [t.clientId, t.userId], foreignColumns: [clients.id, clients.userId] }),
    index("idx_income_user_date").on(t.userId, t.paymentDate.desc()),
    index("idx_income_user_taxyear").on(t.userId, t.taxYearStart),
    index("idx_income_client").on(t.clientId),
    check("income_amount_positive", sql`${t.amount} > 0 and ${t.exchangeRate} > 0`),
    check(
      "income_deductions_not_negative",
      sql`${t.gatewayFee} >= 0 and ${t.bankCharges} >= 0 and ${t.tdsDeducted} >= 0 and ${t.netReceived} >= 0`,
    ),
  ],
);
