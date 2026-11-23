type FilterSelectProps = {
  name: string;
  label: string;
  value: string;
  all: string;
  options: readonly { value: string; label: string }[];
};

/** A select for the list filter form. "" means no filter. */
export function FilterSelect({ name, label, value, all, options }: FilterSelectProps) {
  return (
    <select
      key={value}
      name={name}
      aria-label={label}
      defaultValue={value}
      className="h-9 max-w-48 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <option value="">{all}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
