import "server-only";
import { and, desc, eq, gte, lte, max, sql } from "drizzle-orm";
import { rateRefreshes, referenceRates } from "@/db/schema";
import { addDays, todayIn } from "@/lib/dates";
import { compare, percentOf, subtract } from "@/lib/money";
import type { Tx } from "../shared";
import {
  AVERAGE,
  BACKUP_DAYS,
  type DayRates,
  ECB,
  type Fetch,
  fetchDirham,
  fetchEcb,
  fetchEcbBackup,
  type Period,
} from "./sources";

/** The last working day before 2016, so that the first days of 2016 have a rate. */
export const HISTORY_START = "2015-12-31";
const MAX_MOVE_PERCENT = "10";
const SAME_PERCENT = "0.1";
const INSERT_ROWS = 1000;
const WAIT_MINUTES = 15;

type Options = { now: Date; fetchFn?: Fetch };
export type Refreshed = { saved: number; failed: string[] };

const message = (error: unknown) => (error instanceof Error ? error.message : "unknown error");

function movePercent(before: string, after: string): string {
  const change = percentOf(subtract(after, before), before);
  return change.startsWith("-") ? change.slice(1) : change;
}
const jumped = (before: string | undefined, after: string) =>
  before !== undefined && compare(movePercent(before, after), MAX_MOVE_PERCENT) > 0;

/** The ECB works in its own time zone and publishes at about 16:00 on working days. */
export function expectedDate(now: Date): string {
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", timeStyle: "short" }).format(now);
  let date = todayIn("Europe/Berlin", now);
  if (time < "16:30") date = addDays(date, -1);
  while ([0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay())) date = addDays(date, -1);
  return date;
}

export async function latestDate(db: Tx, baseCurrency = "EUR"): Promise<string | null> {
  const [row] = await db
    .select({ date: max(referenceRates.rateDate) })
    .from(referenceRates)
    .where(eq(referenceRates.baseCurrency, baseCurrency));
  return row?.date ?? null;
}

type NewRate = typeof referenceRates.$inferInsert;

async function save(db: Tx, rows: NewRate[]): Promise<number> {
  // All or nothing: a half-saved day would look complete and never be fetched again.
  return db.transaction(async (tx) => {
    let saved = 0;
    for (let i = 0; i < rows.length; i += INSERT_ROWS) {
      const inserted = await tx
        .insert(referenceRates)
        .values(rows.slice(i, i + INSERT_ROWS))
        .onConflictDoNothing()
        .returning({ currency: referenceRates.currency });
      saved += inserted.length;
    }
    return saved;
  });
}

async function fetchDays(period: Period, today: string, fetchFn: Fetch) {
  try {
    return { days: await fetchEcb(period, fetchFn), fromBackup: false };
  } catch (error) {
    console.warn("Frankfurter lookup failed:", message(error));
    // The backup is too short to fill an empty table, and would leave a gap that is never filled.
    if (period.from < addDays(today, -BACKUP_DAYS)) throw error;
    return { days: await fetchEcbBackup(period, fetchFn), fromBackup: true };
  }
}

/** Whether the other ECB source gives the same figure. */
async function confirm(date: string, code: string, rate: string, today: string, fromBackup: boolean, fetchFn: Fetch) {
  // Older than the backup reaches, so it is settled history.
  if (date < addDays(today, -BACKUP_DAYS)) return true;
  const other = fromBackup ? fetchEcb : fetchEcbBackup;
  try {
    const [day] = await other({ from: date, to: date }, fetchFn);
    const second = day?.rates[code];
    return second !== undefined && compare(movePercent(second, rate), SAME_PERCENT) <= 0;
  } catch (error) {
    console.warn("Rate check failed:", message(error));
    return false;
  }
}

async function latestRates(db: Tx, date: string): Promise<Record<string, string>> {
  const rows = await db
    .select({ currency: referenceRates.currency, rate: referenceRates.rate })
    .from(referenceRates)
    .where(and(eq(referenceRates.rateDate, date), eq(referenceRates.baseCurrency, "EUR")));
  return Object.fromEntries(rows.map(({ currency, rate }) => [currency, rate]));
}

async function refreshEcb(db: Tx, now: Date, fetchFn: Fetch): Promise<number> {
  const today = todayIn("Europe/Berlin", now);
  const latest = await latestDate(db);
  const from = latest ? addDays(latest, 1) : HISTORY_START;
  if (from > today) return 0;

  const { days, fromBackup } = await fetchDays({ from, to: today }, today, fetchFn);
  let before = latest ? await latestRates(db, latest) : {};
  const accepted: DayRates[] = [];
  let held: string | null = null;
  for (const day of days) {
    for (const [code, rate] of Object.entries(day.rates)) {
      if (!jumped(before[code], rate)) continue;
      if (!(await confirm(day.date, code, rate, today, fromBackup, fetchFn))) held = `${code} on ${day.date}`;
    }
    // Later days wait too, so that the held one is looked at again next time.
    if (held) break;
    accepted.push(day);
    before = { ...before, ...day.rates };
  }
  const saved = await save(
    db,
    accepted.flatMap(({ date, rates }) =>
      Object.entries(rates).map(([currency, rate]) => ({
        currency,
        rateDate: date,
        baseCurrency: "EUR",
        rate,
        source: ECB,
      })),
    ),
  );
  if (held) throw new Error(`unconfirmed jump in ${held}`);
  return saved;
}

/** Only for days the ECB has published, so every currency covers the same days. */
async function refreshDirham(db: Tx, fetchFn: Fetch): Promise<number> {
  const [latest] = await db
    .select({ date: referenceRates.rateDate, rate: referenceRates.rate })
    .from(referenceRates)
    .where(eq(referenceRates.currency, "AED"))
    .orderBy(desc(referenceRates.rateDate))
    .limit(1);
  const to = await latestDate(db);
  const from = latest ? addDays(latest.date, 1) : HISTORY_START;
  if (!to || from > to) return 0;

  const rates = await fetchDirham({ from, to }, fetchFn);
  const days = await db
    .selectDistinct({ date: referenceRates.rateDate })
    .from(referenceRates)
    .where(
      and(eq(referenceRates.baseCurrency, "EUR"), gte(referenceRates.rateDate, from), lte(referenceRates.rateDate, to)),
    )
    .orderBy(referenceRates.rateDate);
  let before = latest?.rate;
  const rows: NewRate[] = [];
  let held: string | null = null;
  for (const { date } of days) {
    const rate = rates.get(date);
    if (!rate) continue;
    if (jumped(before, rate)) {
      held = date;
      break;
    }
    rows.push({ currency: "AED", rateDate: date, baseCurrency: "USD", rate, source: AVERAGE });
    before = rate;
  }
  const saved = await save(db, rows);
  if (held) throw new Error(`unconfirmed jump in AED on ${held}`);
  return saved;
}

/**
 * Saves any rates published since the last time. `db` must be the full-access
 * connection, as users may read these rates but not write them. Never throws
 * for a failing source: the saved rates are still good.
 */
export async function refreshRates(db: Tx, { now, fetchFn = fetch }: Options): Promise<Refreshed> {
  const result: Refreshed = { saved: 0, failed: [] };
  for (const [name, run] of [
    [ECB, () => refreshEcb(db, now, fetchFn)],
    [AVERAGE, () => refreshDirham(db, fetchFn)],
  ] as const) {
    try {
      result.saved += await run();
    } catch (error) {
      console.warn(`${name} refresh failed:`, message(error));
      result.failed.push(name);
    }
  }
  return result;
}

/** For visits to the page: does nothing when rates are current or were tried minutes ago. */
export async function refreshIfStale(db: Tx, options: Options): Promise<Refreshed | null> {
  const expected = expectedDate(options.now);
  const [euro, dirham] = [await latestDate(db), await latestDate(db, "USD")];
  if (euro && dirham && euro >= expected && dirham >= euro) return null;

  // One statement, so of many visitors at once only one goes on.
  const limit = new Date(options.now.getTime() - WAIT_MINUTES * 60_000);
  const claimed = await db
    .insert(rateRefreshes)
    .values({ id: 1, attemptedAt: options.now })
    .onConflictDoUpdate({
      target: rateRefreshes.id,
      set: { attemptedAt: options.now },
      setWhere: sql`${rateRefreshes.attemptedAt} <= ${limit.toISOString()}::timestamptz`,
    })
    .returning({ id: rateRefreshes.id });
  return claimed.length > 0 ? refreshRates(db, options) : null;
}
