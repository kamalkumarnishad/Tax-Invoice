import { sql } from "drizzle-orm";
import { boolean, date, index, pgTable, text, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { timestamps } from "./columns";
import { taxJurisdictions } from "./reference";

export const userSettings = pgTable("user_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  defaultCurrency: varchar("default_currency", { length: 3 }).notNull().default("INR"),
  timezone: varchar("timezone", { length: 100 }).notNull().default("Asia/Kolkata"),
  locale: varchar("locale", { length: 10 }).notNull().default("en-IN"),
  notificationsEnabled: boolean("notifications_enabled").notNull().default(true),
  ...timestamps,
});

export const taxProfiles = pgTable(
  "tax_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jurisdictionId: uuid("jurisdiction_id")
      .notNull()
      .references(() => taxJurisdictions.id),
    taxYearStart: date("tax_year_start").notNull(),
    taxYearEnd: date("tax_year_end").notNull(),
    taxpayerType: varchar("taxpayer_type", { length: 50 }).notNull().default("individual"),
    /** On the last day of the tax year. The date of birth is not kept. */
    ageGroup: varchar("age_group", { length: 20 }).notNull().default("under_60"),
    regime: varchar("regime", { length: 50 }),
    businessStructure: varchar("business_structure", { length: 50 }),
    /** AES-256-GCM ciphertext. The plain PAN is never stored. */
    panEncrypted: text("pan_encrypted"),
    panLast4: varchar("pan_last4", { length: 4 }),
    gstin: varchar("gstin", { length: 15 }),
    /** monthly or quarterly, when there is a GSTIN. */
    gstFiling: varchar("gst_filing", { length: 20 }),
    presumptiveTaxation: boolean("presumptive_taxation").notNull().default(false),
    hasLut: boolean("has_lut").notNull().default(false),
    lutArn: varchar("lut_arn", { length: 50 }),
    lutValidFrom: date("lut_valid_from"),
    lutValidTo: date("lut_valid_to"),
    isPrimary: boolean("is_primary").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index("idx_tax_profiles_user").on(t.userId),
    uniqueIndex("tax_profiles_one_per_year").on(t.userId, t.jurisdictionId, t.taxYearStart),
    uniqueIndex("tax_profiles_one_primary").on(t.userId).where(sql`${t.isPrimary}`),
  ],
);
