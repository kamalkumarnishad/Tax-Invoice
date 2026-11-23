import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { exchangeRates } from "@/db/schema";
import { roundRate } from "@/lib/money";
import type { Tx } from "../shared";

const TIMEOUT_MS = 5000;
const PREFERRED_SOURCE = "European Central Bank";

export type RateRequest = { from: string; to: string; date: string; today: string };
export type Rate = { rate: string; source: string };

type Fetch = (url: string, init: RequestInit) => Promise<Response>;
type Provider = {
  source: string;
  url: (request: RateRequest) => string;
  /** The rate in the response, or undefined when it is for something else. */
  read: (body: unknown, request: RateRequest) => number | undefined;
};

const positive = z.number().positive();
const ecbBody = z.object({ base: z.string(), rates: z.record(z.string(), positive) });
const averageBody = z.array(z.object({ base: z.string(), quote: z.string(), rate: positive })).length(1);

// In order of preference. Requests carry only two currency codes and a date.
const providers: Provider[] = [
  {
    // For a weekend or holiday this answers with the last business day before it.
    source: PREFERRED_SOURCE,
    url: ({ from, to, date }) =>
      `https://api.frankfurter.dev/v1/${date}?${new URLSearchParams({ base: from, symbols: to })}`,
    read: (body, { from, to }) => {
      const { base, rates } = ecbBody.parse(body);
      return base === from ? rates[to] : undefined;
    },
  },
  {
    // Covers currencies the ECB does not publish, such as the UAE dirham.
    source: "Central bank average",
    url: ({ from, to, date }) =>
      `https://api.frankfurter.dev/v2/rates?${new URLSearchParams({ date, base: from, quotes: to })}`,
    read: (body, { from, to }) => {
      const [row] = averageBody.parse(body);
      return row!.base === from && row!.quote === to ? row!.rate : undefined;
    },
  },
];

async function fetchFrom(provider: Provider, request: RateRequest, fetchFn: Fetch): Promise<Rate | null> {
  try {
    const response = await fetchFn(provider.url(request), {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const value = provider.read(await response.json(), request);
    if (value === undefined) return null;
    const rate = roundRate(value);
    return Number(rate) > 0 ? { rate, source: provider.source } : null;
  } catch (error) {
    console.warn(`${provider.source} lookup failed:`, error instanceof Error ? error.message : "unknown error");
    return null;
  }
}

async function fetchRate(request: RateRequest, fetchFn: Fetch): Promise<Rate | null> {
  for (const provider of providers) {
    const rate = await fetchFrom(provider, request, fetchFn);
    if (rate) return rate;
  }
  return null;
}

/**
 * The rate for one calendar date, from storage or else the provider.
 * `db` must be the full-access connection: rates are shared by all users, so
 * users may read them but not write them. Codes must be checked beforehand.
 */
export async function getRate(db: Tx, request: RateRequest, fetchFn: Fetch = fetch): Promise<Rate | null> {
  const { from, to, date, today } = request;
  if (from === to) return { rate: "1", source: "same currency" };
  if (date > today) return null;

  const [stored] = await db
    .select({ rate: exchangeRates.rate, source: exchangeRates.source })
    .from(exchangeRates)
    .where(
      and(
        eq(exchangeRates.baseCurrency, from),
        eq(exchangeRates.targetCurrency, to),
        eq(exchangeRates.rateDate, date),
      ),
    )
    .orderBy(desc(exchangeRates.createdAt))
    .limit(1);
  if (stored) return stored;

  const fetched = await fetchRate(request, fetchFn);
  if (!fetched) return null;

  // Today's rate can still change. A fallback rate may only stand in for an
  // outage, so it must not become that day's rate for good.
  if (date < today && fetched.source === PREFERRED_SOURCE) {
    await db
      .insert(exchangeRates)
      .values({ baseCurrency: from, targetCurrency: to, ...fetched, rateDate: date })
      .onConflictDoNothing();
  }
  return fetched;
}
