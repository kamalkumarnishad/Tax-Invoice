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

export function formatMonth(month: string, style: "short" | "long", locale = "en-IN"): string {
  const options = style === "short" ? ({ month: "short" } as const) : ({ month: "long", year: "numeric" } as const);
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));
}
