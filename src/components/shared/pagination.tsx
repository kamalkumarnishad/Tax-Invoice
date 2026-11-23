import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PAGE_SIZE } from "@/validations/common";

type PaginationProps = { path: string; params: Record<string, string>; page: number; total: number };

export function Pagination({ path, params, page, total }: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (pages === 1 && page === 1) return null;

  const href = (target: number) => {
    const entries = Object.entries({ ...params, page: String(target) }).filter(([, value]) => value !== "");
    return `${path}?${new URLSearchParams(entries)}`;
  };

  return (
    <nav aria-label="Pages" className="flex items-center justify-between gap-4 text-sm">
      <p className="text-muted-foreground">
        Page {page} of {pages}
      </p>
      <div className="flex gap-2">
        {page > 1 && (
          <Button asChild variant="outline" size="sm">
            <Link href={href(Math.min(page - 1, pages))}>Previous</Link>
          </Button>
        )}
        {page < pages && (
          <Button asChild variant="outline" size="sm">
            <Link href={href(page + 1)}>Next</Link>
          </Button>
        )}
      </div>
    </nav>
  );
}
