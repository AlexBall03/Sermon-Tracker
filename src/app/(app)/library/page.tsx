import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { getDb } from "@/db";
import { requireActiveUser } from "@/features/auth/access";
import { FilterChips } from "@/features/ideas/components/library/filter-chips";
import { IdeaResults } from "@/features/ideas/components/library/idea-results";
import { LibraryFilters } from "@/features/ideas/components/library/library-filters";
import { LibrarySearch } from "@/features/ideas/components/library/library-search";
import { LibraryProvider, LibraryResults } from "@/features/ideas/components/library/library-state";
import { LibraryToolbar } from "@/features/ideas/components/library/library-toolbar";
import { Pagination } from "@/features/ideas/components/library/pagination";
import { TagManager } from "@/features/ideas/components/library/tag-manager";
import { LibraryViewScript } from "@/features/ideas/components/library/view-switcher";
import { CaptureButton } from "@/features/ideas/components/quick-capture";
import { searchIdeas } from "@/features/ideas/ideas";
import {
  activeFilterCount,
  clearFilters,
  invertedRange,
  isFiltered,
  libraryHref,
  parseLibraryQuery,
  searchTerms,
  type LibrarySearchParams,
} from "@/features/ideas/library-query";
import { listTags } from "@/features/ideas/tags";

export const metadata: Metadata = { title: "Library" };

const emptyState = "mt-6 rounded-xl border border-dashed border-input px-6 py-12 sm:px-8";
const emptyHeading = "font-display text-2xl leading-snug font-medium";
const emptyCopy = "mt-3 max-w-md text-[0.9375rem] leading-relaxed text-muted-foreground";

/** "Showing 25–48 of 126 ideas", or simply how many there are when they fit on one page. */
function countLine(total: number, page: number, pageSize: number, filtered: boolean) {
  const noun = `${filtered ? "matching " : ""}${total === 1 ? "idea" : "ideas"}`;
  if (total <= pageSize) return `${total.toLocaleString("en")} ${noun}`;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  return `Showing ${first.toLocaleString("en")}–${last.toLocaleString("en")} of ${total.toLocaleString("en")} ${noun}`;
}

/**
 * The signed-in person's ideas, a page at a time. Rendered per request and
 * never cached. The search, filters, order, and page come from the URL
 * (features/ideas/library-query.ts) and the database does the work; the
 * controls here only change the address. Everything interactive sits inside
 * `LibraryProvider`; the results and the pager are rendered on the server.
 */
export default async function LibraryPage({
  searchParams,
}: {
  searchParams?: Promise<LibrarySearchParams>;
} = {}) {
  const user = await requireActiveUser();
  const query = parseLibraryQuery(await searchParams);
  const db = getDb();
  const [{ items, total, page, pageSize, totalPages }, tags] = await Promise.all([
    searchIdeas(db, user.id, query),
    listTags(db, user.id),
  ]);
  const filtered = isFiltered(query);
  const searching = searchTerms(query.q).length > 0;
  const filtering = activeFilterCount(query) > 0;
  const impossibleDates =
    invertedRange(query.createdFrom, query.createdThrough) ||
    invertedRange(query.updatedFrom, query.updatedThrough);

  const header = (
    <PageHeader
      title="Library"
      description="Every idea you have captured: sermons, points, and thoughts you have not sorted yet."
      action={<CaptureButton className="max-md:hidden" />}
    />
  );

  // Nothing captured at all: there is nothing to search or filter yet.
  if (total === 0 && !filtered) {
    return (
      <div className="container-page py-10 lg:py-12">
        {header}
        <section aria-labelledby="empty-heading" className={emptyState}>
          <h2 id="empty-heading" className={emptyHeading}>
            Nothing here yet
          </h2>
          <p className={emptyCopy}>
            Capture the first thought that is worth keeping. A line is enough, and you can decide
            later whether it is a sermon or a point.
          </p>
          <CaptureButton className="mt-6" />
        </section>
      </div>
    );
  }

  return (
    <div className="container-page py-10 lg:py-12">
      <LibraryViewScript />
      {header}

      <LibraryProvider query={query} tags={tags}>
        <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center">
          <LibrarySearch className="lg:flex-1" />
          <LibraryToolbar className="lg:flex-none" />
        </div>
        <LibraryFilters />
        <FilterChips />

        <LibraryResults>
          {total === 0 ? (
            <section aria-labelledby="empty-heading" className={emptyState}>
              <h2 id="empty-heading" className={emptyHeading}>
                {filtering ? "No ideas match these filters" : "No ideas match your search"}
              </h2>
              <p role="status" className={emptyCopy}>
                {impossibleDates
                  ? "A date range ends before it starts, so nothing can fall inside it."
                  : filtering && searching
                    ? `Nothing in your library fits “${query.q}” together with the filters you have chosen.`
                    : filtering
                      ? "Your library has ideas, but none fits every filter you have chosen."
                      : `Nothing in your library has “${query.q}” in its title, subject, or notes.`}
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                {filtering && (
                  <Link
                    href={libraryHref(clearFilters(query))}
                    className={buttonVariants({ variant: "outline" })}
                  >
                    Clear filters
                  </Link>
                )}
                {searching && (
                  <Link
                    href={libraryHref({ ...query, q: "", page: 1 })}
                    className={buttonVariants({ variant: "outline" })}
                  >
                    Clear search
                  </Link>
                )}
              </div>
            </section>
          ) : (
            <>
              <p role="status" className="mt-5 text-sm text-muted-foreground tabular-nums">
                {countLine(total, page, pageSize, filtered)}
              </p>
              <div className="mt-3">
                <IdeaResults ideas={items} label="Your ideas" query={{ ...query, page }} />
              </div>
              <Pagination query={query} page={page} totalPages={totalPages} />
            </>
          )}
        </LibraryResults>

        <TagManager />
      </LibraryProvider>
    </div>
  );
}
