import { z } from "zod";

export const PAGE_SIZE = 20;

export const uuid = z.uuid();

/** Optional text: trimmed, with "" meaning not given. */
export const optionalText = (max: number) => z.string().trim().max(max, `Use at most ${max} characters`);

export const currencyCode = z.string().regex(/^[A-Z]{3}$/, "Choose a currency");

/** A tax year's start date in an address, or "" for all years. */
export const taxYearParam = z
  .string()
  .regex(/^20\d{2}-04-01$/)
  .catch("");

export const keysOf = <T extends Record<string, string>>(options: T) =>
  Object.keys(options) as [keyof T & string, ...(keyof T & string)[]];

/** "" becomes null, for writing optional columns. */
export const orNull = <T extends string>(value: T) => (value === "" ? null : value);

type RawSearchParams = Record<string, string | string[] | undefined>;

const listParams = z.object({
  q: z.string().trim().max(100).catch(""),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});

/** Bad values fall back to defaults, because anyone can edit an address. */
export function parseListParams(raw: RawSearchParams) {
  return listParams.parse({ q: raw.q ?? "", page: raw.page ?? 1 });
}

/** Escapes LIKE wildcards so a search for "50%" matches that text. */
export function containsPattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, "\\$&")}%`;
}
