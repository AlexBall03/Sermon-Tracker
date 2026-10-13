import Link from "next/link";
import { ArrowRight, List } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { DevelopedLine } from "@/features/ideas/components/library/idea-results";
import type { IdeaRecord } from "@/features/ideas/ideas";
import { OutlineLink } from "@/features/outlines/components/outline-link";
import type { SermonOutlineSummary } from "@/features/outlines/outlines";
import { outlineHref } from "@/features/outlines/outlines-query";
import { dictionary } from "@/i18n";
import { defaultLocale, type Locale } from "@/i18n/locales";
import { routes } from "@/lib/site";
import { cn } from "@/lib/utils";
import { SectionLink } from "./section-link";

/** A sermon being worked on, with its outline when it has one. */
export type WorkInProgress = { sermon: IdeaRecord; outline: SermonOutlineSummary | null };

/** As small as the rows' other controls, and a full touch target on a touch screen. */
const compact = "h-9 px-3.5 pointer-coarse:h-11";

/**
 * The dashboard's main section: the sermons being developed now, most
 * recently worked on first, each with the way back into it. Which sermons,
 * and in what order, is `continueWorking`; this only draws them, as one panel
 * of rows like the dashboard's other three.
 *
 * A sermon with an outline is resumed in the editor; one without is opened on
 * its own page, with the usual link to where it is given an outline. Both are
 * links: nothing here makes an outline. An outline has no status and no
 * measure of progress, so a row says only that it is there and how much it
 * holds.
 */
export function ContinueWorking({
  items,
  locale = defaultLocale,
  className,
}: {
  items: WorkInProgress[];
  /** The interface language. English when omitted. */
  locale?: Locale;
  className?: string;
}) {
  const t = dictionary(locale, "dashboard").continue;
  const results = dictionary(locale, "library").results;
  const statuses = dictionary(locale, "ideas").statuses;
  const outlines = dictionary(locale, "outlines").overview;
  const none = items.length === 0;

  return (
    <section
      aria-labelledby="continue-heading"
      data-tour="continue-working"
      className={cn("min-w-0 self-start rounded-xl border bg-surface shadow-card", className)}
    >
      <div className="px-5 pt-5 pb-4">
        <h2 id="continue-heading" className="text-lg font-semibold tracking-[-0.015em]">
          {t.title}
        </h2>
        <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted-foreground">
          {none ? t.none : t.description}
        </p>
      </div>
      {none ? (
        <div className="border-t px-5 py-3.5">
          <SectionLink href={routes.sermonIdeas}>{t.openLibrary}</SectionLink>
        </div>
      ) : (
        <ul aria-label={t.title} className="divide-y border-t">
          {items.map(({ sermon, outline }) => (
            <li
              key={sermon.id}
              className="flex flex-col gap-x-6 gap-y-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <h3 className="line-clamp-2 font-serif text-lg leading-snug font-medium text-pretty">
                  <Link
                    href={`${routes.library}/${sermon.id}`}
                    // The row is not one link, as the other panels' rows are, so the title says it is one.
                    className="rounded-sm underline decoration-muted-foreground/45 decoration-dotted decoration-1 underline-offset-[5px] outline-offset-4 transition-colors duration-150 hover:text-primary hover:decoration-primary"
                  >
                    {sermon.title}
                  </Link>
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground tabular-nums">
                  <span className="sr-only">{results.status} </span>
                  <span className="font-semibold text-foreground">{statuses[sermon.status]}</span>
                  <span aria-hidden> · </span>
                  <span className="sr-only">, </span>
                  <DevelopedLine idea={sermon} locale={locale} />
                </p>
                <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                  <List className="size-3.5 shrink-0" aria-hidden />
                  <span className="truncate">
                    {outline ? (
                      <>
                        {t.outline}
                        <span aria-hidden> · </span>
                        <span className="sr-only">: </span>
                        {outlines.entries(outline.entryCount)}
                      </>
                    ) : (
                      t.noOutline
                    )}
                  </span>
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-2">
                {outline ? (
                  <>
                    <Link
                      href={`${routes.library}/${sermon.id}`}
                      aria-label={t.openSermonNamed(sermon.title)}
                      className={cn(
                        buttonVariants({ variant: "ghost" }),
                        compact,
                        "text-muted-foreground hover:text-primary max-sm:order-last",
                      )}
                    >
                      {t.openSermon}
                    </Link>
                    <Link
                      href={outlineHref(outline.id)}
                      aria-label={t.resumeNamed(sermon.title)}
                      className={cn(buttonVariants({ variant: "outline" }), compact)}
                    >
                      {t.resume}
                      <ArrowRight data-trailing aria-hidden />
                    </Link>
                  </>
                ) : (
                  <>
                    {/* Leads to where the sermon is given an outline; opening that page makes none. */}
                    <OutlineLink
                      sermon={sermon}
                      outlineId={null}
                      onCard
                      locale={locale}
                      className="max-sm:order-last pointer-coarse:h-11"
                    />
                    <Link
                      href={`${routes.library}/${sermon.id}`}
                      aria-label={t.openSermonNamed(sermon.title)}
                      className={cn(buttonVariants({ variant: "outline" }), compact)}
                    >
                      {t.openSermon}
                      <ArrowRight data-trailing aria-hidden />
                    </Link>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
