import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { DevelopedLine } from "@/features/ideas/components/library/idea-results";
import type { IdeaRecord } from "@/features/ideas/ideas";
import { defaultLibraryQuery, libraryHref } from "@/features/ideas/library-query";
import { revisitAfterDays } from "@/features/ideas/model";
import { dictionary } from "@/i18n";
import { defaultLocale, type Locale } from "@/i18n/locales";
import { routes } from "@/lib/site";

/**
 * A few unfinished sermon ideas that have gone a while without work, as one
 * panel beside the sermons being worked on: each row a link to the idea's own page. Which
 * ones, and in what order, is `revisitIdeas`; this only draws them. With none
 * to offer it says so and leads to the library: nothing is shown merely to
 * fill the panel.
 */
export function RevisitIdeas({
  ideas,
  locale = defaultLocale,
}: {
  ideas: IdeaRecord[];
  /** The interface language. English when omitted. */
  locale?: Locale;
}) {
  const t = dictionary(locale, "dashboard").revisit;
  const results = dictionary(locale, "library").results;
  const words = dictionary(locale, "ideas");
  const none = ideas.length === 0;

  return (
    <section
      aria-labelledby="revisit-heading"
      data-tour="revisit-ideas"
      className="min-w-0 self-start rounded-xl border bg-surface shadow-card"
    >
      <div className="px-5 pt-5 pb-4">
        <h2 id="revisit-heading" className="text-lg font-semibold tracking-[-0.015em]">
          {t.title}
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          {none ? t.none(revisitAfterDays) : t.description}
        </p>
      </div>
      {!none && (
        <ul aria-label={t.title} className="divide-y border-t">
          {ideas.map((idea) => (
            <li
              key={idea.id}
              className="relative px-5 py-3.5 transition-colors duration-150 hover:bg-foreground/5 has-[a:active]:bg-foreground/8"
            >
              <h3 className="line-clamp-2 font-serif text-base leading-snug font-medium text-pretty">
                <Link
                  href={`${routes.library}/${idea.id}`}
                  className="rounded-sm outline-offset-4 after:absolute after:inset-0"
                >
                  {idea.title}
                </Link>
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground tabular-nums">
                <span className="sr-only">{results.status} </span>
                <span className="font-medium">{words.statuses[idea.status]}</span>
                <span aria-hidden> · </span>
                <span className="sr-only">, </span>
                <DevelopedLine idea={idea} locale={locale} />
              </p>
            </li>
          ))}
        </ul>
      )}
      <div className="border-t px-5 py-3.5">
        <Link
          href={
            none
              ? routes.sermonIdeas
              : libraryHref({ ...defaultLibraryQuery, revisit: "attention" })
          }
          className="group/all inline-flex items-center gap-1.5 rounded-md text-sm font-semibold text-primary link-underline"
        >
          {none ? t.openLibrary : t.all}
          <ArrowRight
            className="size-4 transition-transform duration-150 group-hover/all:translate-x-0.5"
            aria-hidden
          />
        </Link>
      </div>
    </section>
  );
}
