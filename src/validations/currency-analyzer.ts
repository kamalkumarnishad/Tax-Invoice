import { z } from "zod";
import { currencyCode } from "./common";

export const FIRST_DAY = "2016-01-01";
export const MAX_COMPARED = 4;

export const ranges = {
  "1m": { label: "1 month", months: 1 },
  "3m": { label: "3 months", months: 3 },
  "6m": { label: "6 months", months: 6 },
  "1y": { label: "1 year", months: 12 },
  "5y": { label: "5 years", months: 60 },
  "10y": { label: "10 years", months: 120 },
} as const;
export type RangeKey = keyof typeof ranges;
const DEFAULT_RANGE: RangeKey = "1y";

/** The same day some months earlier, or that month's last day when it is shorter. */
export function monthsBefore(date: string, months: number): string {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const lastDay = new Date(Date.UTC(year, month - months, 0)).getUTCDate();
  return new Date(Date.UTC(year, month - 1 - months, Math.min(day, lastDay))).toISOString().slice(0, 10);
}

const analyzerDate = z.iso.date();
export const rateRequest = z.object({ from: currencyCode, to: currencyCode, date: analyzerDate });

type Raw = Record<string, string | string[] | undefined>;
type Context = { today: string; base: string; codes: string[] };

export type AnalyzerParams = {
  from: string;
  to: string;
  compared: string[];
  /** More were asked for than can be shown. */
  tooMany: boolean;
  /** Empty for dates the user chose. */
  range: RangeKey | "";
  start: string;
  end: string;
  error?: string;
};

const single = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Anyone can edit an address, so anything unusable falls back to a default. */
export function parseAnalyzer(raw: Raw, { today, base, codes }: Context): AnalyzerParams {
  const known = (value: string | string[] | undefined) => codes.find((code) => code === single(value));
  const to = known(raw.to) ?? base;
  const preferred = known(raw.from);
  const from = preferred && preferred !== to ? preferred : to === "USD" ? "EUR" : "USD";

  const asked = [raw.with ?? []].flat();
  const wanted = codes.filter((code) => code !== base && asked.includes(code));
  const chosen = wanted.slice(0, MAX_COMPARED);
  const usual = ["USD", "EUR", "GBP"].filter((code) => code !== base && codes.includes(code));
  const compared = chosen.length > 0 ? chosen : usual;

  const preset = (key: RangeKey) => ({
    range: key,
    start: monthsBefore(today, ranges[key].months),
    end: today,
  });
  const common = { from, to, compared, tooMany: wanted.length > MAX_COMPARED };
  const start = single(raw.start);
  const end = single(raw.end);
  if (start !== undefined || end !== undefined) {
    const fail = (error: string) => ({ ...common, ...preset(DEFAULT_RANGE), error });
    if (!analyzerDate.safeParse(start).success || !analyzerDate.safeParse(end).success) {
      return fail("Enter two valid dates.");
    }
    if (start! < FIRST_DAY) return fail("Rates start on 1 January 2016.");
    if (end! > today) return fail("The end date is in the future.");
    if (start! >= end!) return fail("The end date must be after the start date.");
    return { ...common, range: "", start: start!, end: end! };
  }
  const key = single(raw.range);
  return { ...common, ...preset(key && Object.hasOwn(ranges, key) ? (key as RangeKey) : DEFAULT_RANGE) };
}
