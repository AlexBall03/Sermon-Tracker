import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import type { IdeaRecord } from "@/features/ideas/ideas";
import { dictionary } from "@/i18n";
import { defaultLocale, type Locale } from "@/i18n/locales";
import { formatDate } from "@/lib/format";
import { routes } from "@/lib/site";
import { cn } from "@/lib/utils";
import { SectionLink } from "./section-link";

/**
 * The latest ideas of every kind (sermon, point, undecided), as one panel of
 * short rows: each a link to the idea's own page, with what kind it is, its
 * status, and when it last changed. Which ones is `recentIdeas`. It is a
 * glance, not the library: passages, tags, and notes are on the idea's page.
 */
export function RecentIdeas({
  ideas,
  locale = defaultLocale,
  className,
}: {
  ideas: IdeaRecord[];
  /** The interface language. English when omitted. */
  locale?: Locale;
  className?: string;
}) {
  const t = dictionary(locale, "dashboard").recent;
  const results = dictionary(locale, "library").results;
  const words = dictionary(locale, "ideas");

  return (
    <section
      aria-labelledby="recent-heading"
      data-tour="recent-ideas"
      className={cn("min-w-0 self-start rounded-xl border bg-surface shadow-card", className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 pt-5 pb-4">
        <h2 id="recent-heading" className="text-lg font-semibold tracking-[-0.015em]">
          {t.title}
        </h2>
        <SectionLink href={routes.sermonIdeas}>{t.all}</SectionLink>
      </div>
      <ul aria-label={t.title} className="divide-y border-t">
        {ideas.map((idea) => (
          <li
            key={idea.id}
            className="relative flex items-start justify-between gap-4 px-5 py-3.5 transition-colors duration-150 hover:bg-foreground/5 has-[a:active]:bg-foreground/8"
          >
            <div className="min-w-0">
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
                {t.updated}{" "}
                <time dateTime={idea.updatedAt.toISOString()}>
                  {formatDate(idea.updatedAt, locale)}
                </time>
              </p>
            </div>
            <Badge tone={idea.kind === "undecided" ? "muted" : "accent"}>
              {words.kinds[idea.kind]}
            </Badge>
          </li>
        ))}
      </ul>
    </section>
  );
}
