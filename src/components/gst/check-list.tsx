import { CircleAlert, Info } from "lucide-react";
import Link from "next/link";
import type { Check } from "@/server/services/gst/checks";

export function CheckList({ checks }: { checks: Check[] }) {
  if (checks.length === 0) return <p className="text-sm text-muted-foreground">Nothing found.</p>;
  return (
    <ul className="divide-y rounded-lg border">
      {checks.map((check) => {
        const Icon = check.level === "warning" ? CircleAlert : Info;
        return (
          <li key={check.key} className="flex items-start gap-3 p-4 text-sm">
            <Icon
              aria-hidden
              className={`mt-0.5 size-4 shrink-0 ${check.level === "warning" ? "text-destructive" : "text-muted-foreground"}`}
            />
            <p className="min-w-0 break-words">
              <span className="sr-only">{check.level === "warning" ? "Warning: " : "Note: "}</span>
              {check.text}{" "}
              {check.href && (
                <Link href={check.href} className="whitespace-nowrap underline underline-offset-4">
                  {check.href.startsWith("/app/settings") ? "Open settings" : "Open invoice"}
                </Link>
              )}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
