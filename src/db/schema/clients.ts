import { boolean, index, pgTable, text, unique, uuid, varchar } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { timestamps } from "./columns";
import { currencies } from "./reference";

export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }),
    company: varchar("company", { length: 255 }),
    country: varchar("country", { length: 2 }),
    currency: varchar("currency", { length: 3 }).references(() => currencies.code),
    billingAddress: text("billing_address"),
    taxId: varchar("tax_id", { length: 100 }),
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    index("idx_clients_user_name").on(t.userId, t.name),
    // Lets other tables reference (client_id, user_id), so a record can never
    // point at another user's client. Foreign keys are not subject to RLS.
    unique("clients_id_user").on(t.id, t.userId),
  ],
);
