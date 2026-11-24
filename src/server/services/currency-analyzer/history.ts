import "server-only";
import { and, asc, between, inArray } from "drizzle-orm";
import { referenceRates } from "@/db/schema";
import { crossRate, indexed, multiplyRates, percentChange, type RatePoint, stepFor, thin } from "@/lib/cross-rates";
import { addDays } from "@/lib/dates";
import type { Tx } from "../shared";

/** Longer than any gap between two days with rates, which is five days at Easter. */
const LOOK_BACK_DAYS = 14;

/** What one euro buys of each currency that is known on a day. */
type Day = { date: string; euro: Map<string, string> };

/** Stored rates needed for a currency: dirhams are only known against the dollar. */
const stored = (code: string) => (code === "EUR" ? [] : code === "AED" ? ["AED", "USD"] : [code]);

/** Oldest first. Runs as the user, who may read these shared rates. */
async function loadDays(tx: Tx, codes: string[], from: string, to: string): Promise<Day[]> {
  const needed = [...new Set(codes.flatMap(stored))];
  if (needed.length === 0) return [];
  const rows = await tx
    .select({
      currency: referenceRates.currency,
      date: referenceRates.rateDate,
      base: referenceRates.baseCurrency,
      rate: referenceRates.rate,
    })
    .from(referenceRates)
    .where(and(inArray(referenceRates.currency, needed), between(referenceRates.rateDate, from, to)))
    .orderBy(asc(referenceRates.rateDate));

  const days: Day[] = [];
  const againstDollar = new Map<string, string>();
  for (const { currency, date, base, rate } of rows) {
    let day = days.at(-1);
    if (day?.date !== date) {
      day = { date, euro: new Map([["EUR", "1"]]) };
      days.push(day);
    }
    if (base === "EUR") day.euro.set(currency, rate);
    else againstDollar.set(date, rate);
  }
  for (const { date, euro } of days) {
    const dirham = againstDollar.get(date);
    const dollar = euro.get("USD");
    if (dirham && dollar) euro.set("AED", multiplyRates(dollar, dirham));
  }
  return days;
}

/** Only days on which both currencies are known, so a rate never mixes two days. */
function pairPoints(days: Day[], from: string, to: string): RatePoint[] {
  return days.flatMap(({ date, euro }) => {
    const a = euro.get(from);
    const b = euro.get(to);
    return a && b ? [{ date, rate: crossRate(a, b) }] : [];
  });
}

/** The rate for a date, or for the last day before it that has one. */
export async function rateOn(tx: Tx, from: string, to: string, date: string): Promise<RatePoint | null> {
  if (from === to) return { date, rate: "1" };
  const days = await loadDays(tx, [from, to], addDays(date, -LOOK_BACK_DAYS), date);
  return pairPoints(days, from, to).at(-1) ?? null;
}

type Wanted = { code: string; date: string };

/**
 * Looks up many dates with one query. Like `rateOn`, the answer is the rate for
 * a date, or for the last day before it that has one, within two weeks.
 */
export async function ratesOn(
  tx: Tx,
  base: string,
  wanted: Wanted[],
): Promise<(code: string, date: string) => RatePoint | null> {
  const dates = wanted.map(({ date }) => date).sort();
  const first = dates[0];
  const last = dates.at(-1);
  if (!first || !last) return () => null;

  const codes = [...new Set(wanted.map(({ code }) => code))];
  const days = await loadDays(tx, [base, ...codes], addDays(first, -LOOK_BACK_DAYS), last);
  const points = new Map(codes.map((code) => [code, pairPoints(days, code, base)]));
  return (code, date) => {
    if (code === base) return { date, rate: "1" };
    const earliest = addDays(date, -LOOK_BACK_DAYS);
    const found = points.get(code)?.findLast((point) => point.date <= date);
    return found && found.date >= earliest ? found : null;
  };
}

/** Every day in the range that has a rate. */
export async function pairHistory(tx: Tx, from: string, to: string, start: string, end: string): Promise<RatePoint[]> {
  return pairPoints(await loadDays(tx, [from, to], start, end), from, to);
}

export type LatestRate = { code: string; date: string; rate: string; change: string | null };

/** What one unit of each other currency is worth in `base`, with the change since the day before. */
export async function latestRates(tx: Tx, base: string, codes: string[], today: string): Promise<LatestRate[]> {
  const days = await loadDays(tx, [base, ...codes], addDays(today, -LOOK_BACK_DAYS), today);
  return codes
    .filter((code) => code !== base)
    .flatMap((code) => {
      const points = pairPoints(days, code, base);
      const last = points.at(-1);
      const before = points.at(-2);
      if (!last) return [];
      return [{ code, ...last, change: before ? percentChange(before.rate, last.rate) : null }];
    });
}

export type Comparison = {
  /** Each currency's worth in the base currency, as 100 on the first day. */
  points: { date: string; values: Record<string, string> }[];
  rows: { code: string; first: string; last: string; change: string }[];
};

/** All currencies start on the same day, the first on which every one is known. */
export async function compareCurrencies(
  tx: Tx,
  base: string,
  codes: string[],
  start: string,
  end: string,
): Promise<Comparison | null> {
  const wanted = [base, ...codes];
  const loaded = await loadDays(tx, wanted, start, end);
  const complete = loaded.filter(({ euro }) => wanted.every((code) => euro.has(code)));
  // The first and last days are always kept, so the changes below are exact.
  const days = thin(complete, stepFor(start, end));
  const series = new Map(codes.map((code) => [code, pairPoints(days, code, base)]));
  const first = days[0];
  if (!first) return null;

  const points = days.map(({ date }, index) => ({
    date,
    values: Object.fromEntries(
      codes.map((code) => {
        const rates = series.get(code)!;
        return [code, indexed(rates[0]!.rate, rates[index]!.rate)];
      }),
    ),
  }));
  return {
    points,
    rows: codes.map((code) => {
      const rates = series.get(code)!;
      const [from, to] = [rates[0]!.rate, rates.at(-1)!.rate];
      return { code, first: from, last: to, change: percentChange(from, to) };
    }),
  };
}
