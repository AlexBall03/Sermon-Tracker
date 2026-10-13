"use client";

import { BookOpen, Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useReading } from "@/features/preferences/client";
import { useT } from "@/i18n/client";
import type { Locale } from "@/i18n/locales";
import { cn } from "@/lib/utils";
import { referenceSpans, type ChapterSpan, type ScriptureReference } from "../reference";
import { highlightBackground } from "../saved/highlight-style";
import type { HighlightColor } from "../saved/model";
import { translations, type TranslationId } from "../translations";
import { useChapter } from "../use-chapter";

type VerseRange = { from: number; to: number };

type PassageTextProps = {
  /** The whole chapter: index 0 is verse 1. */
  verses: string[];
  /** Show only these verses. The whole chapter when omitted. */
  show?: VerseRange;
  /** Verses to mark as selected, in any order. */
  selected?: readonly number[];
  /** Makes each verse a button, for choosing a passage. */
  onSelectVerse?: (verse: number) => void;
  /**
   * Called instead of `onSelectVerse` when Shift is held for the click, for a
   * surface that takes every verse from the last one chosen to this one.
   * Without it, Shift changes nothing.
   */
  onSelectThrough?: (verse: number) => void;
  /**
   * Verses the reader has highlighted, by number, each in its one color. A
   * highlight is kept; a selection is of the moment. They are drawn apart,
   * the highlight behind the words and the selection across the row, so a
   * verse that is both shows both.
   */
  highlights?: Readonly<Record<number, HighlightColor>>;
  /** Verses that are in a saved passage, marked with a small star by the number. */
  favorites?: ReadonlySet<number>;
  /**
   * The chapter's title, set above verse 1 when verse 1 is shown: a psalm's
   * "A Psalm of David." It is not a verse, so it has no number and cannot be
   * chosen.
   */
  superscription?: string | null;
  /**
   * A verse that was gone to. It is named to assistive technology as the
   * current location, which is not the same as selected; the surface that
   * goes there decides how to draw the eye to it (the reader lights it briefly).
   */
  located?: number | null;
  /** `reader` is the Bible page: larger type and more air than a panel has room for. */
  size?: "default" | "reader";
  /**
   * The language of the text, when it may not be the interface's: said on the
   * element, so a screen reader pronounces Spanish text as Spanish.
   */
  lang?: Locale;
  className?: string;
};

// The scroll margins keep a verse that is gone to clear of the bars fixed above and below.
const verseRow = "flex w-full scroll-mt-32 scroll-mb-32 gap-3 rounded-md px-2 py-1 text-left";
const verseMargin = "flex w-6 shrink-0 flex-col items-end gap-0.5 pt-[0.4em]";
const verseNumber = "font-sans text-[0.6875rem] leading-none font-semibold tabular-nums";
// The highlighter's stroke: behind the words alone, line by line, and it comes and goes gently.
// On the Bible page at full width, the row keeps as much room right of the
// words as the number takes on their left, so the text sits in the middle.
const readerRow = "max-md:gap-2.5 max-md:pr-9 max-md:pl-1.5";
const readerMargin = "max-md:w-5";
const verseWords =
  "rounded-[0.2em] box-decoration-clone px-[0.12em] py-[0.08em] transition-colors duration-200";

/**
 * Scripture, set to be read: the serif face, one verse to a line, the number
 * hanging quietly in the margin. Every surface that shows Bible text uses
 * this, so a passage looks the same in a preview, the panel, and later the
 * reader. Selected verses carry the emerald tint and an emerald number, so
 * selection does not rest on the tint alone.
 */
export function PassageText({
  verses,
  show,
  selected,
  onSelectVerse,
  onSelectThrough,
  highlights,
  favorites,
  superscription,
  located,
  size = "default",
  lang,
  className,
}: PassageTextProps) {
  const t = useT("scripture").passage;
  const from = show?.from ?? 1;
  const to = Math.min(show?.to ?? verses.length, verses.length);
  const chosen = new Set(selected);
  const reader = size === "reader";
  const rows = [];

  for (let verse = from; verse <= to; verse++) {
    const isSelected = chosen.has(verse);
    // Selected verses that follow one another read as one block: the corners
    // between them are square, so the tint runs on without a notch at each join.
    const joined = cn(
      isSelected && chosen.has(verse - 1) && verse > from && "rounded-t-none",
      isSelected && chosen.has(verse + 1) && verse < to && "rounded-b-none",
    );
    const highlight = highlights?.[verse];
    const favorite = favorites?.has(verse) ?? false;
    const content = (
      <>
        <span className={cn(verseMargin, reader && readerMargin)}>
          <span className={cn(verseNumber, isSelected ? "text-primary" : "text-muted-foreground")}>
            {verse}
          </span>
          {favorite && <Star className="size-2.5 fill-current text-gold" aria-hidden />}
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn(verseWords, highlight && highlightBackground[highlight])}>
            {verses[verse - 1]}
          </span>
          {/* Said as well as shown: neither mark rests on color or a glyph alone. */}
          {(highlight || favorite) && (
            <span className="sr-only">
              {highlight && ` ${t.highlighted(highlight)}`}
              {favorite && ` ${t.inFavorites}`}
            </span>
          )}
        </span>
      </>
    );
    const marks = {
      "data-highlight": highlight,
      "data-favorite": favorite ? "" : undefined,
    };
    rows.push(
      onSelectVerse ? (
        <button
          key={verse}
          type="button"
          aria-pressed={isSelected}
          aria-current={verse === located ? "location" : undefined}
          data-located={verse === located ? "" : undefined}
          data-verse={verse}
          {...marks}
          onClick={(event) =>
            event.shiftKey && onSelectThrough ? onSelectThrough(verse) : onSelectVerse(verse)
          }
          className={cn(
            verseRow,
            reader && readerRow,
            // Quieter than a control's hover: it is under the eye the whole time the text is read.
            "transition-colors duration-150 hover:bg-accent/55 active:bg-accent",
            isSelected && "bg-primary-soft hover:bg-primary-soft",
            joined,
          )}
        >
          {content}
        </button>
      ) : (
        <p
          key={verse}
          data-verse={verse}
          {...marks}
          aria-current={verse === located ? "location" : undefined}
          data-located={verse === located ? "" : undefined}
          className={cn(verseRow, reader && readerRow, isSelected && "bg-primary-soft", joined)}
        >
          {content}
        </p>
      ),
    );
  }

  return (
    <div
      lang={lang}
      className={cn(
        "font-serif text-foreground",
        reader
          ? "text-[1.125rem] leading-[1.75] sm:text-[1.1875rem]"
          : "text-[1.0625rem] leading-[1.65]",
        className,
      )}
    >
      {superscription && from === 1 && (
        <p
          data-superscription
          className={cn(
            "mb-2 px-2 pl-11 text-[0.9375em] text-muted-foreground italic",
            reader && "max-md:pr-9 max-md:pl-9",
          )}
        >
          {superscription}
        </p>
      )}
      {rows}
    </div>
  );
}

/** Lines standing in for verses while a chapter loads. */
export function PassageSkeleton({ lines = 3 }: { lines?: number }) {
  const t = useT("scripture").passage;
  return (
    <div role="status" aria-live="polite" className="space-y-2.5 px-2 py-1.5">
      <span className="sr-only">{t.loading}</span>
      {Array.from({ length: lines }, (_, index) => (
        <div
          key={index}
          className="h-4 animate-pulse rounded-md bg-secondary"
          style={{ width: `${[100, 92, 64][index % 3]}%` }}
        />
      ))}
    </div>
  );
}

export function PassageError({ retry }: { retry: () => void }) {
  const t = useT("scripture").passage;
  return (
    <div role="alert" className="px-2 py-1.5 text-sm text-muted-foreground">
      <p>{t.unavailable}</p>
      <Button variant="outline" size="sm" className="mt-3" onClick={retry}>
        {t.tryAgain}
      </Button>
    </div>
  );
}

function SpanText({
  translation,
  span,
  heading,
  limit,
}: {
  translation: TranslationId;
  span: ChapterSpan;
  heading: boolean;
  limit: number;
}) {
  const t = useT("scripture").passage;
  const chapter = useChapter(translation, span.book, span.chapter);
  return (
    <div>
      {heading && (
        <p className="mb-1 px-2 font-sans text-xs font-semibold text-muted-foreground">
          {t.chapter(span.chapter)}
        </p>
      )}
      {chapter.status === "loading" && <PassageSkeleton />}
      {chapter.status === "error" && <PassageError retry={chapter.retry} />}
      {chapter.status === "ready" && (
        <PassageText
          lang={translations[translation].language}
          verses={chapter.verses}
          show={{ from: span.from, to: Math.min(span.to, span.from + limit - 1) }}
        />
      )}
    </div>
  );
}

/**
 * How much of a passage is read in place before the rest is left to the
 * Scripture Panel or the Bible: in a preview that floats over the page, and in
 * a row that opens within it. Every surface that shows a passage in place uses
 * one of these two, so a long passage is bounded the same way wherever it is
 * met, and never becomes a page within a page.
 */
export const passageLimits = { preview: 6, row: 12 } as const;

/**
 * The text of a reference, fetched a chapter at a time, in the account's own
 * translation unless another is named. `limit` caps how many verses are
 * shown, for a preview, and what was left out is said beneath. With `onMore`
 * that line is the way to the rest: a button, for the surface to open the
 * whole passage where there is room to read it.
 */
export function Passage({
  reference,
  limit = Infinity,
  translation,
  onMore,
  className,
}: {
  reference: ScriptureReference;
  limit?: number;
  translation?: TranslationId;
  /** Opens the whole passage. Given, the count of verses left out becomes a button. */
  onMore?: () => void;
  className?: string;
}) {
  const t = useT("scripture").passage;
  const reading = useReading();
  const shownIn = translation ?? reading.translation;
  const spans = referenceSpans(reference);
  let room = limit;
  const shown: { span: ChapterSpan; take: number }[] = [];
  for (const span of spans) {
    if (room <= 0) break;
    const take = Math.min(span.to - span.from + 1, room);
    shown.push({ span, take });
    room -= take;
  }
  const total = spans.reduce((sum, span) => sum + span.to - span.from + 1, 0);
  const hidden = total - shown.reduce((sum, item) => sum + item.take, 0);

  return (
    <div className={cn("space-y-4", className)}>
      {shown.map(({ span, take }) => (
        <SpanText
          key={span.chapter}
          translation={shownIn}
          span={span}
          heading={spans.length > 1}
          limit={take}
        />
      ))}
      {hidden > 0 &&
        (onMore ? (
          <button
            type="button"
            onClick={onMore}
            className="mx-2 inline-flex min-h-8 items-center gap-1.5 rounded-md text-sm font-medium text-muted-foreground underline-offset-4 transition-colors duration-150 hover:text-primary hover:underline active:text-primary pointer-coarse:min-h-11"
          >
            <BookOpen className="size-3.5" aria-hidden />
            {t.readMore(hidden)}
          </button>
        ) : (
          <p className="px-2 text-sm text-muted-foreground">{t.more(hidden)}</p>
        ))}
    </div>
  );
}
