import { z } from "zod";
import { endOfMonth, monthsBetween, taxYearEnd, taxYearStartFor } from "@/lib/dates";
import { recordDate } from "./money";

export const MAX_REPORT_MONTHS = 24;

export type DateRange = { from: string; to: string };

export function presetRanges(today: string) {
  const thisYear = taxYearStartFor(today);
  const lastYear = `${Number(thisYear.slice(0, 4)) - 1}-04-01`;
  return [
    { label: "This tax year", from: thisYear, to: taxYearEnd(thisYear) },
    { label: "Last tax year", from: lastYear, to: taxYearEnd(lastYear) },
    { label: "This month", from: `${today.slice(0, 8)}01`, to: endOfMonth(today) },
  ];
}

const rangeSchema = z
  .object({ from: recordDate, to: recordDate })
  .refine(({ from, to }) => from <= to, "The end date is before the start date.")
  .refine(
    ({ from, to }) => monthsBetween(from, to).length <= MAX_REPORT_MONTHS,
    `Choose a range of up to ${MAX_REPORT_MONTHS} months.`,
  );

type Raw = { from?: unknown; to?: unknown };

/** The range in an address, the current tax year when there is none, or what is wrong with it. */
export function parseRange(raw: Raw, today: string): DateRange & { error?: string } {
  const [thisYear] = presetRanges(today);
  const fallback = { from: thisYear!.from, to: thisYear!.to };
  if (raw.from === undefined && raw.to === undefined) return fallback;

  const parsed = rangeSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  // An unreadable date can fail the range checks too, so it is reported first.
  const badDate = parsed.error.issues.some((issue) => issue.path.length > 0);
  return { ...fallback, error: badDate ? "Enter two valid dates." : parsed.error.issues[0]!.message };
}
