import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

type CurrencyDisplayProps = {
  amount: string;
  currency: string;
  tone?: "neutral" | "positive" | "negative";
  className?: string;
};

const tones = {
  neutral: "",
  positive: "text-success-strong",
  negative: "text-destructive",
} as const;

export function CurrencyDisplay({ amount, currency, tone = "neutral", className }: CurrencyDisplayProps) {
  return (
    <span className={cn("font-mono font-medium tabular-nums", tones[tone], className)}>
      {formatCurrency(amount, currency)}
    </span>
  );
}
