"use client";

import { ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { useLocale, useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { formatDay, splitDuration } from "../dates";
import { defaultActualFormat } from "../model";
import type { HistoryItem } from "../occurrences";
import { useHistory } from "./history-state";

/** The columns of a row where there is room for them: date, sermon, venue, context, the way in. */
const columns =
  "md:grid md:grid-cols-[8.5rem_minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,1.1fr)_1.25rem] md:items-center md:gap-4";

/**
 * Occasions, one to a row, each opening its own record. Where there is room
 * they line up under headings, as a table would; on a narrow screen each is a
 * short stack, and nothing scrolls sideways. A row shows only what was
 * recorded: an occasion with no venue has no dash where one would be.
 *
 * The sermon is shown as it is now. One that has since been archived, or
 * filed as something else, says so, and its history is here all the same.
 */
export function HistoryList({
  items,
  label,
  onOpen,
  /** On a sermon's own page every row is that sermon, so its name is left out. */
  hideSermon = false,
}: {
  items: readonly HistoryItem[];
  label: string;
  onOpen: (item: HistoryItem) => void;
  hideSermon?: boolean;
}) {
  const locale = useLocale();
  const words = useT("preaching");
  const t = words.history.results;
  const ideas = useT("ideas");

  return (
    <div className="overflow-hidden rounded-xl border bg-surface shadow-card">
      {!hideSermon && (
        // The headings are for the eye. Each row names its own parts for a screen reader.
        <div
          aria-hidden
          className={cn(
            columns,
            "hidden border-b bg-muted/40 px-4 py-2 text-xs font-semibold text-muted-foreground",
          )}
        >
          <span>{t.date}</span>
          <span>{t.sermon}</span>
          <span>{t.venue}</span>
          <span>{t.context}</span>
          <span />
        </div>
      )}
      <ul aria-label={label} className="divide-y">
        {items.map((item) => {
          const date = formatDay(item.preachedOn, locale);
          const time = item.timeOfDay ? words.timesOfDay[item.timeOfDay] : null;
          const length =
            item.durationMinutes === null
              ? null
              : words.duration(
                  splitDuration(item.durationMinutes).hours,
                  splitDuration(item.durationMinutes).minutes,
                );
          const format =
            item.actualFormat === defaultActualFormat ? null : ideas.formats[item.actualFormat];
          const extra = [format, length].filter(Boolean).join(" · ");
          const when = (
            <span className="flex items-baseline gap-2 text-sm whitespace-nowrap tabular-nums">
              <time dateTime={item.preachedOn} className="font-medium">
                {date}
              </time>
              {time && <span className="text-xs font-semibold text-muted-foreground">{time}</span>}
            </span>
          );

          return (
            <li key={item.id}>
              <button
                type="button"
                aria-haspopup="dialog"
                aria-label={t.open(item.sermon.title, time ? `${date} ${time}` : date)}
                onClick={() => onOpen(item)}
                className={cn(
                  "group/row flex w-full min-w-0 items-center gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-accent active:bg-foreground/10 pointer-coarse:min-h-14",
                  !hideSermon && columns,
                )}
              >
                {hideSermon ? (
                  <span className="min-w-0 flex-1">
                    {when}
                    <Places item={item} extra={extra} className="mt-0.5" />
                  </span>
                ) : (
                  <>
                    <span className="max-md:hidden">{when}</span>
                    <span className="min-w-0 flex-1">
                      <span className="md:hidden">{when}</span>
                      <span className="line-clamp-2 font-serif text-base leading-snug font-medium text-pretty max-md:mt-1">
                        {item.sermon.title}
                      </span>
                      {(item.sermon.archivedAt || item.sermon.kind !== "sermon" || extra) && (
                        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                          {item.sermon.archivedAt && <Badge tone="muted">{ideas.archived}</Badge>}
                          {item.sermon.kind !== "sermon" && (
                            <span className="text-xs text-muted-foreground">
                              {t.notSermon(ideas.kinds[item.sermon.kind])}
                            </span>
                          )}
                          {extra && (
                            <span className="text-xs text-muted-foreground tabular-nums max-md:hidden">
                              {extra}
                            </span>
                          )}
                        </span>
                      )}
                      <Places item={item} extra={extra} className="mt-1 md:hidden" />
                    </span>
                    <span className="min-w-0 text-sm max-md:hidden">
                      {item.venue && (
                        <>
                          <span className="block truncate">{item.venue.name}</span>
                          {item.venue.locality && (
                            <span className="block truncate text-xs text-muted-foreground">
                              {item.venue.locality}
                            </span>
                          )}
                        </>
                      )}
                    </span>
                    <span className="min-w-0 truncate text-sm max-md:hidden">
                      {item.context?.name}
                    </span>
                  </>
                )}
                <ChevronRight
                  className="size-4 shrink-0 text-muted-foreground transition-colors duration-150 group-hover/row:text-primary"
                  aria-hidden
                />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** One page of the history section: each row opens the section's own dialog. */
export function HistoryResults({ items, label }: { items: HistoryItem[]; label: string }) {
  const { open } = useHistory();
  return <HistoryList items={items} label={label} onOpen={open} />;
}

/** Where and what kind of occasion, on one quiet line, with whatever else was recorded. */
function Places({
  item,
  extra,
  className,
}: {
  item: HistoryItem;
  extra: string;
  className?: string;
}) {
  const parts = [
    item.venue ? [item.venue.name, item.venue.locality].filter(Boolean).join(", ") : "",
    item.context?.name ?? "",
    extra,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return (
    <span className={cn("block text-[0.8125rem] leading-snug text-muted-foreground", className)}>
      {parts.join(" · ")}
    </span>
  );
}
