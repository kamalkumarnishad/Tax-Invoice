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
