import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { formatDay } from "@/features/preaching/dates";
import { sermonHistoryHref } from "@/features/preaching/history-query";
import type { HistoryItem } from "@/features/preaching/occurrences";
import { dictionary } from "@/i18n";
import { defaultLocale, type Locale } from "@/i18n/locales";
import { routes } from "@/lib/site";
import { cn } from "@/lib/utils";
import { SectionLink } from "./section-link";

/**
 * The latest occasions on the Preaching Record, one to a row. An occasion is
 * not its sermon: a sermon preached twice is two rows, and one whose sermon
 * has since been archived or filed as something else is still here, and says
 * so. A row shows only what was recorded: no venue, no context, or no AM or PM
 * means none is shown, and nothing is worked out from anything else.
 *
 * Each row leads to that sermon's record, where an occasion is read and
 * changed; recording a new one is the page's shared form. With nothing
 * recorded it says so in a line.
 */
export function RecentPreaching({
  items,
  locale = defaultLocale,
  className,
}: {
  items: HistoryItem[];
  /** The interface language. English when omitted. */
  locale?: Locale;
  className?: string;
}) {
  const t = dictionary(locale, "dashboard").preaching;
  const words = dictionary(locale, "preaching");
  const ideas = dictionary(locale, "ideas");

  return (
    <section
      aria-labelledby="preaching-heading"
      data-tour="recent-preaching"
      className={cn("min-w-0 self-start rounded-xl border bg-surface shadow-card", className)}
    >
      <div className="px-5 pt-5 pb-4">
        <h2 id="preaching-heading" className="text-lg font-semibold tracking-[-0.015em]">
          {t.title}
        </h2>
        {items.length === 0 && (
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{t.none}</p>
        )}
      </div>
      {items.length > 0 && (
        <ul aria-label={t.title} className="divide-y border-t">
          {items.map((item) => {
            const date = formatDay(item.preachedOn, locale);
            const time = item.timeOfDay ? words.timesOfDay[item.timeOfDay] : null;
            const places = [
              item.venue ? [item.venue.name, item.venue.locality].filter(Boolean).join(", ") : "",
              item.context?.name ?? "",
            ].filter(Boolean);
            return (
              <li
                key={item.id}
                className="relative px-5 py-3.5 transition-colors duration-150 hover:bg-foreground/5 has-[a:active]:bg-foreground/8"
              >
                <p className="flex items-baseline gap-2 text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                  <time dateTime={item.preachedOn} className="font-semibold text-foreground">
                    {date}
                  </time>
                  {time && <span className="font-semibold">{time}</span>}
                </p>
                <h3 className="mt-1 line-clamp-2 font-serif text-base leading-snug font-medium text-pretty">
                  <Link
                    href={sermonHistoryHref(item.sermon.id)}
                    aria-label={t.view(item.sermon.title, time ? `${date} ${time}` : date)}
                    className="rounded-sm outline-offset-4 after:absolute after:inset-0"
                  >
                    {item.sermon.title}
                  </Link>
                </h3>
                {(item.sermon.archivedAt || item.sermon.kind !== "sermon") && (
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                    {item.sermon.archivedAt && <Badge tone="muted">{ideas.archived}</Badge>}
                    {item.sermon.kind !== "sermon" && (
                      <span className="text-xs text-muted-foreground">
                        {words.history.results.notSermon(ideas.kinds[item.sermon.kind])}
                      </span>
                    )}
                  </p>
                )}
                {places.length > 0 && (
                  <p className="mt-1 text-[0.8125rem] leading-snug text-muted-foreground">
                    {places.join(" · ")}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="border-t px-5 py-3.5">
        <SectionLink href={routes.preachingRecord}>{t.all}</SectionLink>
      </div>
    </section>
  );
}
