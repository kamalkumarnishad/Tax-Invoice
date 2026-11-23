import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ListSearchProps = { label: string; defaultValue: string; children?: React.ReactNode };

/** A plain GET form, so filters live in the address and work without JavaScript. */
export function ListSearch({ label, defaultValue, children }: ListSearchProps) {
  return (
    <form className="flex flex-wrap items-center gap-2" role="search">
      <Input
        name="q"
        type="search"
        key={defaultValue}
        defaultValue={defaultValue}
        aria-label={label}
        placeholder={label}
        maxLength={100}
        className="w-full sm:w-64"
      />
      {children}
      <Button type="submit" variant="outline">
        <Search /> Search
      </Button>
    </form>
  );
}
