import { CurrencyDisplay } from "@/components/shared/currency-display";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMonth } from "@/lib/dates";
import { taxModes } from "@/lib/invoice";
import { half } from "@/lib/money";
import type { GstSummary } from "@/server/services/gst/summary";

export function SalesTable({ sales }: { sales: GstSummary["sales"] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Month</TableHead>
          <TableHead>GST</TableHead>
          <TableHead className="text-right">Invoices</TableHead>
          <TableHead className="text-right">Taxable value</TableHead>
          <TableHead className="text-right">IGST</TableHead>
          <TableHead className="text-right">CGST</TableHead>
          <TableHead className="text-right">SGST</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sales.map((row) => {
          const split = half(row.tax);
          const taxes = [
            { name: "IGST", amount: row.taxMode === "igst" ? row.tax : null },
            { name: "CGST", amount: row.taxMode === "cgst_sgst" ? split : null },
            { name: "SGST", amount: row.taxMode === "cgst_sgst" ? split : null },
          ];
          return (
            <TableRow key={`${row.month}-${row.taxMode}-${row.currency}`}>
              <TableCell>{formatMonth(row.month, "compact")}</TableCell>
              <TableCell>{taxModes[row.taxMode]}</TableCell>
              <TableCell className="text-right tabular-nums">{row.invoices}</TableCell>
              <TableCell className="text-right">
                <CurrencyDisplay amount={row.taxable} currency={row.currency} />
              </TableCell>
              {taxes.map(({ name, amount }) => (
                <TableCell key={name} className="text-right">
                  {amount ? <CurrencyDisplay amount={amount} currency={row.currency} /> : "–"}
                </TableCell>
              ))}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
