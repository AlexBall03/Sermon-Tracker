"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { referenceSpans, type ChapterSpan, type ScriptureReference } from "../reference";
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
  className?: string;
};

// The scroll margins keep a verse that is gone to clear of the bars fixed above and below.
const verseRow = "flex w-full scroll-mt-32 scroll-mb-32 gap-3 rounded-md px-2 py-1 text-left";
const verseNumber =
  "w-6 shrink-0 pt-[0.4em] text-right font-sans text-[0.6875rem] leading-none font-semibold tabular-nums";

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
  superscription,
  located,
  size = "default",
  className,
}: PassageTextProps) {
  const from = show?.from ?? 1;
  const to = Math.min(show?.to ?? verses.length, verses.length);
  const chosen = new Set(selected);
  const rows = [];

  for (let verse = from; verse <= to; verse++) {
    const isSelected = chosen.has(verse);
    // Selected verses that follow one another read as one block: the corners
    // between them are square, so the tint runs on without a notch at each join.
    const joined = cn(
      isSelected && chosen.has(verse - 1) && verse > from && "rounded-t-none",
      isSelected && chosen.has(verse + 1) && verse < to && "rounded-b-none",
    );
    const content = (
      <>
        <span className={cn(verseNumber, isSelected ? "text-primary" : "text-muted-foreground")}>
          {verse}
        </span>
        <span className="min-w-0 flex-1">{verses[verse - 1]}</span>
      </>
    );
    rows.push(
      onSelectVerse ? (
        <button
          key={verse}
          type="button"
          aria-pressed={isSelected}
          aria-current={verse === located ? "location" : undefined}
          data-located={verse === located ? "" : undefined}
          data-verse={verse}
          onClick={() => onSelectVerse(verse)}
          className={cn(
            verseRow,
            "transition-colors duration-150 hover:bg-accent active:bg-foreground/10",
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
          aria-current={verse === located ? "location" : undefined}
          data-located={verse === located ? "" : undefined}
          className={cn(verseRow, isSelected && "bg-primary-soft", joined)}
        >
          {content}
        </p>
      ),
    );
  }

  return (
    <div
      className={cn(
        "font-serif text-foreground",
        size === "reader"
          ? "text-[1.125rem] leading-[1.75] sm:text-[1.1875rem]"
          : "text-[1.0625rem] leading-[1.65]",
        className,
      )}
    >
      {superscription && from === 1 && (
        <p
          data-superscription
          className="mb-2 px-2 pl-11 text-[0.9375em] text-muted-foreground italic"
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
  return (
    <div role="status" aria-live="polite" className="space-y-2.5 px-2 py-1.5">
      <span className="sr-only">Loading the passage</span>
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
  return (
    <div role="alert" className="px-2 py-1.5 text-sm text-muted-foreground">
      <p>The passage could not be loaded.</p>
      <Button variant="outline" size="sm" className="mt-3" onClick={retry}>
        Try again
      </Button>
    </div>
  );
}

function SpanText({
  span,
  heading,
  limit,
}: {
  span: ChapterSpan;
  heading: boolean;
  limit: number;
}) {
  const chapter = useChapter(span.book, span.chapter);
  return (
    <div>
      {heading && (
        <p className="mb-1 px-2 font-sans text-xs font-semibold text-muted-foreground">
          Chapter {span.chapter}
        </p>
      )}
      {chapter.status === "loading" && <PassageSkeleton />}
      {chapter.status === "error" && <PassageError retry={chapter.retry} />}
      {chapter.status === "ready" && (
        <PassageText
          verses={chapter.verses}
          show={{ from: span.from, to: Math.min(span.to, span.from + limit - 1) }}
        />
      )}
    </div>
  );
}

/**
 * The text of a reference, fetched a chapter at a time. `limit` caps how many
 * verses are shown, for a preview; the caller is told how many were left out.
 */
export function Passage({
  reference,
  limit = Infinity,
  className,
}: {
  reference: ScriptureReference;
  limit?: number;
  className?: string;
}) {
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
        <SpanText key={span.chapter} span={span} heading={spans.length > 1} limit={take} />
      ))}
      {hidden > 0 && (
        <p className="px-2 text-sm text-muted-foreground">
          And {hidden} more {hidden === 1 ? "verse" : "verses"}.
        </p>
      )}
    </div>
  );
}
