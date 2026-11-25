import Link from "next/link";
import { Button } from "@/components/ui/button";

const pages = [
  { href: "/app/currency-analyzer", label: "Rates" },
  { href: "/app/currency-analyzer/my-income", label: "My income" },
];

export function AnalyzerNav({ current }: { current: "Rates" | "My income" }) {
  return (
    <nav aria-label="Currency analyzer" className="flex gap-2">
      {pages.map(({ href, label }) => (
        <Button
          key={href}
          asChild
          size="sm"
          variant={label === current ? "secondary" : "outline"}
          className="max-sm:min-h-11"
        >
          <Link href={href} aria-current={label === current ? "page" : undefined}>
            {label}
          </Link>
        </Button>
      ))}
    </nav>
  );
}
