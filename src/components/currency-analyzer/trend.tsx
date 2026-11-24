import { SelectField } from "@/components/forms/select-field";
import { Button } from "@/components/ui/button";
import { displayRate, stepFor, summarise, thin } from "@/lib/cross-rates";
import { daysBetween, formatCalendarDate, formatMonth } from "@/lib/dates";
import type { Analyzer } from "@/server/queries/currency-analyzer";
import { signed } from "./latest-table";
import { HiddenFields, kept } from "./range-controls";
import { RateChart } from "./rate-chart";

/** Days and months on a short chart, months and years on a long one. */
export function axisLabel(date: string, start: string, end: string): string {
  if (daysBetween(start, end) > 100) return formatMonth(date.slice(0, 7), "compact");
  return formatCalendarDate(date).replace(/ \d{4}$/, "");
}

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="grid content-start gap-1 rounded-lg border p-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="font-mono font-medium tabular-nums">{value}</dd>
      {note && <dd className="text-xs text-muted-foreground">{note}</dd>}
    </div>
  );
}

export function Trend({ params, history, currencies }: Pick<Analyzer, "params" | "history" | "currencies">) {
  const { from, to, start, end } = params;
  const summary = summarise(history);
  const pair = `${from} to ${to}`;
  const figure = (value: { date: string; rate: string }) => ({
    value: displayRate(value.rate),
    note: formatCalendarDate(value.date),
  });

  return (
    <div className="grid grid-cols-1 gap-6">
      <form
        key={pair}
        action="/app/currency-analyzer#history"
        className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_1fr_auto]"
      >
        <HiddenFields fields={kept(params, "pair")} />
        <SelectField id="from" name="from" label="Currency" options={currencies} defaultValue={from} />
        <SelectField id="to" name="to" label="In" options={currencies} defaultValue={to} />
        <Button type="submit" variant="outline">
          Show
        </Button>
      </form>
      {summary ? (
        <>
          <dl className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Figure label="Latest" {...figure(summary.last)} />
            <Figure
              label="Change"
              value={signed(summary.change)}
              note={`since ${formatCalendarDate(summary.first.date)}`}
            />
            <Figure label="High" {...figure(summary.high)} />
            <Figure label="Low" {...figure(summary.low)} />
            <Figure label="Average" value={displayRate(summary.average)} note={`of ${summary.days} days`} />
          </dl>
          <RateChart
            series={[pair]}
            valueHeading={`${to} for 1 ${from}`}
            points={thin(history, stepFor(start, end)).map(({ date, rate }) => ({
              date,
              label: axisLabel(date, start, end),
              fullDate: formatCalendarDate(date),
              values: { [pair]: Number(rate) },
              texts: { [pair]: displayRate(rate) },
            }))}
          />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">There are no rates for {pair} in these dates.</p>
      )}
    </div>
  );
}
