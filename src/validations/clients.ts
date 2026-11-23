import { z } from "zod";
import { countryCodes } from "@/lib/countries";
import { currencyCode, optionalText } from "./common";

const blank = z.literal("");

export const clientSchema = z.object({
  name: z.string().trim().min(1, "Enter the client's name").max(255, "Use at most 255 characters"),
  company: optionalText(255),
  email: z.union([blank, z.email("Enter a valid email address").max(255)]),
  country: z.union([blank, z.string().refine((v) => countryCodes.has(v), "Choose a country")]),
  currency: z.union([blank, currencyCode]),
  taxId: optionalText(100),
  billingAddress: optionalText(1000),
  notes: optionalText(2000),
});

export type ClientInput = z.infer<typeof clientSchema>;

export const blankClient: ClientInput = {
  name: "",
  company: "",
  email: "",
  country: "",
  currency: "",
  taxId: "",
  billingAddress: "",
  notes: "",
};
