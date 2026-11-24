import { z } from "zod";
import { chargesGst, taxModes } from "@/lib/invoice";
import { indianStates } from "@/lib/states";
import { currencyCode, keysOf, optionalText, uuid } from "./common";
import { incomeCategories, paymentMethods } from "./income";
import { exchangeRate, optionalAmount, positiveAmount, recordDate } from "./money";

export const MAX_ITEMS = 50;

const quantity = z
  .string()
  .trim()
  .regex(/^\d{1,8}(\.\d{1,2})?$/, "Enter a quantity, such as 1.5")
  .refine((value) => Number(value) > 0, "Enter a quantity above zero");

const rate = z
  .string()
  .trim()
  .transform((value) => value || "0")
  .pipe(
    z
      .string()
      .regex(/^\d{1,3}(\.\d{1,2})?$/, "Enter a rate, such as 18")
      .refine((value) => Number(value) <= 100, "Enter a rate up to 100"),
  );

export const invoiceItemSchema = z.object({
  description: z.string().trim().min(1, "Describe this item").max(500, "Use at most 500 characters"),
  quantity,
  unitPrice: optionalAmount,
});

export const invoiceSchema = z
  .object({
    clientId: z.string().refine((value) => uuid.safeParse(value).success, "Choose a client"),
    invoiceNumber: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9/-]{1,16}$/, "Use up to 16 letters, digits, hyphens and slashes"),
    invoiceDate: recordDate,
    dueDate: recordDate,
    currency: currencyCode,
    taxMode: z.enum(keysOf(taxModes)),
    taxRate: rate,
    sacCode: z
      .string()
      .trim()
      .regex(/^(\d{4,8})?$/, "A SAC code has 4 to 8 digits"),
    placeOfSupply: optionalText(100),
    discount: optionalAmount,
    items: z.array(invoiceItemSchema).min(1, "Add at least one item").max(MAX_ITEMS),
    notes: optionalText(2000),
  })
  .refine((v) => v.dueDate >= v.invoiceDate, { path: ["dueDate"], message: "The due date is before the invoice date" })
  .refine((v) => !chargesGst(v.taxMode) || Number(v.taxRate) > 0, { path: ["taxRate"], message: "Enter the GST rate" });

export type InvoiceFormValues = z.input<typeof invoiceSchema>;
export type InvoiceInput = z.output<typeof invoiceSchema>;

export const invoiceFilters = {
  draft: "Drafts",
  unpaid: "Unpaid",
  overdue: "Overdue",
  paid: "Paid",
  cancelled: "Cancelled",
} as const;
export type InvoiceFilter = keyof typeof invoiceFilters | "";

export const parseInvoiceFilter = (raw: unknown): InvoiceFilter =>
  z.enum(["", ...keysOf(invoiceFilters)]).catch("").parse(raw ?? "");

export const paymentSchema = z.object({
  amount: positiveAmount,
  paymentDate: recordDate,
  paymentMethod: z.enum(keysOf(paymentMethods)),
  exchangeRate,
  gatewayFee: optionalAmount,
  bankCharges: optionalAmount,
  tdsDeducted: optionalAmount,
  category: z.enum(keysOf(incomeCategories)),
});

export type PaymentFormValues = z.input<typeof paymentSchema>;
export type PaymentInput = z.output<typeof paymentSchema>;

export const businessSchema = z.object({
  businessName: z.string().trim().min(1, "Enter your name or business name").max(255),
  state: z.enum(["", ...indianStates]),
  address: z.string().trim().min(1, "Enter your address").max(1000, "Use at most 1000 characters"),
  email: z.union([z.literal(""), z.email("Enter a valid email address").max(255)]),
  phone: optionalText(50),
  paymentInstructions: optionalText(1000),
});

export type BusinessInput = z.infer<typeof businessSchema>;
