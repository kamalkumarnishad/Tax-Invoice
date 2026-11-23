import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import type { Buyer, Seller } from "@/lib/invoice";
import { users } from "./auth";
import { clients } from "./clients";
import { money, timestamps } from "./columns";
import { currencies } from "./reference";

/** What goes at the top of an invoice. */
export const businessProfiles = pgTable("business_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  businessName: varchar("business_name", { length: 255 }).notNull(),
  address: text("address").notNull(),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  paymentInstructions: text("payment_instructions"),
  ...timestamps,
});

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull(),
    invoiceNumber: varchar("invoice_number", { length: 16 }).notNull(),
    invoiceDate: date("invoice_date").notNull(),
    dueDate: date("due_date").notNull(),
    currency: varchar("currency", { length: 3 })
      .notNull()
      .references(() => currencies.code),
    taxMode: varchar("tax_mode", { length: 20 }).notNull(),
    taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).notNull().default("0"),
    sacCode: varchar("sac_code", { length: 8 }),
    placeOfSupply: varchar("place_of_supply", { length: 100 }),
    subtotal: money("subtotal").notNull(),
    discount: money("discount_amount").notNull().default("0"),
    taxAmount: money("tax_amount").notNull().default("0"),
    total: money("total").notNull(),
    notes: text("notes"),
    /** draft, issued or cancelled. Paid and overdue are worked out, never stored. */
    status: varchar("status", { length: 20 }).notNull().default("draft"),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    /** Copied when issued, so later changes to either party leave the invoice as it was sent. */
    seller: jsonb("seller").$type<Seller>(),
    buyer: jsonb("buyer").$type<Buyer>(),
    ...timestamps,
  },
  (t) => [
    foreignKey({ columns: [t.clientId, t.userId], foreignColumns: [clients.id, clients.userId] }),
    unique("invoices_user_number").on(t.userId, t.invoiceNumber),
    unique("invoices_id_user").on(t.id, t.userId),
    index("idx_invoices_user_date").on(t.userId, t.invoiceDate.desc()),
    index("idx_invoices_client").on(t.clientId),
    check("invoices_amounts", sql`${t.total} > 0 and ${t.discount} >= 0 and ${t.taxAmount} >= 0`),
    check("invoices_issued_parties", sql`${t.status} = 'draft' or (${t.seller} is not null and ${t.buyer} is not null)`),
  ],
);

export const invoiceItems = pgTable(
  "invoice_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    invoiceId: uuid("invoice_id").notNull(),
    description: text("description").notNull(),
    quantity: numeric("quantity", { precision: 10, scale: 2 }).notNull(),
    unitPrice: money("unit_price").notNull(),
    amount: money("amount").notNull(),
    sortOrder: integer("sort_order").notNull(),
  },
  (t) => [
    foreignKey({ columns: [t.invoiceId, t.userId], foreignColumns: [invoices.id, invoices.userId] }).onDelete("cascade"),
    index("idx_invoice_items_invoice").on(t.invoiceId, t.sortOrder),
  ],
);
