import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PaginationProps {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
  className?: string;
}

/** Compact page list: always first/last, a window around the current page. */
function pageWindow(page: number, pageCount: number): (number | "…")[] {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, i) => i + 1);
  }
  const pages = new Set<number>([1, 2, page - 1, page, page + 1, pageCount - 1, pageCount]);
  const sorted = [...pages]
    .filter((p) => p >= 1 && p <= pageCount)
    .sort((a, b) => a - b);

  const result: (number | "…")[] = [];
  let previous = 0;
  for (const p of sorted) {
    if (previous && p - previous > 1) result.push("…");
    result.push(p);
    previous = p;
  }
  return result;
}

export function Pagination({ page, pageCount, onChange, className }: PaginationProps) {
  if (pageCount <= 1) return null;

  return (
    <nav
      aria-label="Pagination"
      className={cn("flex items-center justify-center gap-1", className)}
    >
      <Button
        variant="outline"
        size="icon-sm"
        aria-label="Previous page"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        <ChevronLeft />
      </Button>

      {pageWindow(page, pageCount).map((entry, index) =>
        entry === "…" ? (
          <span
            key={`gap-${index}`}
            className="px-1.5 text-sm text-muted-foreground"
          >
            …
          </span>
        ) : (
          <Button
            key={entry}
            variant={entry === page ? "default" : "ghost"}
            size="icon-sm"
            aria-current={entry === page ? "page" : undefined}
            onClick={() => onChange(entry)}
          >
            {entry}
          </Button>
        ),
      )}

      <Button
        variant="outline"
        size="icon-sm"
        aria-label="Next page"
        disabled={page >= pageCount}
        onClick={() => onChange(page + 1)}
      >
        <ChevronRight />
      </Button>
    </nav>
  );
}
