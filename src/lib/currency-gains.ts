import { Decimal } from "decimal.js";
import { add, convert, subtract } from "./money";

const Rate = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

/** Recorded rates this close to the reference rate were probably looked up, not given by a bank. */
const SAME_RATE = "0.0002";

type Payment = {
  /** Before fees, in the foreign currency. GST is never part of it. */
  amount: string;
  /** Reference rate on the invoice date. Null when there is no earlier day to compare with. */
  invoiceRate: string | null;
  /** Reference rate on the payment date. */
  paymentRate: string;
  /** The next three are as recorded, in the user's currency. */
  converted: string;
  netReceived: string;
  tds: string;
  /** Decimal places of the user's currency. */
  decimals: number;
};

export type Breakdown = {
  /** What it was worth at the reference rate when invoiced, or else when paid. */
  start: string;
  movement: string | null;
  margin: string;
  fees: string;
  tds: string;
  received: string;
};

/**
 * Splits the way from the invoice to the money received. The parts are
 * differences between rounded amounts, so start + movement + margin - fees -
 * tds is always exactly what was received.
 */
export function paymentBreakdown(payment: Payment): Breakdown {
  const { amount, invoiceRate, paymentRate, converted, netReceived, tds, decimals } = payment;
  const atPayment = convert(amount, paymentRate, decimals);
  const start = invoiceRate === null ? atPayment : convert(amount, invoiceRate, decimals);
  return {
    start,
    movement: invoiceRate === null ? null : subtract(atPayment, start),
    margin: subtract(converted, atPayment),
    fees: subtract(converted, netReceived, tds),
    tds,
    received: netReceived,
  };
}

export function looksLookedUp(recorded: string, reference: string): boolean {
  return new Rate(recorded).dividedBy(reference).minus(1).abs().lessThanOrEqualTo(SAME_RATE);
}

/** What an unpaid amount has gained or lost so far. */
export function unpaidMovement(amount: string, invoiceRate: string, currentRate: string, decimals: number) {
  const start = convert(amount, invoiceRate, decimals);
  const now = convert(amount, currentRate, decimals);
  return { start, now, movement: subtract(now, start) };
}

export type Totals = { movement: string; margin: string; fees: string; tds: string; received: string };

export function sumBreakdowns(rows: Breakdown[]): Totals {
  const total = (pick: (row: Breakdown) => string) => rows.reduce((sum, row) => add(sum, pick(row)), "0");
  return {
    movement: total((row) => row.movement ?? "0"),
    margin: total((row) => row.margin),
    fees: total((row) => row.fees),
    tds: total((row) => row.tds),
    received: total((row) => row.received),
  };
}
