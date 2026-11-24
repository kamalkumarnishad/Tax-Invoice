"use client";

import { ArrowLeftRight } from "lucide-react";
import { useRef, useState } from "react";
import { SelectField } from "@/components/forms/select-field";
import { TextField } from "@/components/forms/text-field";
import { Button } from "@/components/ui/button";
import { displayRate } from "@/lib/cross-rates";
import { formatCurrency } from "@/lib/format";
import { convert } from "@/lib/money";
import { getReferenceRateAction, type ReferenceRate } from "@/server/actions/currency-analyzer";
import { positiveAmount } from "@/validations/money";

type Option = { value: string; label: string; decimals: number };
type Pair = { from: string; to: string; date: string };
type CalculatorProps = { currencies: Option[]; initial: Pair; initialRate: ReferenceRate | null; today: string; firstDay: string };

/** The amount stays in the browser: only the two currencies and the date are sent. */
export function Calculator({ currencies, initial, initialRate, today, firstDay }: CalculatorProps) {
  const [amount, setAmount] = useState("1");
  const [pair, setPair] = useState(initial);
  const [rate, setRate] = useState(initialRate);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const latest = useRef(0);

  async function change(next: Pair) {
    setPair(next);
    const request = ++latest.current;
    setPending(true);
    setError("");
    let found: ReferenceRate | null = null;
    let problem = "";
    try {
      const result = await getReferenceRateAction(next);
      if (result.ok) found = result.data;
      else problem = result.error;
    } catch {
      problem = "The rate could not be loaded. Check your connection and try again.";
    }
    // A slow answer to an earlier question must not replace a newer one.
    if (request !== latest.current) return;
    setRate(found);
    setError(problem);
    setPending(false);
  }

  const parsed = positiveAmount.safeParse(amount);
  const decimals = currencies.find(({ value }) => value === pair.to)?.decimals ?? 2;
  const result = parsed.success && rate && !pending ? convert(parsed.data, rate.rate, decimals) : null;

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_auto_1fr_1fr]">
        <TextField
          id="amount"
          label="Amount"
          inputMode="decimal"
          autoComplete="off"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          error={parsed.success ? undefined : parsed.error.issues[0]?.message}
        />
        <SelectField
          id="convert-from"
          label="From"
          options={currencies}
          value={pair.from}
          onChange={(event) => change({ ...pair, from: event.target.value })}
        />
        <Button
          type="button"
          variant="outline"
          className="max-sm:min-h-11 sm:order-last sm:w-fit xl:order-none xl:mt-5.5"
          onClick={() => change({ ...pair, from: pair.to, to: pair.from })}
        >
          <ArrowLeftRight /> Swap
        </Button>
        <SelectField
          id="convert-to"
          label="To"
          options={currencies}
          value={pair.to}
          onChange={(event) => change({ ...pair, to: event.target.value })}
        />
        <TextField
          id="convert-date"
          label="Date"
          type="date"
          min={firstDay}
          max={today}
          value={pair.date}
          onChange={(event) => change({ ...pair, date: event.target.value })}
        />
      </div>
      <div aria-live="polite" className="grid gap-1 rounded-lg bg-muted p-4">
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : pending ? (
          <p className="text-sm text-muted-foreground">Loading the rate…</p>
        ) : (
          <>
            <p className="font-mono text-xl font-semibold break-all tabular-nums md:text-2xl">
              {result ? formatCurrency(result, pair.to) : "–"}
            </p>
            {rate && (
              <p className="text-sm text-muted-foreground">
                1 {pair.from} = {displayRate(rate.rate)} {pair.to}
                {pair.from !== pair.to && `, rate of ${rate.dateText}`}
                {rate.earlier && ". There is no rate for the day you chose, so this is the last one before it."}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
