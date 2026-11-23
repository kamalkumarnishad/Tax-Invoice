import { type AnyPgColumn, boolean, integer, pgTable, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";

export const currencies = pgTable("currencies", {
  code: varchar("code", { length: 3 }).primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  symbol: varchar("symbol", { length: 10 }).notNull(),
  decimalPlaces: integer("decimal_places").notNull().default(2),
  isActive: boolean("is_active").notNull().default(true),
});

export const countries = pgTable("countries", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: varchar("code", { length: 2 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  currencyCode: varchar("currency_code", { length: 3 })
    .notNull()
    .references(() => currencies.code),
  isSupported: boolean("is_supported").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const taxJurisdictions = pgTable(
  "tax_jurisdictions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    countryId: uuid("country_id")
      .notNull()
      .references(() => countries.id),
    code: varchar("code", { length: 50 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    parentId: uuid("parent_id").references((): AnyPgColumn => taxJurisdictions.id),
    jurisdictionType: varchar("jurisdiction_type", { length: 20 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [unique("tax_jurisdictions_country_code").on(t.countryId, t.code)],
);
