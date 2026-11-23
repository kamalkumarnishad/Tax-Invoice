import { Decimal } from "decimal.js";

/**
 * All money arithmetic goes through here. Amounts are decimal strings, as the
 * numeric(19,4) columns store them, and never JavaScript numbers.
 */
const Money = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export function convert(amount: string, rate: string, decimalPlaces: number): string {
  return new Money(amount).times(rate).toFixed(decimalPlaces);
}

export function add(...amounts: string[]): string {
  return amounts.reduce((total, amount) => total.plus(amount), new Money(0)).toFixed();
}

export function subtract(amount: string, ...others: string[]): string {
  return others.reduce((total, other) => total.minus(other), new Money(amount)).toFixed();
}

export function isNegative(amount: string): boolean {
  return new Money(amount).lessThan(0);
}

/** A rate at the precision the exchange_rates table stores. */
export function roundRate(rate: string | number): string {
  return new Money(rate).toFixed(8);
}

/** Drops trailing zeros for form fields: "100.0000" becomes "100". */
export function plain(amount: string): string {
  return new Money(amount).toFixed();
}
