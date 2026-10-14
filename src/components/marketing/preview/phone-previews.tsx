import { CalendarPlus, ChevronDown, ChevronRight, Menu, Search, Star } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { formatDay } from "@/features/preaching/dates";
import { getBook } from "@/features/scripture/books";
import { dictionary } from "@/i18n";
import type { Locale } from "@/i18n/locales";
import { cn } from "@/lib/utils";
import { demoReading, demoWorkspace } from "../demo";
import { PhoneFrame, place } from "./frames";
import { SectionHead } from "./library-preview";

/**
 * The Bible reader on a phone, drawn from `BibleReader` and `PassageText`:
 * the chapter's bar, the translation, and the text set one verse to a line,
 * with one verse highlighted and saved as a favorite. The words are the
 * translation's own, in the language of the page.
 */
export function BiblePhone({ locale, className }: { locale: Locale; className?: string }) {
  const workspace = demoWorkspace(locale);
  const t = dictionary(locale, "marketing");
  const book = getBook(demoReading.book, locale)?.name ?? "";
  return (
    <PhoneFrame locale={locale} current="bible" initials={workspace.initials} className={className}>
      <div className="flex h-14 items-center gap-1.5 border-b px-3">
        <span className="grid size-9 shrink-0 place-items-center text-muted-foreground">
          <Menu className="size-5" />
        </span>
        <p className="min-w-0 flex-1 truncate text-center font-display text-lg leading-snug font-medium tracking-[-0.01em]">
          {book} {demoReading.chapter}
        </p>
        <span className="grid size-9 shrink-0 place-items-center text-muted-foreground">
          <Search className="size-5" />
        </span>
      </div>
      <div className="px-3 py-6">
        <div className="mb-3 flex items-center px-2">
          <span className="flex h-8 w-[5.25rem] items-center justify-between rounded-lg border border-input bg-surface px-2.5 text-xs font-medium shadow-card">
            {t.preview.translation[locale]}
            <ChevronDown className="size-3.5 text-muted-foreground" />
          </span>
        </div>
        <div className="font-serif text-[1.125rem] leading-[1.75] text-foreground">
          {t.demo.verses.map((words, index) => {
            const verse = demoReading.firstVerse + index;
            const marked = verse === demoReading.marked;
            return (
              <p key={verse} className="flex w-full gap-2.5 rounded-md py-1 pr-9 pl-1.5">
                <span className="flex w-5 shrink-0 flex-col items-end gap-0.5 pt-[0.4em]">
                  <span className="font-sans text-[0.6875rem] leading-none font-semibold text-muted-foreground tabular-nums">
                    {verse}
                  </span>
                  {marked && <Star className="size-2.5 mark-in fill-current text-gold" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "rounded-[0.2em] box-decoration-clone px-[0.12em] py-[0.08em]",
                      marked && "mark-in bg-highlight-yellow",
                    )}
                  >
                    {words}
                  </span>
                </span>
              </p>
            );
          })}
        </div>
      </div>
    </PhoneFrame>
  );
}

/**
 * The Preaching Record on a phone, drawn from `HistoryList` as it stacks
 * below `md`: each occasion its date, its sermon, and where and what kind of
 * occasion it was.
 */
export function PreachingPhone({ locale, className }: { locale: Locale; className?: string }) {
  const workspace = demoWorkspace(locale);
  const words = dictionary(locale, "preaching");
  return (
    <PhoneFrame
      locale={locale}
      current="library"
      initials={workspace.initials}
      className={className}
    >
      <div className="px-5 py-10">
        <SectionHead
          locale={locale}
          section="history"
          phone
          action={
            <span className={buttonVariants()}>
              <CalendarPlus />
              {words.history.record}
            </span>
          }
        />
        <div className="mt-6 overflow-hidden rounded-xl border bg-surface shadow-card">
          <div className="divide-y">
            {workspace.occasions.map((item, index) => (
              <div
                key={item.id}
                style={place(index)}
                className="flex min-w-0 stagger items-center gap-3 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex items-baseline gap-2 text-sm whitespace-nowrap tabular-nums">
                    <span className="font-medium">{formatDay(item.preachedOn, locale)}</span>
                    {item.timeOfDay && (
                      <span className="text-xs font-semibold text-muted-foreground">
                        {words.timesOfDay[item.timeOfDay]}
                      </span>
                    )}
                  </p>
                  <p className="mt-1 line-clamp-2 font-serif text-base leading-snug font-medium text-pretty">
                    {item.sermon.title}
                  </p>
                  <p className="mt-1 text-[0.8125rem] leading-snug text-muted-foreground">
                    {[
                      [item.venue.name, item.venue.locality].filter(Boolean).join(", "),
                      item.context,
                      words.duration(0, item.durationMinutes),
                    ].join(" · ")}
                  </p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </PhoneFrame>
  );
}
