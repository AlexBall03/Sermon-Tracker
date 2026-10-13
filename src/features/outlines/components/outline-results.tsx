import Link from "next/link";
import { List } from "lucide-react";

import { dictionary } from "@/i18n";
import { defaultLocale, type Locale } from "@/i18n/locales";
import { formatDate } from "@/lib/format";
import { routes } from "@/lib/site";
import type { OutlineSummary } from "../outlines";
import { outlineHref } from "../outlines-query";

/**
 * One page of the overview: an outline to a card, in the library's card
 * style. The whole card opens the outline; the link to its sermon sits above
 * that, so it opens the sermon instead.
 *
 * What is shown about the sermon is the sermon's own: its title and its
 * status. An outline has no status, and nothing here suggests one.
 */
export function OutlineResults({
  outlines,
  label,
  locale = defaultLocale,
}: {
  outlines: OutlineSummary[];
  label: string;
  /** The interface language. English when omitted. */
  locale?: Locale;
}) {
  const t = dictionary(locale, "outlines").overview;
  const statuses = dictionary(locale, "ideas").statuses;
  return (
    <ul aria-label={label} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {outlines.map((outline) => (
        <li
          key={outline.id}
          className="relative flex min-w-0 flex-col rounded-xl border bg-surface p-4 shadow-card transition-[border-color,background-color] duration-150 focus-within:border-primary/70 hover:border-primary/70 has-[a:active]:bg-foreground/5"
        >
          <div className="mb-2.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="flex min-w-0 items-center gap-1.5">
              <List className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{t.entries(outline.entryCount)}</span>
            </span>
            <span className="font-medium whitespace-nowrap">
              <span className="sr-only">{t.status} </span>
              {statuses[outline.sermon.status]}
            </span>
          </div>
          <h2 className="line-clamp-3 flex-1 font-serif text-lg leading-snug font-medium text-pretty">
            <Link
              href={outlineHref(outline.id)}
              aria-label={t.open(outline.sermon.title)}
              className="rounded-sm outline-offset-4 after:absolute after:inset-0 after:rounded-xl"
            >
              {outline.sermon.title}
            </Link>
          </h2>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <p className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
              {t.updated}{" "}
              <time dateTime={outline.updatedAt.toISOString()}>
                {formatDate(outline.updatedAt, locale)}
              </time>
            </p>
            <Link
              href={`${routes.library}/${outline.sermon.id}`}
              aria-label={t.openSermon(outline.sermon.title)}
              className="relative z-10 -mr-1.5 rounded-md px-1.5 py-1 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:text-primary active:text-primary pointer-coarse:py-2.5"
            >
              {t.sermon}
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
