import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/format";
import { isZero, subtract } from "@/lib/money";
import type { CurrencyTotals } from "@/server/services/currency-analyzer/gains";
import { Change } from "./gain-cards";

type ByCurrencyProps = { rows: CurrencyTotals[]; base: string };

function Cost({ amount, base }: { amount: string; base: string }) {
  return (
    <span className="font-mono font-medium tabular-nums">
      {formatCurrency(isZero(amount) ? "0" : subtract("0", amount), base)}
    </span>
  );
}

/** A table, or cards on a phone, where six columns do not fit. */
export function ByCurrency({ rows, base }: ByCurrencyProps) {
  return (
    <>
      <ul className="grid grid-cols-1 gap-3 sm:hidden">
        {rows.map((row) => (
          <li key={row.code} className="grid gap-2 rounded-lg border p-4 text-sm">
            <p className="flex justify-between gap-4 font-medium">
              <span>{row.code}</span>
              <span className="font-mono tabular-nums">{formatCurrency(row.amount, row.code)}</span>
            </p>
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 [&_dd]:text-right [&_dt]:text-muted-foreground">
              <dt>Payments</dt>
              <dd className="tabular-nums">{row.payments}</dd>
              <dt>Rate movement</dt>
              <dd>
                <Change amount={row.movement} currency={base} />
              </dd>
              <dt>Rate margin</dt>
              <dd>
                <Change amount={row.margin} currency={base} />
              </dd>
              <dt>Fees and charges</dt>
              <dd>
                <Cost amount={row.fees} base={base} />
              </dd>
            </dl>
          </li>
        ))}
      </ul>
      <div className="hidden rounded-lg border sm:block">
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
            {rows.map((row) => (
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
                  <Cost amount={row.fees} base={base} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
