import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runAsUser } from "@/db/run-as-user";
import { auditLogs, taxProfiles, users, userSettings } from "@/db/schema";
import { decrypt, encrypt } from "@/lib/encryption";
import { savePreferences, saveTaxProfile } from "@/server/services/settings";
import { preferencesSchema, taxProfileSchema, type TaxProfileInput } from "@/validations/settings";
import { createTestDb, type TestDb } from "../helpers";

const base: TaxProfileInput = {
  taxYearStart: "2026-04-01",
  ageGroup: "under_60",
  regime: "new_regime",
  businessStructure: "freelancer",
  presumptiveTaxation: false,
  pan: "",
  removePan: false,
  gstin: "",
  gstFiling: "",
  hasLut: false,
  lutArn: "",
  lutValidFrom: "",
  lutValidTo: "",
};

let db: TestDb;
let close: () => Promise<void>;
let alice: string;
let bob: string;

const save = (input: Partial<TaxProfileInput>, userId = alice) =>
  runAsUser(db, userId, (tx) => saveTaxProfile(tx, userId, { ...base, ...input }));
const profileOf = async (userId = alice) =>
  (await db.select().from(taxProfiles).where(eq(taxProfiles.userId, userId)))[0]!;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
});
afterAll(() => close());

beforeEach(async () => {
  await db.delete(auditLogs);
  await db.delete(users);
  const rows = await db
    .insert(users)
    .values([
      { name: "Alice", email: "alice@example.test" },
      { name: "Bob", email: "bob@example.test" },
    ])
    .returning({ id: users.id });
  alice = rows[0]!.id;
  bob = rows[1]!.id;
});

describe("encryption", () => {
  it("round-trips and gives a different ciphertext each time", () => {
    const a = encrypt("ABCDE1234F", alice);
    expect(decrypt(a, alice)).toBe("ABCDE1234F");
    expect(a).not.toBe(encrypt("ABCDE1234F", alice));
    expect(a).not.toContain("ABCDE1234F");
  });

  it("refuses another owner's ciphertext and tampered data", () => {
    const text = encrypt("ABCDE1234F", alice);
    expect(() => decrypt(text, bob)).toThrow();
    const flipped = text.slice(0, -2) + (text.at(-2) === "A" ? "B" : "A") + text.at(-1);
    expect(() => decrypt(flipped, alice)).toThrow();
    expect(() => decrypt("v9.abc", alice)).toThrow();
  });
});

describe("tax profile", () => {
  it("stores the PAN encrypted, with only the last four characters readable", async () => {
    await save({ pan: "ABCDE1234F" });
    const row = await profileOf();
    expect(row.panLast4).toBe("234F");
    expect(JSON.stringify(row)).not.toContain("ABCDE1234F");
    expect(decrypt(row.panEncrypted!, alice)).toBe("ABCDE1234F");
  });

  it("keeps the PAN when left blank, and removes it only when asked", async () => {
    await save({ pan: "ABCDE1234F" });
    await save({ regime: "old_regime" });
    expect(await profileOf()).toMatchObject({ panLast4: "234F", regime: "old_regime" });
    await save({ removePan: true });
    expect(await profileOf()).toMatchObject({ panLast4: null, panEncrypted: null });
  });

  it("updates the same year in place", async () => {
    await save({});
    await save({});
    expect(await db.select().from(taxProfiles)).toHaveLength(1);
  });

  it("leaves other users' profiles alone", async () => {
    await save({ regime: "old_regime" }, bob);
    await save({});
    expect(await profileOf(bob)).toMatchObject({ regime: "old_regime", isPrimary: true });
  });

  it("drops LUT details when there is no LUT", async () => {
    await save({ hasLut: true, lutArn: "AD2704260000001", lutValidFrom: "2026-04-01", lutValidTo: "2027-03-31" });
    expect(await profileOf()).toMatchObject({ hasLut: true, lutArn: "AD2704260000001" });
    await save({ hasLut: false, lutArn: "AD2704260000001" });
    expect(await profileOf()).toMatchObject({ hasLut: false, lutArn: null, lutValidFrom: null });
  });

  it("logs the change without the values", async () => {
    await save({ pan: "ABCDE1234F" });
    const logs = await db.select().from(auditLogs);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ action: "tax_profile.save", userId: alice, details: null });
  });

  it.each([
    [{ pan: "ABC" }, "pan"],
    [{ gstin: "27ABCDE1234F1X5" }, "gstin"],
    [{ hasLut: true }, "lutArn"],
    [{ hasLut: true, lutArn: "X", lutValidFrom: "2027-03-31", lutValidTo: "2026-04-01" }, "lutValidTo"],
    [{ regime: "flat_regime" }, "regime"],
    [{ ageGroup: "ageless" }, "ageGroup"],
    [{ taxYearStart: "1999-04-01" }, "taxYearStart"],
  ])("rejects %j", (input, field) => {
    const result = taxProfileSchema.safeParse({ ...base, ...input });
    expect(result.error?.issues[0]?.path).toEqual([field]);
  });

  it("accepts lower-case PAN and GSTIN", () => {
    const result = taxProfileSchema.parse({ ...base, pan: " abcde1234f ", gstin: "27abcde1234f1z5", gstFiling: "monthly" });
    expect(result).toMatchObject({ pan: "ABCDE1234F", gstin: "27ABCDE1234F1Z5" });
  });
});

describe("preferences", () => {
  const input = { defaultCurrency: "USD", timezone: "Asia/Kolkata", notificationsEnabled: false };

  it("saves for a user with or without an existing row", async () => {
    for (const defaultCurrency of ["USD", "EUR"]) {
      expect(await runAsUser(db, alice, (tx) => savePreferences(tx, alice, { ...input, defaultCurrency }))).toBe(true);
    }
    const rows = await db.select().from(userSettings).where(eq(userSettings.userId, alice));
    expect(rows).toMatchObject([{ defaultCurrency: "EUR", notificationsEnabled: false }]);
  });

  it("refuses a currency we do not offer", async () => {
    expect(await runAsUser(db, alice, (tx) => savePreferences(tx, alice, { ...input, defaultCurrency: "XXX" }))).toBe(
      false,
    );
  });

  it("rejects an unknown time zone", () => {
    expect(preferencesSchema.safeParse({ ...input, timezone: "Mars/Olympus" }).success).toBe(false);
  });
});
