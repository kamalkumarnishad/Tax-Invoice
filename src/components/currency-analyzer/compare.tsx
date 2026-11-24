import Form from "next/form";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { displayRate } from "@/lib/cross-rates";
import { formatCalendarDate } from "@/lib/dates";
import type { Analyzer } from "@/server/queries/currency-analyzer";
import { MAX_COMPARED } from "@/validations/currency-analyzer";
import { signed } from "./latest-table";
import { HiddenFields, kept } from "./range-controls";
import { RateChart } from "./rate-chart";
import { axisLabel } from "./trend";

type CompareProps = Pick<Analyzer, "params" | "comparison" | "currencies" | "base">;

export function Compare({ params, comparison, currencies, base }: CompareProps) {
  const { compared, start, end } = params;
  return (
    <div className="grid grid-cols-1 gap-6">
      <Form key={compared.join()} action="/app/currency-analyzer" scroll={false} className="grid gap-3">
        <HiddenFields fields={kept(params, "compared")} />
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm text-muted-foreground">Choose up to {MAX_COMPARED} currencies</legend>
          <div className="flex flex-wrap gap-x-4">
            {currencies
              .filter(({ value }) => value !== base)
              .map(({ value }) => (
                <label key={value} className="flex min-h-11 items-center gap-2 pr-2 text-sm">
                  <input
                    type="checkbox"
                    name="with"
                    value={value}
                    defaultChecked={compared.includes(value)}
                    className="size-4 accent-primary"
                  />
                  {value}
                </label>
              ))}
          </div>
        </fieldset>
        <Button type="submit" variant="outline" className="w-fit max-sm:min-h-11">
          Compare
        </Button>
        {params.tooMany && (
          <p role="alert" className="text-sm text-destructive">
            Only {MAX_COMPARED} currencies fit. Showing {compared.join(", ")}.
          </p>
        )}
      </Form>
      {comparison ? (
        <>
          <p className="text-sm text-muted-foreground">
            Each currency&apos;s value in {base}, starting at 100 on {formatCalendarDate(comparison.points[0]!.date)}. A
            higher line has gained more.
          </p>
          <RateChart
            series={compared}
            valueHeading={`Value in ${base}, starting at 100`}
            points={comparison.points.map(({ date, values }) => ({
              date,
              label: axisLabel(date, start, end),
              fullDate: formatCalendarDate(date),
              values: Object.fromEntries(Object.entries(values).map(([code, value]) => [code, Number(value)])),
              texts: values,
            }))}
          />
          <Table className="text-xs sm:text-sm [&_td]:px-1 [&_th]:px-1 sm:[&_td]:px-2 sm:[&_th]:px-2">
            <TableHeader>
              <TableRow>
                <TableHead>Currency</TableHead>
                <TableHead className="text-right">Start</TableHead>
                <TableHead className="text-right">End</TableHead>
                <TableHead className="text-right">Change</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {comparison.rows.map((row) => (
                <TableRow key={row.code}>
                  <TableCell>{row.code}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{displayRate(row.first)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{displayRate(row.last)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{signed(row.change)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          These currencies have no rates on the same days in this range.
        </p>
      )}
    </div>
  );
}
