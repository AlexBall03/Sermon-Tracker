import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { getDb } from "@/db";
import { requireActiveUser } from "@/features/auth/access";
import { FilterChips } from "@/features/ideas/components/library/filter-chips";
import { IdeaResults } from "@/features/ideas/components/library/idea-results";
import { LibraryFilters } from "@/features/ideas/components/library/library-filters";
import { LibrarySections } from "@/features/ideas/components/library/library-sections";
import { LibrarySearch } from "@/features/ideas/components/library/library-search";
import { LibraryProvider, LibraryResults } from "@/features/ideas/components/library/library-state";
import { LibraryToolbar } from "@/features/ideas/components/library/library-toolbar";
import { Pagination } from "@/features/ideas/components/library/pagination";
import { TagManager } from "@/features/ideas/components/library/tag-manager";
import { LibraryViewScript } from "@/features/ideas/components/library/view-switcher";
import { CaptureButton } from "@/features/ideas/components/quick-capture";
import { archivedCount, searchIdeas } from "@/features/ideas/ideas";
import {
  activeFilterCount,
  clearFilters,
  defaultLibraryQuery,
  invertedRange,
  isFiltered,
  libraryHref,
  parseLibraryQuery,
  searchTerms,
  type LibrarySearchParams,
} from "@/features/ideas/library-query";
import { listTags } from "@/features/ideas/tags";
import { dictionary, formatNumber, type Dictionaries } from "@/i18n";
import type { Locale } from "@/i18n/locales";
import { getLocale } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: dictionary(await getLocale(), "library").title };
}

const emptyState = "mt-6 rounded-xl border border-dashed border-input px-6 py-12 sm:px-8";
const emptyHeading = "font-display text-2xl leading-snug font-medium";
const emptyCopy = "mt-3 max-w-md text-[0.9375rem] leading-relaxed text-muted-foreground";

/** "Showing 25–48 of 126 ideas", or simply how many there are when they fit on one page. */
function countLine(
  t: Dictionaries["library"],
  locale: Locale,
  total: number,
  page: number,
  pageSize: number,
  filtered: boolean,
) {
  const written = (value: number) => formatNumber(locale, value);
  if (total <= pageSize) return t.count(total, written(total), filtered);
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  return t.showing(written(first), written(last), total, written(total), filtered);
}

/**
 * The signed-in person's ideas, a page at a time. Rendered per request and
 * never cached. The search, filters, order, and page come from the URL
 * (features/ideas/library-query.ts) and the database does the work; the
 * controls here only change the address. Everything interactive sits inside
 * `LibraryProvider`; the results and the pager are rendered on the server.
 *
 * Archived ideas are left out by the query unless the address asks for them.
 * A library whose every idea is archived is not an empty one: it says so and
 * leads to them, and does not invite the same thought to be captured twice.
 */
export default async function LibraryPage({
  searchParams,
}: {
  searchParams?: Promise<LibrarySearchParams>;
} = {}) {
  const user = await requireActiveUser();
  const query = parseLibraryQuery(await searchParams);
  const locale = await getLocale();
  const t = dictionary(locale, "library");
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
      title={t.title}
      description={t.description}
      action={<CaptureButton className="max-md:hidden" />}
    />
  );

  // Only looked for when nothing active was found and nothing narrowed the search.
  const archived = total === 0 && !filtered ? await archivedCount(db, user.id) : 0;
  // The archive was asked for by itself, and holds nothing.
  const emptyArchive =
    total === 0 && !searching && query.archive === "archived" && activeFilterCount(query) === 1;

  // Nothing captured at all: there is nothing to search or filter yet.
  if (total === 0 && !filtered && archived === 0) {
    return (
      <div className="container-page py-10 lg:py-12">
        {header}
        <LibrarySections current="ideas" locale={locale} />
        <section aria-labelledby="empty-heading" className={emptyState}>
          <h2 id="empty-heading" className={emptyHeading}>
            {t.empty.nothing}
          </h2>
          <p className={emptyCopy}>{t.empty.nothingBody}</p>
          <CaptureButton className="mt-6" />
        </section>
      </div>
    );
  }

  return (
    <div className="container-page py-10 lg:py-12">
      <LibraryViewScript />
      {header}
      <LibrarySections current="ideas" locale={locale} />

      <LibraryProvider query={query} tags={tags}>
        <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center">
          <LibrarySearch className="lg:flex-1" />
          <LibraryToolbar className="lg:flex-none" />
        </div>
        <LibraryFilters />
        <FilterChips />

        <LibraryResults>
          {archived > 0 || emptyArchive ? (
            <section aria-labelledby="empty-heading" className={emptyState}>
              <h2 id="empty-heading" className={emptyHeading}>
                {emptyArchive ? t.empty.noArchived : t.empty.allArchived}
              </h2>
              <p role="status" className={emptyCopy}>
                {emptyArchive ? t.empty.noArchivedBody : t.empty.allArchivedBody(archived)}
              </p>
              <Link
                href={libraryHref({
                  ...defaultLibraryQuery,
                  sort: query.sort,
                  archive: emptyArchive ? "active" : "archived",
                })}
                className={buttonVariants({ variant: "outline", className: "mt-6" })}
              >
                {emptyArchive ? t.empty.showActive : t.empty.showArchived}
              </Link>
            </section>
          ) : total === 0 ? (
            <section aria-labelledby="empty-heading" className={emptyState}>
              <h2 id="empty-heading" className={emptyHeading}>
                {filtering ? t.empty.noFilterMatch : t.empty.noSearchMatch}
              </h2>
              <p role="status" className={emptyCopy}>
                {impossibleDates
                  ? t.empty.impossibleDates
                  : filtering && searching
                    ? t.empty.both(query.q)
                    : filtering
                      ? t.empty.filtersOnly
                      : t.empty.searchOnly(query.q)}
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                {filtering && (
                  <Link
                    href={libraryHref(clearFilters(query))}
                    className={buttonVariants({ variant: "outline" })}
                  >
                    {t.empty.clearFilters}
                  </Link>
                )}
                {searching && (
                  <Link
                    href={libraryHref({ ...query, q: "", page: 1 })}
                    className={buttonVariants({ variant: "outline" })}
                  >
                    {t.empty.clearSearch}
                  </Link>
                )}
              </div>
            </section>
          ) : (
            <>
              <p role="status" className="mt-5 text-sm text-muted-foreground tabular-nums">
                {countLine(t, locale, total, page, pageSize, filtered)}
              </p>
              <div className="mt-3">
                <IdeaResults
                  ideas={items}
                  label={t.results.label}
                  query={{ ...query, page }}
                  locale={locale}
                />
              </div>
              <Pagination query={query} page={page} totalPages={totalPages} locale={locale} />
            </>
          )}
        </LibraryResults>

        <TagManager />
      </LibraryProvider>
    </div>
  );
}
