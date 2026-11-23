import { z } from "zod";

const isZero = (value: string) => /^[0.]+$/.test(value);

/** Accepts "1,00,000.50" and drops the commas. */
const decimal = z.string().trim().transform((value) => value.replaceAll(",", ""));

const AMOUNT = /^\d{1,13}(\.\d{1,4})?$/;

export const positiveAmount = decimal.pipe(
  z
    .string()
    .regex(AMOUNT, "Enter an amount, such as 1500.50")
    .refine((value) => !isZero(value), "Enter an amount above zero"),
);

/** Blank means zero. */
export const optionalAmount = decimal
  .transform((value) => value || "0")
  .pipe(z.string().regex(AMOUNT, "Enter an amount, such as 1500.50"));

/** Blank is allowed here, because no rate is needed for the base currency. */
export const exchangeRate = decimal.pipe(
  z.union([
    z.literal(""),
    z
      .string()
      .regex(/^\d{1,9}(\.\d{1,8})?$/, "Enter a rate, such as 92.68")
      .refine((value) => !isZero(value), "Enter a rate above zero"),
  ]),
);

export const recordDate = z.iso
  .date("Enter a valid date")
  .refine((date) => date >= "2000-01-01" && date < "2100-01-01", "Enter a date from 2000 onwards");
