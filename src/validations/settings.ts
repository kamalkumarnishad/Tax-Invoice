import { z } from "zod";
import { keysOf } from "./common";

export const taxYears = [{ value: "2026-04-01", end: "2027-03-31", label: "FY 2026-27" }] as const;

export const taxpayerTypes = { individual: "Individual", huf: "Hindu Undivided Family" } as const;
export const regimes = { new_regime: "New regime", old_regime: "Old regime" } as const;
export const businessStructures = {
  freelancer: "Freelancer or professional",
  sole_proprietor: "Sole proprietor",
} as const;

const upper = z.string().trim().toUpperCase();
const blankOr = (pattern: RegExp, message: string) =>
  upper.refine((v) => v === "" || pattern.test(v), message);
const blankOrDate = z.union([z.literal(""), z.iso.date("Enter a valid date")]);

export const taxProfileSchema = z
  .object({
    taxYearStart: z.enum(taxYears.map((y) => y.value) as [(typeof taxYears)[number]["value"]]),
    taxpayerType: z.enum(keysOf(taxpayerTypes)),
    regime: z.enum(keysOf(regimes)),
    businessStructure: z.enum(keysOf(businessStructures)),
    presumptiveTaxation: z.boolean(),
    /** Blank keeps the saved PAN. */
    pan: blankOr(/^[A-Z]{5}\d{4}[A-Z]$/, "A PAN looks like ABCDE1234F"),
    removePan: z.boolean(),
    gstin: blankOr(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, "A GSTIN looks like 27ABCDE1234F1Z5"),
    hasLut: z.boolean(),
    lutArn: upper.max(50),
    lutValidFrom: blankOrDate,
    lutValidTo: blankOrDate,
  })
  .refine((v) => !v.hasLut || v.lutArn !== "", { path: ["lutArn"], message: "Enter the LUT reference number" })
  .refine((v) => !v.hasLut || !v.lutValidFrom || !v.lutValidTo || v.lutValidFrom <= v.lutValidTo, {
    path: ["lutValidTo"],
    message: "The end date is before the start date",
  });

export type TaxProfileInput = z.infer<typeof taxProfileSchema>;

function isTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const preferencesSchema = z.object({
  defaultCurrency: z.string().regex(/^[A-Z]{3}$/),
  timezone: z.string().max(100).refine(isTimeZone, "Choose a time zone"),
  notificationsEnabled: z.boolean(),
});

export type PreferencesInput = z.infer<typeof preferencesSchema>;
