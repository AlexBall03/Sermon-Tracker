import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { getDb } from "@/db";
import { requireActiveUser } from "@/features/auth/access";
import { LibrarySections } from "@/features/ideas/components/library/library-sections";
import { Pagination } from "@/features/ideas/components/library/pagination";
import { CaptureButton } from "@/features/ideas/components/quick-capture";
import { searchTerms } from "@/features/ideas/library-query";
import { getBook } from "@/features/scripture/books";
import { SavedSearch, SavedToolbar } from "@/features/scripture/components/saved/saved-controls";
import { SavedResults } from "@/features/scripture/components/saved/saved-results";
import {
  SavedResultsRegion,
  SavedScriptureProvider,
} from "@/features/scripture/components/saved/saved-state";
import { countFavorites, searchFavorites } from "@/features/scripture/saved/favorites";
import {
  clearSavedFilters,
  isSavedFiltered,
  parseSavedQuery,
  savedFilterCount,
  savedHref,
  type SavedSearchParams,
} from "@/features/scripture/saved/saved-query";
import { routes } from "@/lib/site";

export const metadata: Metadata = { title: "Saved Scripture" };

const emptyState = "mt-6 rounded-xl border border-dashed border-input px-6 py-12 sm:px-8";
const emptyHeading = "font-display text-2xl leading-snug font-medium";
const emptyCopy = "mt-3 max-w-md text-[0.9375rem] leading-relaxed text-muted-foreground";

/** "Showing 25–48 of 126 passages", or simply how many there are when they fit on one page. */
function countLine(total: number, page: number, pageSize: number, filtered: boolean) {
  const noun = `${filtered ? "matching " : "saved "}${total === 1 ? "passage" : "passages"}`;
  if (total <= pageSize) return `${total.toLocaleString("en")} ${noun}`;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  return `Showing ${first.toLocaleString("en")}–${last.toLocaleString("en")} of ${total.toLocaleString("en")} ${noun}`;
}

/**
 * The Scripture the signed-in person has saved, a page at a time: a section
 * of the library, beside the ideas, and reached from there. Rendered per
 * request and never cached. The search, filters, order, and page come from
 * the URL (features/scripture/saved/saved-query.ts) and the database does the
 * work; the controls only change the address.
 */
export default async function SavedScripturePage({
  searchParams,
}: {
  searchParams?: Promise<SavedSearchParams>;
} = {}) {
  const user = await requireActiveUser();
  const query = parseSavedQuery(await searchParams);
  const db = getDb();
  const { items, total, page, pageSize, totalPages } = await searchFavorites(db, user.id, query);
  const filtered = isSavedFiltered(query);
  const searching = searchTerms(query.q).length > 0;
  const filtering = savedFilterCount(query) > 0;
  // Whether there is anything to search at all is asked only when the search found nothing.
  const nothingSaved = total === 0 && (!filtered || (await countFavorites(db, user.id)) === 0);

  const header = (
    <>
      <PageHeader
        title="Library"
        description="Every idea you have captured, and the Scripture you have saved."
        action={<CaptureButton className="max-md:hidden" />}
      />
      <LibrarySections current="scripture" />
      <h2 className="sr-only">Saved Scripture</h2>
    </>
  );

  // Nothing saved at all: there is nothing to search or filter yet.
  if (nothingSaved) {
    return (
      <div className="container-page py-10 lg:py-12">
        {header}
        <section aria-labelledby="empty-heading" className={emptyState}>
          <h3 id="empty-heading" className={emptyHeading}>
            No Scripture saved yet
          </h3>
          <p className={emptyCopy}>
            While you read, select a verse or a passage and choose Favorite. It is kept here, with
            room for a label and your notes.
          </p>
          <Link href={routes.bible} className={buttonVariants({ className: "mt-6" })}>
            <BookOpen aria-hidden />
            Open the Bible
          </Link>
        </section>
      </div>
    );
  }

  const bookName = query.book === null ? "" : (getBook(query.book)?.name ?? "");

  return (
    <div className="container-page py-10 lg:py-12">
      {header}

      <SavedScriptureProvider query={query}>
        <div className="mt-5 flex flex-col gap-3 xl:flex-row xl:items-center">
          <SavedSearch className="xl:flex-1" />
          <SavedToolbar className="xl:flex-none" />
        </div>

        <SavedResultsRegion>
          {total === 0 ? (
            <section aria-labelledby="empty-heading" className={emptyState}>
              <h3 id="empty-heading" className={emptyHeading}>
                {filtering ? "No passages match these filters" : "No passages match your search"}
              </h3>
              <p role="status" className={emptyCopy}>
                {filtering && searching
                  ? `Nothing you have saved fits “${query.q}” together with the filters you have chosen.`
                  : filtering
                    ? query.colors.length === 0
                      ? `You have saved Scripture, but nothing from ${bookName}.`
                      : "You have saved Scripture, but none of it fits every filter you have chosen."
                    : `Nothing you have saved has “${query.q}” in its reference, label, or notes.`}
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                {filtering && (
                  <Link
                    href={savedHref(clearSavedFilters(query))}
                    className={buttonVariants({ variant: "outline" })}
                  >
                    Clear filters
                  </Link>
                )}
                {searching && (
                  <Link
                    href={savedHref({ ...query, q: "", page: 1 })}
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
                <SavedResults favorites={items} label="Your saved Scripture" />
              </div>
              <Pagination
                label="Saved Scripture pages"
                hrefAt={(target) => savedHref({ ...query, page: target })}
                page={page}
                totalPages={totalPages}
              />
            </>
          )}
        </SavedResultsRegion>
      </SavedScriptureProvider>
    </div>
  );
}
