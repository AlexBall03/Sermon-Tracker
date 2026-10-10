import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { libraryHref, type LibraryQuery } from "../../library-query";

/**
 * The page numbers to offer: the first, the last, the current one and its
 * neighbours, with "gap" where pages are left out. A gap never stands for a
 * single page; that page is shown instead.
 */
export function pageWindow(page: number, totalPages: number): (number | "gap")[] {
  const wanted = new Set([1, totalPages, page - 1, page, page + 1]);
  const pages = [...wanted].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  for (const [index, n] of pages.entries()) {
    const before = pages[index - 1];
    if (before !== undefined && n - before === 2) out.push(n - 1);
    else if (before !== undefined && n - before > 2) out.push("gap");
    out.push(n);
  }
  return out;
}

const step = buttonVariants({ variant: "outline", size: "sm", className: "px-3" });
const number =
  "grid h-9 min-w-9 place-items-center rounded-lg px-2 text-sm font-medium tabular-nums transition-colors duration-150";

/**
 * The library's pages: Previous, Next, and numbered pages between them. Every
 * link is the current query with only the page changed, so the search,
 * filters, and order carry across. A narrow screen has no room for a row of
 * numbers and shows "Page 3 of 12" between the two steps instead.
 */
export function Pagination({
  query,
  page,
  totalPages,
}: {
  query: LibraryQuery;
  /** The page shown, which the query may have clamped. */
  page: number;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;
  const at = (target: number) => libraryHref({ ...query, page: target });

  return (
    <nav
      aria-label="Library pages"
      className="mt-8 flex items-center justify-between gap-2 sm:justify-center"
    >
      {page > 1 ? (
        <Link href={at(page - 1)} rel="prev" className={step}>
          <ChevronLeft aria-hidden />
          Previous
        </Link>
      ) : (
        <span aria-disabled="true" className={cn(step, "pointer-events-none opacity-50")}>
          <ChevronLeft aria-hidden />
          Previous
        </span>
      )}

      <p className="text-sm text-muted-foreground tabular-nums sm:hidden">
        Page {page} of {totalPages}
      </p>
      <ol className="flex items-center gap-1 max-sm:hidden">
        {pageWindow(page, totalPages).map((item, index) =>
          item === "gap" ? (
            <li key={`gap-${index}`} aria-hidden className={cn(number, "text-muted-foreground")}>
              …
            </li>
          ) : (
            <li key={item}>
              {item === page ? (
                <span
                  aria-current="page"
                  className={cn(number, "bg-primary-soft font-semibold text-primary")}
                >
                  <span className="sr-only">Page&nbsp;</span>
                  {item}
                </span>
              ) : (
                <Link
                  href={at(item)}
                  aria-label={`Page ${item}`}
                  className={cn(
                    number,
                    "text-muted-foreground hover:bg-accent hover:text-foreground active:bg-foreground/10",
                  )}
                >
                  {item}
                </Link>
              )}
            </li>
          ),
        )}
      </ol>

      {page < totalPages ? (
        <Link href={at(page + 1)} rel="next" className={step}>
          Next
          <ChevronRight aria-hidden />
        </Link>
      ) : (
        <span aria-disabled="true" className={cn(step, "pointer-events-none opacity-50")}>
          Next
          <ChevronRight aria-hidden />
        </span>
      )}
    </nav>
  );
}
