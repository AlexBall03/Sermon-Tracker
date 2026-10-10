import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { getDb } from "@/db";
import { requireActiveUser } from "@/features/auth/access";
import { IdeaList } from "@/features/ideas/components/idea-list";
import { CaptureButton } from "@/features/ideas/components/quick-capture";
import { searchIdeas } from "@/features/ideas/ideas";
import {
  defaultLibraryQuery,
  isFiltered,
  libraryHref,
  parseLibraryQuery,
  type LibrarySearchParams,
} from "@/features/ideas/library-query";
import { librarySortLabels } from "@/features/ideas/model";
import { routes } from "@/lib/site";

export const metadata: Metadata = { title: "Library" };

/**
 * The signed-in person's ideas, a page at a time. Rendered per request and
 * never cached. The search, filters, order, and page come from the URL (see
 * features/ideas/library-query.ts); the controls that set them belong to
 * Phase 2B.2, as does numbered paging in place of Previous and Next.
 */
export default async function LibraryPage({
  searchParams,
}: {
  searchParams?: Promise<LibrarySearchParams>;
} = {}) {
  const user = await requireActiveUser();
  const query = parseLibraryQuery(await searchParams);
  const { items, total, page, totalPages } = await searchIdeas(getDb(), user.id, query);
  const filtered = isFiltered(query);
  const at = (target: number) => libraryHref({ ...query, page: target });

  return (
    <div className="container-page py-10 lg:py-12">
      <PageHeader
        title="Library"
        description="Every idea you have captured: sermons, points, and thoughts you have not sorted yet."
      />

      {total === 0 && !filtered ? (
        <section
          aria-labelledby="empty-heading"
          className="mt-8 rounded-xl border border-dashed border-input px-6 py-12 sm:px-8"
        >
          <h2 id="empty-heading" className="font-display text-2xl leading-snug font-medium">
            Nothing here yet
          </h2>
          <p className="mt-3 max-w-md text-[0.9375rem] leading-relaxed text-muted-foreground">
            Capture the first thought that is worth keeping. A line is enough, and you can decide
            later whether it is a sermon or a point.
          </p>
          <CaptureButton className="mt-6" />
        </section>
      ) : total === 0 ? (
        <section
          aria-labelledby="empty-heading"
          className="mt-8 rounded-xl border border-dashed border-input px-6 py-12 sm:px-8"
        >
          <h2 id="empty-heading" className="font-display text-2xl leading-snug font-medium">
            No ideas match
          </h2>
          <p className="mt-3 max-w-md text-[0.9375rem] leading-relaxed text-muted-foreground">
            Nothing in your library fits this search and these filters.
          </p>
          <Link
            href={libraryHref(defaultLibraryQuery)}
            className={buttonVariants({ variant: "outline", className: "mt-6" })}
          >
            Show all ideas
          </Link>
        </section>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {total} {total === 1 ? "idea" : "ideas"}
              {filtered ? " found" : ""}
              {query.sort === defaultLibraryQuery.sort
                ? ", most recently changed first"
                : `, ordered by: ${librarySortLabels[query.sort]}`}
              {filtered && (
                <>
                  <span aria-hidden> · </span>
                  <Link href={routes.library} className="font-medium text-primary link-underline">
                    Show all ideas
                  </Link>
                </>
              )}
            </p>
            <CaptureButton size="sm" className="max-md:hidden" />
          </div>
          <div className="mt-4">
            <IdeaList ideas={items} label="Your ideas" />
          </div>
          {totalPages > 1 && (
            <nav
              aria-label="Library pages"
              className="mt-6 flex items-center justify-between gap-3 text-sm"
            >
              {page > 1 ? (
                <Link
                  href={at(page - 1)}
                  rel="prev"
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Previous
                </Link>
              ) : (
                <span />
              )}
              <p className="text-muted-foreground tabular-nums">
                Page {page} of {totalPages}
              </p>
              {page < totalPages ? (
                <Link
                  href={at(page + 1)}
                  rel="next"
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Next
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
