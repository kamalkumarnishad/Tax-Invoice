import { z } from "zod";
import { PASSWORD_MAX_LENGTH } from "./auth";

export const CONFIRM_WORD = "DELETE";

const password = z.string().min(1, "Enter your password").max(PASSWORD_MAX_LENGTH, "The password is too long");

export const passwordSchema = z.object({ password });

export const deletionSchema = z.object({
  password,
  confirm: z
    .string()
    .trim()
    .refine((value) => value === CONFIRM_WORD, `Type ${CONFIRM_WORD} in capital letters`),
});
