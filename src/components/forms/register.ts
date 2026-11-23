import type { FieldValues, Path, UseFormReturn } from "react-hook-form";

/**
 * `form.register` sets saved values only once JavaScript runs, so until then the
 * server-rendered form shows blanks. These also put the value in the HTML.
 */
export function registerWithValues<T extends FieldValues, Context, Output extends FieldValues>(
  form: UseFormReturn<T, Context, Output>,
  values: T,
) {
  return {
    text: (name: Path<T>) => ({ ...form.register(name), defaultValue: values[name] as string }),
    check: (name: Path<T>) => ({ ...form.register(name), defaultChecked: values[name] as boolean }),
  };
}
