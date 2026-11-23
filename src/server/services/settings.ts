import "server-only";
import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "@/db/schema";
import { auditLogs, currencies, taxJurisdictions, taxProfiles, userSettings } from "@/db/schema";
import { encrypt } from "@/lib/encryption";
import { type PreferencesInput, type TaxProfileInput, taxYears } from "@/validations/settings";

type Tx = PgDatabase<PgQueryResultHKT, typeof schema>;

function panColumns(userId: string, input: TaxProfileInput) {
  if (input.removePan) return { panEncrypted: null, panLast4: null };
  if (!input.pan) return {};
  return { panEncrypted: encrypt(input.pan, userId), panLast4: input.pan.slice(-4) };
}

/** Call inside `withUser`, so row level security applies. */
export async function saveTaxProfile(tx: Tx, userId: string, input: TaxProfileInput) {
  const year = taxYears.find((y) => y.value === input.taxYearStart)!;
  const [india] = await tx
    .select({ id: taxJurisdictions.id })
    .from(taxJurisdictions)
    .where(eq(taxJurisdictions.code, "IN"));

  const values = {
    taxYearEnd: year.end,
    taxpayerType: input.taxpayerType,
    regime: input.regime,
    businessStructure: input.businessStructure,
    presumptiveTaxation: input.presumptiveTaxation,
    gstin: input.gstin || null,
    hasLut: input.hasLut,
    lutArn: input.hasLut ? input.lutArn : null,
    lutValidFrom: (input.hasLut && input.lutValidFrom) || null,
    lutValidTo: (input.hasLut && input.lutValidTo) || null,
    isPrimary: true,
    ...panColumns(userId, input),
  };

  // Only one profile may be primary, so clear the old one first.
  await tx.update(taxProfiles).set({ isPrimary: false }).where(eq(taxProfiles.userId, userId));
  const [saved] = await tx
    .insert(taxProfiles)
    .values({ userId, jurisdictionId: india!.id, taxYearStart: input.taxYearStart, ...values })
    .onConflictDoUpdate({
      target: [taxProfiles.userId, taxProfiles.jurisdictionId, taxProfiles.taxYearStart],
      set: values,
    })
    .returning({ id: taxProfiles.id });

  await tx.insert(auditLogs).values({
    userId,
    action: "tax_profile.save",
    resourceType: "tax_profile",
    resourceId: saved!.id,
  });
}

/** Returns false when the currency is not one we offer. */
export async function savePreferences(tx: Tx, userId: string, input: PreferencesInput): Promise<boolean> {
  const [currency] = await tx
    .select({ code: currencies.code })
    .from(currencies)
    .where(and(eq(currencies.code, input.defaultCurrency), eq(currencies.isActive, true)));
  if (!currency) return false;

  await tx
    .insert(userSettings)
    .values({ userId, ...input })
    .onConflictDoUpdate({ target: userSettings.userId, set: input });
  return true;
}
