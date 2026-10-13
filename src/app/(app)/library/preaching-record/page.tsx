import type { Metadata } from "next";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { getDb } from "@/db";
import { requireActiveUser } from "@/features/auth/access";
import { LibrarySectionHeader } from "@/features/ideas/components/library/library-sections";
import { Pagination } from "@/features/ideas/components/library/pagination";
import { getIdea } from "@/features/ideas/ideas";
import { searchTerms } from "@/features/ideas/library-query";
import {
  HistoryChips,
  HistoryFilters,
  HistorySearch,
  HistoryToolbar,
} from "@/features/preaching/components/history-controls";
import { HistoryResults } from "@/features/preaching/components/history-results";
import {
  HistoryProvider,
  HistoryResultsRegion,
  RecordButton,
} from "@/features/preaching/components/history-state";
import { listContexts } from "@/features/preaching/contexts";
import {
  clearHistoryFilters,
  historyFilterCount,
  historyHref,
  isHistoryFiltered,
  parseHistoryQuery,
  type HistorySearchParams,
} from "@/features/preaching/history-query";
import { searchHistory } from "@/features/preaching/occurrences";
import { defaultHistoryQuery } from "@/features/preaching/schemas";
import { listVenues } from "@/features/preaching/venues";
import { getPreferences } from "@/features/preferences/current";
import { dictionary, formatNumber, type Dictionaries } from "@/i18n";
import type { Locale } from "@/i18n/locales";
import { getLocale } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: dictionary(await getLocale(), "preaching").history.metaTitle };
}

const emptyState = "mt-6 rounded-xl border border-dashed border-input px-6 py-12 sm:px-8";
const emptyHeading = "font-display text-2xl leading-snug font-medium";
const emptyCopy = "mt-3 max-w-md text-[0.9375rem] leading-relaxed text-muted-foreground";

/** "Showing 25–48 of 126 records", or simply how many there are when they fit on one page. */
function countLine(
  t: Dictionaries["preaching"]["history"],
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
 * What the signed-in person has preached, a page at a time: a section of the
 * library, beside the ideas and the saved Scripture, and reached from there.
 * Rendered per request and never cached. The search, filters, order, and page
 * come from the URL (features/preaching/history-query.ts) and the database
 * does the work; the controls only change the address.
 *
 * Every query here takes the owner from the session. A sermon, venue, or
 * context named in the address that is not this account's finds nothing and
 * names nothing.
 *
 * History is shown whatever became of its sermon: one since archived, or
 * filed as a point, is still listed, and says so.
 */
export default async function PreachingRecordPage({
  searchParams,
}: {
  searchParams?: Promise<HistorySearchParams>;
} = {}) {
  const user = await requireActiveUser();
  const { locale } = await getPreferences();
  const t = dictionary(locale, "preaching").history;
  const named = parseHistoryQuery(await searchParams);
  const db = getDb();

  const [idea, venues, contexts] = await Promise.all([
    // Looked up among this account's own ideas only, so the filter can be named.
    named.sermonId ? getIdea(db, user.id, named.sermonId) : null,
    listVenues(db, user.id),
    listContexts(db, user.id),
  ]);
  // A sermon that is not this account's asks for nothing in particular.
  const query = named.sermonId && !idea ? { ...named, sermonId: null } : named;
  const { items, total, page, pageSize, totalPages } = await searchHistory(db, user.id, query);

  const filtered = isHistoryFiltered(query);
  const searching = searchTerms(query.q).length > 0;
  const filtering = historyFilterCount(query) > 0;
  // Whether there is any history at all is asked only when the search found nothing.
  const nothingRecorded =
    total === 0 &&
    (!filtered || (await searchHistory(db, user.id, defaultHistoryQuery, 1)).total === 0);

  return (
    <div className="container-page py-10 lg:py-12">
      <HistoryProvider
        query={query}
        venues={venues.map(({ id, name, locality, occurrenceCount }) => ({
          id,
          name,
          locality,
          occurrenceCount,
        }))}
        contexts={contexts.map(({ id, name, occurrenceCount }) => ({ id, name, occurrenceCount }))}
        sermon={
          idea && query.sermonId
            ? { id: idea.id, title: idea.title, recordable: idea.kind === "sermon" }
            : null
        }
      >
        <LibrarySectionHeader section="history" locale={locale} action={<RecordButton />} />

        {nothingRecorded ? (
          // Nothing recorded at all: there is nothing to search or filter yet.
          <section aria-labelledby="empty-heading" className={emptyState}>
            <h2 id="empty-heading" className={emptyHeading}>
              {t.empty.nothing}
            </h2>
            <p className={emptyCopy}>{t.empty.nothingBody}</p>
            <RecordButton className="mt-6" />
          </section>
        ) : (
          <>
            <div className="mt-5 flex flex-col gap-3 xl:flex-row xl:items-center">
              <HistorySearch className="xl:flex-1" />
              <HistoryToolbar className="xl:flex-none" />
            </div>
            <HistoryFilters />
            <HistoryChips />

            <HistoryResultsRegion>
              {total === 0 ? (
                <section aria-labelledby="empty-heading" className={emptyState}>
                  <h2 id="empty-heading" className={emptyHeading}>
                    {filtering ? t.empty.noFilterMatch : t.empty.noSearchMatch}
                  </h2>
                  <p role="status" className={emptyCopy}>
                    {filtering && searching
                      ? t.empty.both(query.q)
                      : filtering
                        ? t.empty.filtersOnly
                        : t.empty.searchOnly(query.q)}
                  </p>
                  <div className="mt-6 flex flex-wrap gap-3">
                    {filtering && (
                      <Link
                        href={historyHref(clearHistoryFilters(query))}
                        className={buttonVariants({ variant: "outline" })}
                      >
                        {t.empty.clearFilters}
                      </Link>
                    )}
                    {searching && (
                      <Link
                        href={historyHref({ ...query, q: "", page: 1 })}
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
                    <HistoryResults items={items} label={t.label} />
                  </div>
                  <Pagination
                    label={t.pages}
                    locale={locale}
                    hrefAt={(target) => historyHref({ ...query, page: target })}
                    page={page}
                    totalPages={totalPages}
                  />
                </>
              )}
            </HistoryResultsRegion>
          </>
        )}
      </HistoryProvider>
    </div>
  );
}
