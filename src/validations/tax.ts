import { z } from "zod";
import { ageGroups } from "@/server/services/tax-engine/types";
import { keysOf } from "./common";
import { optionalAmount } from "./money";

export const taxMethods = {
  actual: "Receipts less actual expenses",
  presumptive: "Presumptive scheme (section 58)",
} as const;

const taxInputSchema = z.object({
  ageGroup: z.enum(keysOf(ageGroups)),
  receipts: optionalAmount,
  method: z.enum(keysOf(taxMethods)),
  expenses: optionalAmount,
  cashReceipts: optionalAmount,
  declaredProfit: optionalAmount,
  professionConfirmed: z.boolean(),
  salary: optionalAmount,
  savingsInterest: optionalAmount,
  otherInterest: optionalAmount,
  interestIsOwn: z.boolean().optional(),
  savings: optionalAmount,
  nps: optionalAmount,
  healthSelf: optionalAmount,
  healthParents: optionalAmount,
  parentsSenior: z.boolean(),
  taxDeducted: optionalAmount,
});

export const taxFormSchema = taxInputSchema.extend({
  /** Outside this scope the figures would be wrong, so no estimate is given. */
  scopeConfirmed: z.boolean().refine((confirmed) => confirmed, "Confirm this before calculating"),
});

/** The figures alone, without the confirmation. */
export const toTaxInput = (form: z.output<typeof taxFormSchema>) => taxInputSchema.parse(form);

export type TaxFormValues = z.input<typeof taxFormSchema>;
export type TaxFormInput = z.output<typeof taxFormSchema>;
