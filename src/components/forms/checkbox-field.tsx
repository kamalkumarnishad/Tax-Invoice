import type { ComponentProps } from "react";

type CheckboxFieldProps = ComponentProps<"input"> & { id: string; label: string; hint?: string };

export function CheckboxField({ id, label, hint, ...props }: CheckboxFieldProps) {
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="mt-0.5 size-4 shrink-0 accent-primary"
        {...props}
      />
      <div className="grid gap-1">
        <label htmlFor={id} className="text-sm leading-tight font-medium">
          {label}
        </label>
        {hint && (
          <p id={`${id}-hint`} className="text-xs text-muted-foreground">
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}
