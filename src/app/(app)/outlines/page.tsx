import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { getDb } from "@/db";
import { requireActiveUser } from "@/features/auth/access";
import { Pagination } from "@/features/ideas/components/library/pagination";
import { OutlineResults } from "@/features/outlines/components/outline-results";
import {
  CreateOutlineAction,
  OutlinesControls,
  OutlinesProvider,
  OutlinesResultsRegion,
} from "@/features/outlines/components/outlines-state";
import { listOutlines } from "@/features/outlines/outlines";
import {
  isOutlinesSearch,
  outlinesHref,
  parseOutlinesQuery,
  type OutlinesSearchParams,
} from "@/features/outlines/outlines-query";
import { getPreferences } from "@/features/preferences/current";
import { dictionary, formatNumber, type Dictionaries } from "@/i18n";
import type { Locale } from "@/i18n/locales";
import { getLocale } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: dictionary(await getLocale(), "outlines").overview.metaTitle };
}

const emptyState = "mt-6 rounded-xl border border-dashed border-input px-6 py-12 sm:px-8";
const emptyHeading = "font-display text-2xl leading-snug font-medium";
const emptyCopy = "mt-3 max-w-md text-[0.9375rem] leading-relaxed text-muted-foreground";

/** "Showing 25–48 of 126 outlines", or simply how many there are when they fit on one page. */
function countLine(
  t: Dictionaries["outlines"]["overview"],
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
 * The signed-in person's outlines, a page at a time: the main navigation's
 * Outlines. Rendered per request and never cached, so work saved in an
 * outline's editor a moment ago is what it shows. The search, order, and page
 * come from the URL (features/outlines/outlines-query.ts) and the database
 * does the work; the controls only change the address.
 *
 * It lists outlines, not sermons: a sermon with no outline is not here, and
 * neither is the outline of a sermon that is archived or filed as something
 * else, which is kept and still opens from its sermon's page. The query takes
 * the owner from the session and reads no entry of any outline.
 */
export default async function OutlinesPage({
  searchParams,
}: {
  searchParams?: Promise<OutlinesSearchParams>;
} = {}) {
  const user = await requireActiveUser();
  const { locale } = await getPreferences();
  const t = dictionary(locale, "outlines").overview;
  const query = parseOutlinesQuery(await searchParams);
  const db = getDb();

  const { items, total, page, pageSize, totalPages } = await listOutlines(db, user.id, query);
  const searching = isOutlinesSearch(query);
  // Whether there is any outline at all is asked only when the search found nothing.
  const none =
    total === 0 && (!searching || (await listOutlines(db, user.id, { pageSize: 1 })).total === 0);

  return (
    <div className="container-page py-10 lg:py-12">
      <OutlinesProvider query={query}>
        <PageHeader title={t.title} description={t.description} action={<CreateOutlineAction />} />

        {none ? (
          // No outline at all: there is nothing to search or order yet.
          <section aria-labelledby="empty-heading" className={emptyState}>
            <h2 id="empty-heading" className={emptyHeading}>
              {t.empty.nothing}
            </h2>
            <p className={emptyCopy}>{t.empty.nothingBody}</p>
            <CreateOutlineAction className="mt-6" />
          </section>
        ) : (
          <>
            <OutlinesControls className="mt-5" />
            <OutlinesResultsRegion>
              {total === 0 ? (
                <section aria-labelledby="empty-heading" className={emptyState}>
                  <h2 id="empty-heading" className={emptyHeading}>
                    {t.empty.noMatch}
                  </h2>
                  <p role="status" className={emptyCopy}>
                    {t.empty.noMatchBody(query.q)}
                  </p>
                  <Link
                    href={outlinesHref({ ...query, q: "", page: 1 })}
                    className={buttonVariants({ variant: "outline", className: "mt-6" })}
                  >
                    {t.empty.clearSearch}
                  </Link>
                </section>
              ) : (
                <>
                  <p role="status" className="mt-5 text-sm text-muted-foreground tabular-nums">
                    {countLine(t, locale, total, page, pageSize, searching)}
                  </p>
                  <div className="mt-3">
                    <OutlineResults outlines={items} label={t.label} locale={locale} />
                  </div>
                  <Pagination
                    label={t.pages}
                    locale={locale}
                    hrefAt={(target) => outlinesHref({ ...query, page: target })}
                    page={page}
                    totalPages={totalPages}
                  />
                </>
              )}
            </OutlinesResultsRegion>
          </>
        )}
      </OutlinesProvider>
    </div>
  );
}
