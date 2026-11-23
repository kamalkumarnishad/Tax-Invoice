import { z } from "zod";
import { currencyCode, keysOf, optionalText, taxYearParam, uuid } from "./common";
import { exchangeRate, optionalAmount, positiveAmount, recordDate } from "./money";

export const incomeCategories = {
  freelance: "Freelance",
  consulting: "Consulting",
  royalty: "Royalty",
  interest: "Interest",
  other: "Other",
} as const;

export const paymentMethods = {
  bank_transfer: "Bank transfer",
  upi: "UPI",
  paypal: "PayPal",
  wise: "Wise",
  payoneer: "Payoneer",
  card: "Card",
  other: "Other",
} as const;

export const incomeStatuses = { received: "Received", pending: "Pending", disputed: "Disputed" } as const;

export const incomeSchema = z.object({
  description: z.string().trim().min(1, "Describe this income").max(500, "Use at most 500 characters"),
  clientId: z.union([z.literal(""), uuid]),
  amount: positiveAmount,
  currency: currencyCode,
  exchangeRate,
  paymentDate: recordDate,
  paymentMethod: z.enum(keysOf(paymentMethods)),
  gatewayFee: optionalAmount,
  bankCharges: optionalAmount,
  tdsDeducted: optionalAmount,
  category: z.enum(keysOf(incomeCategories)),
  status: z.enum(keysOf(incomeStatuses)),
  notes: optionalText(2000),
});

/** What the form holds, and what it becomes once checked. */
export type IncomeFormValues = z.input<typeof incomeSchema>;
export type IncomeInput = z.output<typeof incomeSchema>;

const filters = z.object({
  client: uuid.or(z.literal("")).catch(""),
  status: z.enum(["", ...keysOf(incomeStatuses)]).catch(""),
  year: taxYearParam,
});

export const parseIncomeFilters = (raw: Record<string, unknown>) =>
  filters.parse({ client: raw.client ?? "", status: raw.status ?? "", year: raw.year ?? "" });
