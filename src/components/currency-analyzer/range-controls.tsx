import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type AnalyzerParams, FIRST_DAY, type RangeKey, ranges } from "@/validations/currency-analyzer";

const PATH = "/app/currency-analyzer";

function period({ range, start, end }: AnalyzerParams): [string, string][] {
  return range
    ? [["range", range]]
    : [
        ["start", start],
        ["end", end],
      ];
}

/** The part of the address that the other forms keep. */
export function kept(params: AnalyzerParams, leaveOut: "pair" | "compared" | "period"): [string, string][] {
  return [
    ...(leaveOut === "pair" ? [] : ([["from", params.from], ["to", params.to]] as [string, string][])),
    ...(leaveOut === "compared" ? [] : params.compared.map((code): [string, string] => ["with", code])),
    ...(leaveOut === "period" ? [] : period(params)),
  ];
}

export function HiddenFields({ fields }: { fields: [string, string][] }) {
  return fields.map(([name, value]) => <input key={`${name}-${value}`} type="hidden" name={name} value={value} />);
}

/** Links and a plain GET form, so a view can be bookmarked and works without JavaScript. */
export function RangeControls({ params, today }: { params: AnalyzerParams; today: string }) {
  const others = kept(params, "period");
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        {Object.entries(ranges).map(([key, { label }]) => (
          <Button key={key} asChild size="sm" variant={params.range === key ? "secondary" : "outline"}>
            <Link
              href={`${PATH}?${new URLSearchParams([...others, ["range", key as RangeKey]])}`}
              scroll={false}
              aria-current={params.range === key ? "true" : undefined}
            >
              {label}
            </Link>
          </Button>
        ))}
      </div>
      <form
        key={`${params.start}${params.end}`}
        action={`${PATH}#history`}
        className="grid grid-cols-2 items-end gap-3 sm:flex sm:flex-wrap"
      >
        <HiddenFields fields={others} />
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor="start">From</Label>
          <Input id="start" name="start" type="date" required min={FIRST_DAY} max={today} defaultValue={params.start} />
        </div>
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor="end">To</Label>
          <Input id="end" name="end" type="date" required min={FIRST_DAY} max={today} defaultValue={params.end} />
        </div>
        <Button type="submit" variant="outline">
          Show dates
        </Button>
      </form>
      {params.error && (
        <p role="alert" className="text-sm text-destructive">
          {params.error} Showing the last year instead.
        </p>
      )}
    </div>
  );
}
