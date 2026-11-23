import { Decimal } from "decimal.js";

export type Seller = {
  name: string;
  address: string;
  email: string | null;
  phone: string | null;
  gstin: string | null;
  lutArn: string | null;
  paymentInstructions: string | null;
};

export type Buyer = {
  name: string;
  company: string | null;
  address: string | null;
  country: string | null;
  email: string | null;
  taxId: string | null;
};

export const taxModes = {
  none: "No GST",
  export_lut: "Export under LUT, no IGST",
  igst: "IGST",
  cgst_sgst: "CGST and SGST",
} as const;
export type TaxMode = keyof typeof taxModes;

/** Modes that charge GST, and so need a rate and the seller's GSTIN. */
export const chargesGst = (mode: TaxMode) => mode === "igst" || mode === "cgst_sgst";

export type Totals = {
  amounts: string[];
  subtotal: string;
  discount: string;
  taxable: string;
  taxes: { label: string; amount: string }[];
  taxAmount: string;
  total: string;
};

type TotalsInput = {
  items: { quantity: string; unitPrice: string }[];
  discount: string;
  taxMode: TaxMode;
  taxRate: string;
  decimals: number;
};

const Money = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

/** Used in the browser for the preview and on the server for what is stored. */
export function invoiceTotals({ items, discount, taxMode, taxRate, decimals }: TotalsInput): Totals {
  const amounts = items.map((item) => new Money(item.quantity).times(item.unitPrice).toDecimalPlaces(decimals));
  const subtotal = amounts.reduce((sum, amount) => sum.plus(amount), new Money(0));
  const taxable = subtotal.minus(discount);
  const taxAt = (rate: Decimal.Value) => taxable.times(rate).dividedBy(100).toDecimalPlaces(decimals);

  let taxes: { label: string; amount: Decimal }[] = [];
  if (taxMode === "igst") taxes = [{ label: `IGST ${taxRate}%`, amount: taxAt(taxRate) }];
  if (taxMode === "cgst_sgst") {
    // Each half is rounded on its own, because each is paid on its own.
    const half = new Money(taxRate).dividedBy(2);
    taxes = ["CGST", "SGST"].map((name) => ({ label: `${name} ${half.toFixed()}%`, amount: taxAt(half) }));
  }
  const taxAmount = taxes.reduce((sum, tax) => sum.plus(tax.amount), new Money(0));
  const text = (value: Decimal) => value.toFixed(decimals);

  return {
    amounts: amounts.map(text),
    subtotal: text(subtotal),
    discount: text(new Money(discount)),
    taxable: text(taxable),
    taxes: taxes.map((tax) => ({ label: tax.label, amount: text(tax.amount) })),
    taxAmount: text(taxAmount),
    total: text(taxable.plus(taxAmount)),
  };
}

export const invoiceStates = {
  draft: "Draft",
  sent: "Awaiting payment",
  partially_paid: "Partly paid",
  overdue: "Overdue",
  paid: "Paid",
  cancelled: "Cancelled",
} as const;
export type InvoiceState = keyof typeof invoiceStates;

type StateInput = { status: string; total: string; paid: string; dueDate: string; today: string };

export function invoiceState({ status, total, paid, dueDate, today }: StateInput): InvoiceState {
  if (status === "draft" || status === "cancelled") return status;
  if (new Money(paid).greaterThanOrEqualTo(total)) return "paid";
  if (today > dueDate) return "overdue";
  return new Money(paid).isZero() ? "sent" : "partially_paid";
}

/**
 * The next number in a series such as INV/26-27/0007. Sixteen characters at
 * most, letters, digits, hyphen and slash, as GST invoices require.
 */
export function nextInvoiceNumber(taxYearStart: string, existing: string[]): string {
  const year = Number(taxYearStart.slice(0, 4));
  const short = (value: number) => String(value % 100).padStart(2, "0");
  const prefix = `INV/${short(year)}-${short(year + 1)}/`;
  const used = existing
    .filter((number) => number.startsWith(prefix) && /^\d+$/.test(number.slice(prefix.length)))
    .map((number) => Number(number.slice(prefix.length)));
  return `${prefix}${String(Math.max(0, ...used) + 1).padStart(4, "0")}`;
}

type PaymentInput = {
  settled: string;
  alreadySettled: string;
  alreadyIncome: string;
  total: string;
  taxable: string;
  decimals: number;
};

/**
 * The part of a payment that is income. GST collected for the government is
 * not, so each payment is split in proportion and the last takes what is left.
 */
export function incomePart({ settled, alreadySettled, alreadyIncome, total, taxable, decimals }: PaymentInput): string {
  const finishes = new Money(alreadySettled).plus(settled).greaterThanOrEqualTo(total);
  const part = finishes
    ? new Money(taxable).minus(alreadyIncome)
    : new Money(settled).times(taxable).dividedBy(total).toDecimalPlaces(decimals);
  return part.toFixed();
}
