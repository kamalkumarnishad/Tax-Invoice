import "server-only";
import { withUser } from "@/lib/db";
import { currencyGains } from "@/server/services/currency-analyzer/gains";
import { compareCurrencies, latestRates, pairHistory, rateOn } from "@/server/services/currency-analyzer/history";
import { latestDate } from "@/server/services/currency-analyzer/refresh";
import { parseAnalyzer } from "@/validations/currency-analyzer";
import { presetRanges } from "@/validations/reports";
import { getCurrencies, getUserDefaults } from "./settings";

type Raw = Parameters<typeof parseAnalyzer>[0];

export async function getAnalyzer(userId: string, raw: Raw) {
  const [currencies, { currency: base, today }] = await Promise.all([getCurrencies(userId), getUserDefaults(userId)]);
  const codes = currencies.map(({ value }) => value);
  const params = parseAnalyzer(raw, { today, base, codes });
  const { from, to, compared, start, end } = params;

  const rates = await withUser(userId, async (tx) => ({
    updated: await latestDate(tx),
    current: await rateOn(tx, from, to, today),
    latest: await latestRates(tx, base, codes, today),
    history: await pairHistory(tx, from, to, start, end),
    comparison: await compareCurrencies(tx, base, compared, start, end),
  }));
  return { ...rates, currencies, base, today, params };
}

export type Analyzer = Awaited<ReturnType<typeof getAnalyzer>>;

export async function getCurrencyGains(userId: string, lastYear: boolean) {
  const { currency: base, today } = await getUserDefaults(userId);
  const [thisYear, previous] = presetRanges(today);
  const { from, to } = lastYear ? previous! : thisYear!;
  const range = { from, to };
  const result = await withUser(userId, async (tx) => ({
    updated: await latestDate(tx),
    gains: await currencyGains(tx, { userId, currency: base, today, range }),
  }));
  return { ...result, base, today, range };
}
