import "server-only";
import { eq } from "drizzle-orm";
import { currencies } from "@/db/schema";
import { convert } from "@/lib/money";
import { type ActionResult, fail, ok, type Tx } from "../shared";

type Conversion = { amount: string; currency: string; exchangeRate: string; baseCurrency: string };
export type Converted = { rate: string; convertedAmount: string; toBase: (amount: string) => string };

// numeric(19,4) holds 15 digits before the decimal point.
const MAX_WHOLE_DIGITS = 15;

/** Converts on the server, so a figure worked out in the browser is never trusted. */
export async function convertToBase(tx: Tx, input: Conversion): Promise<ActionResult<Converted>> {
  const rows = await tx.select().from(currencies).where(eq(currencies.isActive, true));
  const base = rows.find((row) => row.code === input.baseCurrency);
  if (!base || !rows.some((row) => row.code === input.currency)) return fail("Choose a currency from the list.");

  const sameCurrency = input.currency === input.baseCurrency;
  if (!sameCurrency && !input.exchangeRate) return fail("Enter the exchange rate.");

  const rate = sameCurrency ? "1" : input.exchangeRate;
  // Amounts already in the base currency keep every digit the user entered.
  const toBase = (amount: string) => (sameCurrency ? amount : convert(amount, rate, base.decimalPlaces));
  const convertedAmount = toBase(input.amount);
  if (convertedAmount.split(".")[0]!.length > MAX_WHOLE_DIGITS) return fail("The converted amount is too large.");

  return ok({ rate, convertedAmount, toBase });
}
