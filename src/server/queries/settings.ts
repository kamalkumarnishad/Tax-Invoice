import "server-only";
import { asc, desc, eq } from "drizzle-orm";
import { currencies, taxProfiles, userSettings } from "@/db/schema";
import { todayIn } from "@/lib/dates";
import { withUser } from "@/lib/db";

export function getCurrencies(userId: string) {
  return withUser(userId, async (tx) => {
    const rows = await tx.select().from(currencies).where(eq(currencies.isActive, true)).orderBy(asc(currencies.code));
    return rows.map(({ code, name, decimalPlaces }) => ({ value: code, label: `${code} · ${name}`, decimals: decimalPlaces }));
  });
}

export function getUserSettings(userId: string) {
  return withUser(userId, async (tx) => {
    const [row] = await tx.select().from(userSettings).where(eq(userSettings.userId, userId));
    return row ?? null;
  });
}

/** What new records start from: the user's currency and what day it is for them. */
export async function getUserDefaults(userId: string) {
  const settings = await getUserSettings(userId);
  return {
    currency: settings?.defaultCurrency ?? "INR",
    today: todayIn(settings?.timezone ?? "Asia/Kolkata"),
  };
}

/** The primary profile, or the newest one. The encrypted PAN stays on the server. */
export function getTaxProfile(userId: string) {
  return withUser(userId, async (tx) => {
    const [row] = await tx
      .select({
        id: taxProfiles.id,
        taxYearStart: taxProfiles.taxYearStart,
        ageGroup: taxProfiles.ageGroup,
        regime: taxProfiles.regime,
        businessStructure: taxProfiles.businessStructure,
        panLast4: taxProfiles.panLast4,
        gstin: taxProfiles.gstin,
        gstFiling: taxProfiles.gstFiling,
        presumptiveTaxation: taxProfiles.presumptiveTaxation,
        hasLut: taxProfiles.hasLut,
        lutArn: taxProfiles.lutArn,
        lutValidFrom: taxProfiles.lutValidFrom,
        lutValidTo: taxProfiles.lutValidTo,
      })
      .from(taxProfiles)
      .where(eq(taxProfiles.userId, userId))
      .orderBy(desc(taxProfiles.isPrimary), desc(taxProfiles.taxYearStart))
      .limit(1);
    return row ?? null;
  });
}
