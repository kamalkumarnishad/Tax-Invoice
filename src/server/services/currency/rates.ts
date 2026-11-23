import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { exchangeRates } from "@/db/schema";
import { roundRate } from "@/lib/money";
import type { Tx } from "../shared";

const SOURCE = "frankfurter";
const TIMEOUT_MS = 5000;

export type RateRequest = { from: string; to: string; date: string; today: string };
export type Rate = { rate: string; source: string };

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

const responseSchema = z
  .array(z.object({ base: z.string(), quote: z.string(), rate: z.number().positive() }))
  .length(1);

/** Sends only two currency codes and a date. Returns null when no rate can be had. */
async function fetchRate({ from, to, date }: RateRequest, fetchFn: Fetch): Promise<string | null> {
  const url = `https://api.frankfurter.dev/v2/rates?${new URLSearchParams({ date, base: from, quotes: to })}`;
  try {
    const response = await fetchFn(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    if (!response.ok) return null;
    const [row] = responseSchema.parse(await response.json());
    if (row!.base !== from || row!.quote !== to) return null;
    const rate = roundRate(row!.rate);
    return Number(rate) > 0 ? rate : null;
  } catch (error) {
    console.warn("Exchange rate lookup failed:", error instanceof Error ? error.message : "unknown error");
    return null;
  }
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

  const rate = await fetchRate(request, fetchFn);
  if (!rate) return null;

  // Today's rate can still change, so only past days are kept.
  if (date < today) {
    await db
      .insert(exchangeRates)
      .values({ baseCurrency: from, targetCurrency: to, rate, rateDate: date, source: SOURCE })
      .onConflictDoNothing();
  }
  return { rate, source: SOURCE };
}
