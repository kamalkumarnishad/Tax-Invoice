import { Decimal } from "decimal.js";

/** Arithmetic for the currency analyzer. Rates are decimal strings at full precision until they are shown. */
const Rate = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
const KEPT_DIGITS = 20;

export type RatePoint = { date: string; rate: string };

/** How much of one currency a unit of another buys, from what one euro buys of each. */
export function crossRate(euroToFrom: string, euroToTarget: string): string {
  return new Rate(euroToTarget).dividedBy(euroToFrom).toSignificantDigits(KEPT_DIGITS).toFixed();
}

export function multiplyRates(a: string, b: string): string {
  return new Rate(a).times(b).toFixed();
}

/** Six significant digits, as central banks publish: 92.9148, 0.584101. */
export function displayRate(rate: string): string {
  return new Rate(rate).toSignificantDigits(6).toFixed();
}

/** The change as a percentage with two decimals, such as "-1.25". */
export function percentChange(before: string, after: string): string {
  const change = new Rate(after).minus(before).dividedBy(before).times(100).toDecimalPlaces(2);
  return change.isZero() ? "0.00" : change.toFixed(2);
}

/** Where a rate stands when it started at 100. */
export function indexed(first: string, rate: string): string {
  return new Rate(rate).dividedBy(first).times(100).toFixed(2);
}

export type RateSummary = {
  first: RatePoint;
  last: RatePoint;
  high: RatePoint;
  low: RatePoint;
  average: string;
  change: string;
  days: number;
};

export function summarise(points: RatePoint[]): RateSummary | null {
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last) return null;
  let high = first;
  let low = first;
  let total = new Rate(0);
  for (const point of points) {
    if (new Rate(point.rate).greaterThan(high.rate)) high = point;
    if (new Rate(point.rate).lessThan(low.rate)) low = point;
    total = total.plus(point.rate);
  }
  return {
    first,
    last,
    high,
    low,
    average: total.dividedBy(points.length).toSignificantDigits(KEPT_DIGITS).toFixed(),
    change: percentChange(first.rate, last.rate),
    days: points.length,
  };
}

const DAY_MS = 86_400_000;

export type Step = "day" | "week" | "month";

export function stepFor(start: string, end: string): Step {
  const days = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS;
  if (days <= 400) return "day";
  return days <= 1900 ? "week" : "month";
}

/** The same for every date in one week, from Monday, or in one month. */
function bucket(date: string, step: Step): string {
  if (step === "day") return date;
  if (step === "month") return date.slice(0, 7);
  // 1 January 1970 was a Thursday.
  return String(Math.floor((Date.parse(`${date}T00:00:00Z`) / DAY_MS + 3) / 7));
}

/** The first day, and then the last one of each week or month, so a long chart stays readable. */
export function thin<T extends { date: string }>(points: T[], step: Step): T[] {
  return points.filter((point, index) => {
    const next = points[index + 1];
    return index === 0 || !next || bucket(next.date, step) !== bucket(point.date, step);
  });
}
