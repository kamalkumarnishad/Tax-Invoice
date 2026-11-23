import { z } from "zod";
import { currencyCode, keysOf, optionalText, taxYearParam } from "./common";
import { paymentMethods } from "./income";
import { exchangeRate, positiveAmount, recordDate } from "./money";

export const expenseCategories = {
  software: "Software",
  hardware: "Hardware",
  internet: "Internet",
  hosting: "Hosting",
  coworking: "Coworking",
  travel: "Travel",
  meals: "Meals",
  phone: "Phone",
  insurance: "Insurance",
  professional_development: "Professional development",
  marketing: "Marketing",
  office_supplies: "Office supplies",
  professional_fees: "Professional fees",
  other: "Other",
} as const;

export const expenseSchema = z.object({
  description: z.string().trim().min(1, "Describe this expense").max(500, "Use at most 500 characters"),
  vendor: optionalText(255),
  amount: positiveAmount,
  currency: currencyCode,
  exchangeRate,
  expenseDate: recordDate,
  category: z.enum(keysOf(expenseCategories)),
  paymentMethod: z.enum(keysOf(paymentMethods)),
  isDeductible: z.boolean(),
  notes: optionalText(2000),
});

/** What the form holds, and what it becomes once checked. */
export type ExpenseFormValues = z.input<typeof expenseSchema>;
export type ExpenseInput = z.output<typeof expenseSchema>;

const filters = z.object({
  category: z.enum(["", ...keysOf(expenseCategories)]).catch(""),
  year: taxYearParam,
});

export const parseExpenseFilters = (raw: Record<string, unknown>) =>
  filters.parse({ category: raw.category ?? "", year: raw.year ?? "" });
