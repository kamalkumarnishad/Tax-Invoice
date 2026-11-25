import Link from "next/link";
import { displayRate, type RatePoint } from "@/lib/cross-rates";
import { formatCalendarDate } from "@/lib/dates";
import { formatCurrency } from "@/lib/format";
import { compare, isNegative, isZero, subtract } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { PaidRow, UnpaidRow } from "@/server/services/currency-analyzer/gains";

/** A plus or minus sign and a word, so colour is never the only sign of a gain or loss. */
export function Change({ amount, currency, word = true }: { amount: string; currency: string; word?: boolean }) {
  const loss = isNegative(amount);
  const none = isZero(amount);
  const text = formatCurrency(amount, currency);
  return (
    <span
      className={cn(
        "font-mono font-medium tabular-nums",
        !none && (loss ? "text-destructive" : "text-success-strong"),
      )}
    >
      {none || loss ? text : `+${text}`}{" "}
      {word && !none && <span className="font-sans text-xs font-normal">{loss ? "loss" : "gain"}</span>}
    </span>
  );
}

type LineProps = { label: string; note?: string; children: React.ReactNode; strong?: boolean };

function Line({ label, note, children, strong }: LineProps) {
  return (
    <div className={cn("flex justify-between gap-4", strong && "border-t pt-2 font-medium")}>
      <dt className="min-w-0">
        <span className={strong ? undefined : "text-muted-foreground"}>{label}</span>
        {note && <span className="block text-xs text-muted-foreground">{note}</span>}
      </dt>
      <dd className="shrink-0 text-right">{children}</dd>
    </div>
  );
}

function Amount({ amount, currency }: { amount: string; currency: string }) {
  return <span className="font-mono tabular-nums">{formatCurrency(amount, currency)}</span>;
}

const rateNote = (point: RatePoint) => `Rate ${displayRate(point.rate)} on ${formatCalendarDate(point.date)}`;

type CardProps = { title: string; href: string; details: string; children: React.ReactNode };

function GainCard({ title, href, details, children }: CardProps) {
  return (
    <li className="grid min-w-0 content-start gap-3 rounded-lg border p-4 text-sm">
      <div>
        <Link href={href} className="font-medium break-words underline-offset-4 hover:underline">
          {title}
        </Link>
        <p className="text-muted-foreground">{details}</p>
      </div>
      {children}
    </li>
  );
}

const MISSING = "There is no reference rate for one of these dates, so this is not in the totals.";

export function PaidCard({ row, base }: { row: PaidRow; base: string }) {
  const { breakdown, invoice, invoiceRate, paymentRate } = row;
  const details = [formatCurrency(row.amount, row.currency), `paid ${formatCalendarDate(row.date)}`, row.client]
    .filter(Boolean)
    .join(" · ");
  return (
    <GainCard title={row.description} href={`/app/income/${row.id}`} details={details}>
      {breakdown && paymentRate ? (
        <dl className="grid gap-2">
          <Line
            label={invoiceRate ? "Value when invoiced" : "Value when paid"}
            note={rateNote(invoiceRate ?? paymentRate)}
          >
            <Amount amount={breakdown.start} currency={base} />
          </Line>
          {breakdown.movement === null ? (
            <Line label="Rate movement" note={invoice ? "Paid on or before the invoice date" : "Not paid for an invoice"}>
              –
            </Line>
          ) : (
            <Line label="Rate movement" note={rateNote(paymentRate)}>
              <Change amount={breakdown.movement} currency={base} />
            </Line>
          )}
          <Line
            label="Rate margin"
            note={
              row.lookedUp
                ? `Your rate ${displayRate(row.recordedRate)} matches the reference rate, so your bank's margin may be missing`
                : `Your rate ${displayRate(row.recordedRate)}`
            }
          >
            <Change amount={breakdown.margin} currency={base} />
          </Line>
          <Line label="Fees and charges">
            <Amount amount={isZero(breakdown.fees) ? "0" : subtract("0", breakdown.fees)} currency={base} />
          </Line>
          {compare(breakdown.tds, "0") > 0 && (
            <Line label="TDS" note="Tax already deducted, not a cost">
              <Amount amount={subtract("0", breakdown.tds)} currency={base} />
            </Line>
          )}
          <Line label="Received" strong>
            <Amount amount={breakdown.received} currency={base} />
          </Line>
        </dl>
      ) : (
        <p className="text-muted-foreground">{MISSING}</p>
      )}
    </GainCard>
  );
}

export function UnpaidCard({ row, base }: { row: UnpaidRow; base: string }) {
  const { result, invoiceRate, currentRate } = row;
  const details = [
    `${formatCurrency(row.amount, row.currency)} unpaid`,
    `invoiced ${formatCalendarDate(row.date)}`,
    row.client,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <GainCard title={row.number} href={`/app/invoices/${row.id}`} details={details}>
      {result && invoiceRate && currentRate ? (
        <dl className="grid gap-2">
          <Line label="Value when invoiced" note={rateNote(invoiceRate)}>
            <Amount amount={result.start} currency={base} />
          </Line>
          <Line label="Value now" note={rateNote(currentRate)}>
            <Amount amount={result.now} currency={base} />
          </Line>
          <Line label="Movement so far" note="Not final until paid" strong>
            <Change amount={result.movement} currency={base} />
          </Line>
        </dl>
      ) : (
        <p className="text-muted-foreground">{MISSING}</p>
      )}
    </GainCard>
  );
}
