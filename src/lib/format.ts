/**
 * Display-only formatting. Amounts arrive as decimal strings (the form that
 * numeric(19,4) columns use) and are never used for arithmetic here.
 * Intl.NumberFormat formats a decimal string without converting it to a float.
 */
export function formatCurrency(amount: string, currency: string, locale = "en-IN", maxDigits?: number): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: maxDigits }).format(
    amount as Intl.StringNumericLiteral,
  );
}

export function formatDate(value: Date, locale = "en-IN", timeZone = "Asia/Kolkata"): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone }).format(value);
}
