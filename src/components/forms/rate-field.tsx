"use client";

import { useState } from "react";
import { toast } from "sonner";
import { TextField } from "@/components/forms/text-field";
import { Button } from "@/components/ui/button";
import { getRateAction } from "@/server/actions/currency";

type RateFieldProps = {
  from: string;
  to: string;
  date: string;
  error?: string;
  onRate: (rate: string) => void;
  inputProps: React.ComponentProps<"input">;
};

export function RateField({ from, to, date, error, onRate, inputProps }: RateFieldProps) {
  const [pending, setPending] = useState(false);

  async function lookUp() {
    setPending(true);
    const result = await getRateAction({ from, to, date });
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    onRate(result.data.rate);
    toast.success(`Rate from: ${result.data.source}`);
  }

  return (
    <div className="grid content-start gap-2">
      <TextField
        id="exchangeRate"
        label={`Exchange rate (${to} for 1 ${from})`}
        inputMode="decimal"
        hint="Use the rate your bank gave you when you know it."
        error={error}
        {...inputProps}
      />
      <Button type="button" variant="outline" size="sm" className="w-fit" disabled={pending || !date} onClick={lookUp}>
        {pending ? "Looking up…" : "Look up rate"}
      </Button>
    </div>
  );
}
