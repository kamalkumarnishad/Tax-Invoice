import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { displayRate } from "@/lib/cross-rates";
import { formatCalendarDate } from "@/lib/dates";
import type { LatestRate } from "@/server/services/currency-analyzer/history";

type LatestTableProps = {
  rows: LatestRate[];
  base: string;
  currencies: { value: string; label: string }[];
  updated: string;
};

export const signed = (change: string) => (Number(change) > 0 ? `+${change}%` : `${change}%`);

export function LatestTable({ rows, base, currencies, updated }: LatestTableProps) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">There are no recent rates.</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Currency</TableHead>
          <TableHead className="text-right">{base} for 1</TableHead>
          <TableHead className="text-right">Change</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.code}>
            <TableCell className="whitespace-normal">
              {currencies.find(({ value }) => value === row.code)?.label ?? row.code}
              {row.date !== updated && (
                <span className="block text-xs text-muted-foreground">Rate of {formatCalendarDate(row.date)}</span>
              )}
            </TableCell>
            <TableCell className="text-right font-mono tabular-nums">{displayRate(row.rate)}</TableCell>
            <TableCell className="text-right font-mono tabular-nums">{row.change ? signed(row.change) : "–"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
