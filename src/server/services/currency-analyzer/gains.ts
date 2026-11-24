import "server-only";
import { and, asc, between, count, desc, eq, ne, sum } from "drizzle-orm";
import { clients, currencies, incomeRecords, invoices } from "@/db/schema";
import type { RatePoint } from "@/lib/cross-rates";
import {
  type Breakdown,
  looksLookedUp,
  paymentBreakdown,
  sumBreakdowns,
  type Totals,
  unpaidMovement,
} from "@/lib/currency-gains";
import { add, compare, plain, subtract } from "@/lib/money";
import type { DateRange } from "@/validations/reports";
import type { Tx } from "../shared";
import { ratesOn } from "./history";

type Options = { userId: string; currency: string; today: string; range: DateRange };

export type PaidRow = {
  id: string;
  description: string;
  client: string | null;
  date: string;
  currency: string;
  amount: string;
  recordedRate: string;
  invoice: { id: string; number: string; date: string } | null;
  /** Null when there was no earlier invoice date to compare with. */
  invoiceRate: RatePoint | null;
  paymentRate: RatePoint | null;
  /** Null when a rate is missing, and then the row is in no total. */
  breakdown: Breakdown | null;
  lookedUp: boolean;
};

export type UnpaidRow = {
  id: string;
  number: string;
  client: string | null;
  date: string;
  currency: string;
  amount: string;
  invoiceRate: RatePoint | null;
  currentRate: RatePoint | null;
  result: { start: string; now: string; movement: string } | null;
};

export type CurrencyTotals = Totals & { code: string; payments: number; amount: string };

async function loadPayments(tx: Tx, { userId, currency, range }: Options) {
  return tx
    .select({
      record: incomeRecords,
      client: clients.name,
      invoiceId: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      invoiceDate: invoices.invoiceDate,
    })
    .from(incomeRecords)
    .leftJoin(clients, eq(clients.id, incomeRecords.clientId))
    .leftJoin(invoices, eq(invoices.id, incomeRecords.invoiceId))
    .where(
      and(
        eq(incomeRecords.userId, userId),
        eq(incomeRecords.status, "received"),
        eq(incomeRecords.baseCurrency, currency),
        ne(incomeRecords.currency, currency),
        between(incomeRecords.paymentDate, range.from, range.to),
      ),
    )
    .orderBy(desc(incomeRecords.paymentDate), desc(incomeRecords.createdAt), asc(incomeRecords.id));
}

/** Issued invoices with something left to pay, GST aside, whatever their date. */
async function loadUnpaid(tx: Tx, { userId, currency }: Options) {
  const settled = tx
    .select({ invoiceId: incomeRecords.invoiceId, amount: sum(incomeRecords.amount).as("amount") })
    .from(incomeRecords)
    .where(and(eq(incomeRecords.userId, userId), eq(incomeRecords.status, "received")))
    .groupBy(incomeRecords.invoiceId)
    .as("settled");
  const rows = await tx
    .select({
      id: invoices.id,
      number: invoices.invoiceNumber,
      date: invoices.invoiceDate,
      currency: invoices.currency,
      buyer: invoices.buyer,
      subtotal: invoices.subtotal,
      discount: invoices.discount,
      paid: settled.amount,
    })
    .from(invoices)
    .leftJoin(settled, eq(settled.invoiceId, invoices.id))
    .where(and(eq(invoices.userId, userId), eq(invoices.status, "issued"), ne(invoices.currency, currency)))
    .orderBy(asc(invoices.invoiceDate), asc(invoices.invoiceNumber));
  return rows
    .map((row) => ({ ...row, amount: plain(subtract(row.subtotal, row.discount, row.paid ?? "0")) }))
    .filter((row) => compare(row.amount, "0") > 0);
}

/** Reads only. Nothing here reaches the user's income, reports or tax figures. */
export async function currencyGains(tx: Tx, options: Options) {
  const { userId, currency, today, range } = options;
  const [base] = await tx
    .select({ decimals: currencies.decimalPlaces })
    .from(currencies)
    .where(eq(currencies.code, currency));
  const decimals = base?.decimals ?? 2;
  const payments = await loadPayments(tx, options);
  const open = await loadUnpaid(tx, options);

  const rateOf = await ratesOn(tx, currency, [
    ...payments.flatMap(({ record, invoiceDate }) => [
      { code: record.currency, date: record.paymentDate },
      ...(invoiceDate ? [{ code: record.currency, date: invoiceDate }] : []),
    ]),
    ...open.flatMap((row) => [
      { code: row.currency, date: row.date },
      { code: row.currency, date: today },
    ]),
  ]);

  const paid = payments.map(({ record, client, invoiceId, invoiceNumber, invoiceDate }): PaidRow => {
    const invoice =
      invoiceId && invoiceNumber && invoiceDate ? { id: invoiceId, number: invoiceNumber, date: invoiceDate } : null;
    // Money paid before the invoice was never waiting on the rate.
    const compared = invoice !== null && invoice.date < record.paymentDate;
    const invoiceRate = compared ? rateOf(record.currency, invoice.date) : null;
    const paymentRate = rateOf(record.currency, record.paymentDate);
    const known = paymentRate !== null && (!compared || invoiceRate !== null);
    return {
      id: record.id,
      description: record.description,
      client,
      date: record.paymentDate,
      currency: record.currency,
      amount: plain(record.amount),
      recordedRate: plain(record.exchangeRate),
      invoice,
      invoiceRate,
      paymentRate,
      breakdown: known
        ? paymentBreakdown({
            amount: record.amount,
            invoiceRate: invoiceRate?.rate ?? null,
            paymentRate: paymentRate.rate,
            converted: plain(record.convertedAmount),
            netReceived: plain(record.netReceived),
            tds: plain(record.tdsDeducted),
            decimals,
          })
        : null,
      lookedUp: paymentRate !== null && looksLookedUp(record.exchangeRate, paymentRate.rate),
    };
  });

  const unpaid = open.map((row): UnpaidRow => {
    const currentRate = rateOf(row.currency, today);
    const invoiceRate = row.date < today ? rateOf(row.currency, row.date) : currentRate;
    return {
      id: row.id,
      number: row.number,
      client: row.buyer ? (row.buyer.company ?? row.buyer.name) : null,
      date: row.date,
      currency: row.currency,
      amount: row.amount,
      invoiceRate,
      currentRate,
      result:
        invoiceRate && currentRate ? unpaidMovement(row.amount, invoiceRate.rate, currentRate.rate, decimals) : null,
    };
  });

  const counted = paid.filter((row) => row.breakdown !== null);
  const breakdowns = (rows: PaidRow[]) => rows.flatMap(({ breakdown }) => breakdown ?? []);
  const byCurrency = [...new Set(counted.map((row) => row.currency))].sort().map((code): CurrencyTotals => {
    const rows = counted.filter((row) => row.currency === code);
    return {
      code,
      payments: rows.length,
      amount: rows.reduce((sum, row) => add(sum, row.amount), "0"),
      ...sumBreakdowns(breakdowns(rows)),
    };
  });

  const [others] = await tx
    .select({ value: count() })
    .from(incomeRecords)
    .where(
      and(
        eq(incomeRecords.userId, userId),
        eq(incomeRecords.status, "received"),
        ne(incomeRecords.baseCurrency, currency),
        between(incomeRecords.paymentDate, range.from, range.to),
      ),
    );

  return {
    paid,
    unpaid,
    byCurrency,
    totals: sumBreakdowns(breakdowns(counted)),
    unpaidMovement: unpaid.reduce((sum, row) => add(sum, row.result?.movement ?? "0"), "0"),
    missing: paid.length - counted.length,
    unpaidMissing: unpaid.filter((row) => row.result === null).length,
    lookedUp: counted.filter((row) => row.lookedUp).length,
    otherCurrencyRecords: others!.value,
  };
}

export type CurrencyGains = Awaited<ReturnType<typeof currencyGains>>;
