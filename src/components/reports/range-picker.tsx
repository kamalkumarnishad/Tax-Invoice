import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type DateRange, presetRanges } from "@/validations/reports";

type RangePickerProps = { range: DateRange; today: string; error?: string };

/** A plain GET form, so a report can be bookmarked and works without JavaScript. */
export function RangePicker({ range, today, error }: RangePickerProps) {
  return (
    <div className="grid gap-3 print:hidden">
      <div className="flex flex-wrap gap-2">
        {presetRanges(today).map(({ label, from, to }) => {
          const current = from === range.from && to === range.to;
          return (
            <Button key={label} asChild size="sm" variant={current ? "secondary" : "outline"}>
              <Link href={`/app/reports?from=${from}&to=${to}`} aria-current={current ? "true" : undefined}>
                {label}
              </Link>
            </Button>
          );
        })}
      </div>
      <form key={`${range.from}${range.to}`} className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="from">From</Label>
          <Input id="from" name="from" type="date" required defaultValue={range.from} className="w-40" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="to">To</Label>
          <Input id="to" name="to" type="date" required defaultValue={range.to} className="w-40" />
        </div>
        <Button type="submit" variant="outline">
          Show
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error} Showing this tax year instead.
        </p>
      )}
    </div>
  );
}
