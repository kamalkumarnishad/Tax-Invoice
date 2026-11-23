import { CurrencyDisplay } from "@/components/shared/currency-display";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { percentOf } from "@/lib/money";

type Row = { key: string; name: string; total: string; records: number };
type BreakdownTableProps = { title: string; nameHeading: string; rows: Row[]; whole: string; currency: string };

export function BreakdownTable({ title, nameHeading, rows, whole, currency }: BreakdownTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="text-base md:text-base">{title}</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing in this range.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{nameHeading}</TableHead>
                <TableHead className="text-right">Records</TableHead>
                <TableHead className="text-right">Share</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.key}>
                  <TableCell className="whitespace-normal">{row.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.records}</TableCell>
                  <TableCell className="text-right tabular-nums">{percentOf(row.total, whole)}%</TableCell>
                  <TableCell className="text-right">
                    <CurrencyDisplay amount={row.total} currency={currency} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
