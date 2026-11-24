/** Calendar dates are "YYYY-MM-DD" strings, so no time zone can shift them. */

export function todayIn(timeZone: string, now = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone, dateStyle: "short" }).format(now);
}

/** India's financial year runs from 1 April to 31 March. */
export function taxYearStartFor(date: string): string {
  const year = Number(date.slice(0, 4));
  return `${date.slice(5) < "04-01" ? year - 1 : year}-04-01`;
}

export function taxYearLabel(start: string): string {
  const year = Number(start.slice(0, 4));
  return `FY ${year}-${String((year + 1) % 100).padStart(2, "0")}`;
}

export function taxYearEnd(start: string): string {
  return `${Number(start.slice(0, 4)) + 1}-03-31`;
}

export function formatCalendarDate(date: string, locale = "en-IN"): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

/** "2026-04" to "2027-03" for the year starting 2026-04-01. */
export function monthsOfTaxYear(start: string): string[] {
  const year = Number(start.slice(0, 4));
  return Array.from({ length: 12 }, (_, index) => {
    const month = ((index + 3) % 12) + 1;
    return `${month < 4 ? year + 1 : year}-${String(month).padStart(2, "0")}`;
  });
}

/** Every month from one date to another, both included. */
export function monthsBetween(from: string, to: string): string[] {
  const index = (date: string) => Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1;
  const first = index(from);
  return Array.from({ length: Math.max(0, index(to) - first + 1) }, (_, offset) => {
    const month = first + offset;
    return `${Math.floor(month / 12)}-${String((month % 12) + 1).padStart(2, "0")}`;
  });
}

export function endOfMonth(date: string): string {
  // Day 0 of the next month is the last day of this one.
  const last = new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0)).getUTCDate();
  return `${date.slice(0, 8)}${String(last).padStart(2, "0")}`;
}

const monthStyles = {
  short: { month: "short" },
  compact: { month: "short", year: "2-digit" },
  long: { month: "long", year: "numeric" },
} as const;

export function formatMonth(month: string, style: keyof typeof monthStyles, locale = "en-IN"): string {
  return new Intl.DateTimeFormat(locale, { ...monthStyles[style], timeZone: "UTC" }).format(
    new Date(`${month}-01T00:00:00Z`),
  );
}

export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** Negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
}
