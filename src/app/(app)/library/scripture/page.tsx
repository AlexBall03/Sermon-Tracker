import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { getDb } from "@/db";
import { requireActiveUser } from "@/features/auth/access";
import { getPreferences } from "@/features/preferences/current";
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
import { dictionary, formatNumber, type Dictionaries } from "@/i18n";
import type { Locale } from "@/i18n/locales";
import { getLocale } from "@/i18n/server";
import { routes } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  return { title: dictionary(await getLocale(), "library").saved.metaTitle };
}

const emptyState = "mt-6 rounded-xl border border-dashed border-input px-6 py-12 sm:px-8";
const emptyHeading = "font-display text-2xl leading-snug font-medium";
const emptyCopy = "mt-3 max-w-md text-[0.9375rem] leading-relaxed text-muted-foreground";

/** "Showing 25–48 of 126 passages", or simply how many there are when they fit on one page. */
function countLine(
  t: Dictionaries["library"]["saved"],
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
 * The Scripture the signed-in person has saved, a page at a time: a section
 * of the library, beside the ideas, and reached from there. Rendered per
 * request and never cached. The search, filters, order, and page come from
 * the URL (features/scripture/saved/saved-query.ts) and the database does the
 * work; the controls only change the address.
 *
 * Only passages from the translations on offer are listed. With Spanish
 * switched off, those saved from the Spanish text are not shown and are not
 * counted; they are untouched, and are here again when it is switched back on.
 */
export default async function SavedScripturePage({
  searchParams,
}: {
  searchParams?: Promise<SavedSearchParams>;
} = {}) {
  const user = await requireActiveUser();
  const preferences = await getPreferences();
  const locale = preferences.locale;
  const t = dictionary(locale, "library");
  const named = parseSavedQuery(await searchParams);
  // A filter by a translation that is not on offer asks for nothing in particular.
  const query =
    named.translation && !preferences.translations.includes(named.translation)
      ? { ...named, translation: null }
      : named;
  const db = getDb();
  const { items, total, page, pageSize, totalPages } = await searchFavorites(
    db,
    user.id,
    query,
    undefined,
    preferences.translations,
  );
  const filtered = isSavedFiltered(query);
  const searching = searchTerms(query.q).length > 0;
  const filtering = savedFilterCount(query) > 0;
  // Whether there is anything to search at all is asked only when the search found nothing.
  const nothingSaved =
    total === 0 &&
    (!filtered || (await countFavorites(db, user.id, preferences.translations)) === 0);

  const header = (
    <>
      <PageHeader
        title={t.title}
        description={t.description}
        action={<CaptureButton className="max-md:hidden" />}
      />
      <LibrarySections current="scripture" locale={locale} />
      <h2 className="sr-only">{t.saved.heading}</h2>
    </>
  );

  // Nothing saved at all: there is nothing to search or filter yet.
  if (nothingSaved) {
    return (
      <div className="container-page py-10 lg:py-12">
        {header}
        <section aria-labelledby="empty-heading" className={emptyState}>
          <h3 id="empty-heading" className={emptyHeading}>
            {t.saved.empty.nothing}
          </h3>
          <p className={emptyCopy}>{t.saved.empty.nothingBody}</p>
          <Link href={routes.bible} className={buttonVariants({ className: "mt-6" })}>
            <BookOpen aria-hidden />
            {t.saved.empty.openBible}
          </Link>
        </section>
      </div>
    );
  }

  const bookName = query.book === null ? "" : (getBook(query.book, locale)?.name ?? "");

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
                {filtering ? t.saved.empty.noFilterMatch : t.saved.empty.noSearchMatch}
              </h3>
              <p role="status" className={emptyCopy}>
                {filtering && searching
                  ? t.saved.empty.both(query.q)
                  : filtering
                    ? query.colors.length === 0 && query.translation === null
                      ? t.saved.empty.fromBook(bookName)
                      : t.saved.empty.filtersOnly
                    : t.saved.empty.searchOnly(query.q)}
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                {filtering && (
                  <Link
                    href={savedHref(clearSavedFilters(query))}
                    className={buttonVariants({ variant: "outline" })}
                  >
                    {t.empty.clearFilters}
                  </Link>
                )}
                {searching && (
                  <Link
                    href={savedHref({ ...query, q: "", page: 1 })}
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
                {countLine(t.saved, locale, total, page, pageSize, filtered)}
              </p>
              <div className="mt-3">
                <SavedResults favorites={items} label={t.saved.label} />
              </div>
              <Pagination
                label={t.saved.pages}
                locale={locale}
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
