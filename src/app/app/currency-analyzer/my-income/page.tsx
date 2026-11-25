import { Coins } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { AnalyzerNav } from "@/components/currency-analyzer/analyzer-nav";
import { Change, PaidCard, UnpaidCard } from "@/components/currency-analyzer/gain-cards";
import { OldRatesAlert } from "@/components/currency-analyzer/old-rates-alert";
import { PageHeader } from "@/components/layouts/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/pagination";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { formatCalendarDate, taxYearLabel } from "@/lib/dates";
import { formatCurrency } from "@/lib/format";
import { isZero, subtract } from "@/lib/money";
import { getCurrencyGains } from "@/server/queries/currency-analyzer";
import { refreshInBackground } from "@/server/services/currency-analyzer/background";
import { PAGE_SIZE, parseListParams } from "@/validations/common";

export const metadata: Metadata = { title: "My income · Currency analyzer" };
export const maxDuration = 120;

const PATH = "/app/currency-analyzer/my-income";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function Tile({ label, note, children }: { label: string; note: string; children: React.ReactNode }) {
  return (
    <div className="grid content-start gap-1 rounded-lg border p-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-lg">{children}</dd>
      <dd className="text-xs text-muted-foreground">{note}</dd>
    </div>
  );
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export default async function MyIncomePage({ searchParams }: Props) {
  const user = await requireUser();
  const raw = await searchParams;
  const lastYear = raw.year === "last";
  const { gains, base, today, updated, range } = await getCurrencyGains(user.id, lastYear);
  after(refreshInBackground);

  const { paid, unpaid, totals, byCurrency } = gains;
  const pages = Math.max(1, Math.ceil(paid.length / PAGE_SIZE));
  const page = Math.min(parseListParams(raw).page, pages);
  const shown = paid.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const fees = isZero(totals.fees) ? "0" : subtract("0", totals.fees);
  const cost = (amount: string) => (
    <span className="font-mono font-medium tabular-nums">{formatCurrency(amount, base)}</span>
  );

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHeader
        title="Currency gain and loss"
        description={`Foreign income received in ${taxYearLabel(range.from)}, in ${base}`}
        action={<AnalyzerNav current="My income" />}
      />
      <Alert>
        <AlertTitle>For information, not for tax returns</AlertTitle>
        <AlertDescription>
          <p>
            These figures use daily reference rates and change nothing in your income, reports or tax estimate. Ask an
            accountant how exchange differences are taxed.
          </p>
        </AlertDescription>
      </Alert>
      {updated ? (
        <OldRatesAlert updated={updated} today={today} />
      ) : (
        <p className="text-sm text-muted-foreground">Rates are still loading. Reload this page in a minute.</p>
      )}
      <nav aria-label="Tax year" className="flex flex-wrap gap-2">
        {[
          { label: "This tax year", href: PATH, current: !lastYear },
          { label: "Last tax year", href: `${PATH}?year=last`, current: lastYear },
        ].map(({ label, href, current }) => (
          <Button key={label} asChild size="sm" variant={current ? "secondary" : "outline"} className="max-sm:min-h-11">
            <Link href={href} aria-current={current ? "page" : undefined}>
              {label}
            </Link>
          </Button>
        ))}
      </nav>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="Rate movement" note="From invoice date to payment">
          <Change amount={totals.movement} currency={base} />
        </Tile>
        <Tile label="Rate margin" note="Your rate against the reference rate that day">
          <Change amount={totals.margin} currency={base} />
        </Tile>
        <Tile label="Fees and charges" note="Gateway fees and bank charges">
          {cost(fees)}
        </Tile>
        <Tile label="Unpaid invoices" note={`As of ${formatCalendarDate(today)}, not final`}>
          <Change amount={gains.unpaidMovement} currency={base} />
        </Tile>
      </dl>
      <div className="grid gap-1 text-sm text-muted-foreground empty:hidden">
        {gains.lookedUp > 0 && (
          <p>
            {plural(gains.lookedUp, "payment uses", "payments use")} a rate that matches the reference rate, so the bank&apos;s
            margin may be missing. To see it, edit the income and enter the rate your bank gave you.
          </p>
        )}
        {gains.missing > 0 && (
          <p>{plural(gains.missing, "payment is", "payments are")} not in the totals, because a reference rate is missing.</p>
        )}
        {gains.unpaidMissing > 0 && (
          <p>
            {plural(gains.unpaidMissing, "unpaid invoice is", "unpaid invoices are")} not in the totals, because a
            reference rate is missing.
          </p>
        )}
        {gains.otherCurrencyRecords > 0 && (
          <p>Records made in another default currency are not included: {gains.otherCurrencyRecords}.</p>
        )}
      </div>
      {byCurrency.length > 0 && (
        <section className="grid grid-cols-1 gap-3">
          <h2 className="text-lg md:text-xl">By currency</h2>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Currency</TableHead>
                  <TableHead className="text-right">Payments</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Movement</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                  <TableHead className="text-right">Fees</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byCurrency.map((row) => (
                  <TableRow key={row.code}>
                    <TableCell>{row.code}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.payments}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {formatCurrency(row.amount, row.code)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Change amount={row.movement} currency={base} word={false} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Change amount={row.margin} currency={base} word={false} />
                    </TableCell>
                    <TableCell className="text-right">
                      {cost(isZero(row.fees) ? "0" : subtract("0", row.fees))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}
      <section className="grid grid-cols-1 gap-3">
        <h2 className="text-lg md:text-xl">Payments</h2>
        {paid.length === 0 ? (
          <EmptyState
            icon={Coins}
            title="No foreign payments"
            description="Income received in another currency this tax year appears here."
          />
        ) : (
          <>
            <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {shown.map((row) => (
                <PaidCard key={row.id} row={row} base={base} />
              ))}
            </ul>
            <Pagination path={PATH} params={{ year: lastYear ? "last" : "" }} page={page} total={paid.length} />
          </>
        )}
      </section>
      {unpaid.length > 0 && (
        <section className="grid grid-cols-1 gap-3">
          <h2 className="text-lg md:text-xl">Unpaid invoices</h2>
          <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {unpaid.map((row) => (
              <UnpaidCard key={row.id} row={row} base={base} />
            ))}
          </ul>
        </section>
      )}
      <p className="text-sm text-muted-foreground">
        Rates are from the European Central Bank, or a central bank average for dirhams. Weekends and holidays use the
        last rate before them. Figures for the latest payments can shift when that day&apos;s rate arrives. GST is left out.
      </p>
    </div>
  );
}
