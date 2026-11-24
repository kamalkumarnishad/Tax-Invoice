import "server-only";
import { z } from "zod";
import { roundRate } from "@/lib/money";

/** Everything but the euro itself that the European Central Bank publishes and this app uses. */
export const ECB_CURRENCIES = ["AUD", "CAD", "GBP", "INR", "JPY", "SGD", "USD"] as const;
export const ECB = "European Central Bank";
export const AVERAGE = "Central bank average";

/** How far back the ECB's short history file reaches, less a margin. */
export const BACKUP_DAYS = 85;

export type Fetch = (url: string, init: RequestInit) => Promise<Response>;
export type Period = { from: string; to: string };
export type DayRates = { date: string; rates: Record<string, string> };

const MAX_BYTES = 2_000_000;

/** Stops reading a reply that is far larger than any real one. */
async function readText(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return text + decoder.decode();
    bytes += value.byteLength;
    if (bytes > MAX_BYTES) {
      await reader.cancel();
      throw new Error("the reply is too large");
    }
    text += decoder.decode(value, { stream: true });
  }
}

async function get(url: string, timeout: number, fetchFn: Fetch): Promise<string> {
  const response = await fetchFn(url, {
    signal: AbortSignal.timeout(timeout),
    cache: "no-store",
    // The addresses are fixed, so being sent elsewhere is never expected.
    redirect: "error",
  });
  if (!response.ok) throw new Error(`status ${response.status}`);
  return readText(response);
}

const positive = z.number().positive().finite();
const ecbReply = z.object({
  base: z.literal("EUR"),
  rates: z.record(z.iso.date(), z.record(z.string(), positive)),
});
const averageReply = z.array(
  z.object({ date: z.iso.date(), base: z.literal("USD"), quote: z.literal("AED"), rate: positive }),
);

/** Only the currencies this app uses, only days that were asked for, oldest first. */
function tidy(days: [string, Record<string, number>][], { from, to }: Period): DayRates[] {
  return days
    .filter(([date]) => date >= from && date <= to)
    .map(([date, all]) => ({
      date,
      rates: Object.fromEntries(
        ECB_CURRENCIES.flatMap((code) => (all[code] === undefined ? [] : [[code, roundRate(all[code])]])),
      ) as Record<string, string>,
    }))
    .filter(({ rates }) => Object.keys(rates).length > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Units of each currency for one euro. Frankfurter passes on the ECB's figures. */
export async function fetchEcb({ from, to }: Period, fetchFn: Fetch): Promise<DayRates[]> {
  const query = new URLSearchParams({ base: "EUR", symbols: ECB_CURRENCIES.join(",") });
  const text = await get(`https://api.frankfurter.dev/v1/${from}..${to}?${query}`, 20_000, fetchFn);
  return tidy(Object.entries(ecbReply.parse(JSON.parse(text)).rates), { from, to });
}

/** The same figures from the ECB itself, for the last 90 days. */
export async function fetchEcbBackup(period: Period, fetchFn: Fetch): Promise<DayRates[]> {
  const text = await get("https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml", 20_000, fetchFn);
  // Matched as text rather than parsed, so nothing in the file can be expanded or fetched.
  const days = [...text.matchAll(/<Cube time=["'](\d{4}-\d{2}-\d{2})["']>(.*?)<\/Cube>/gs)].map(
    ([, date, body]): [string, Record<string, number>] => [
      z.iso.date().parse(date),
      Object.fromEntries(
        [...body!.matchAll(/currency=["']([A-Z]{3})["'] rate=["']([\d.]+)["']/g)].map(([, code, rate]) => [
          code!,
          positive.parse(Number(rate)),
        ]),
      ),
    ],
  );
  if (days.length === 0) throw new Error("no rates in the file");
  return tidy(days, period);
}

/** Dirhams for one US dollar, which the ECB does not publish. */
export async function fetchDirham({ from, to }: Period, fetchFn: Fetch): Promise<Map<string, string>> {
  const query = new URLSearchParams({ from, to, base: "USD", quotes: "AED" });
  const text = await get(`https://api.frankfurter.dev/v2/rates?${query}`, 45_000, fetchFn);
  return new Map(averageReply.parse(JSON.parse(text)).map(({ date, rate }) => [date, roundRate(rate)]));
}
