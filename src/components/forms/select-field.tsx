import type { ComponentProps } from "react";
import { Label } from "@/components/ui/label";

type SelectFieldProps = ComponentProps<"select"> & {
  id: string;
  label: string;
  options: readonly { value: string; label: string }[];
  error?: string;
};

export function SelectField({ id, label, options, error, ...props }: SelectFieldProps) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive"
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function toOptions(labels: Record<string, string>) {
  return Object.entries(labels).map(([value, label]) => ({ value, label }));
}
