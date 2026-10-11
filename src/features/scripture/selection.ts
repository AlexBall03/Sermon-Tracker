import {
  formatReferences,
  referenceSpans,
  versesToReferences,
  type ScriptureReference,
} from "./reference";

/**
 * What is selected in the chapter the Bible reader is showing.
 *
 * Nothing selected is nothing: it is never read as the whole chapter, so
 * nobody acts on a chapter they did not choose. The whole chapter is its own
 * state, reached on purpose, and it is one reference, not a list of verses.
 */
export type VerseSelection =
  { kind: "none" } | { kind: "verses"; verses: readonly number[] } | { kind: "chapter" };

export const noSelection: VerseSelection = { kind: "none" };
export const wholeChapter: VerseSelection = { kind: "chapter" };

const everyVerse = (count: number) => Array.from({ length: count }, (_, index) => index + 1);

/** Verses in order, each once, and only those the chapter has. */
export function selectVerses(verses: readonly number[], verseCount: number): VerseSelection {
  const tidy = [...new Set(verses)]
    .filter((verse) => Number.isInteger(verse) && verse >= 1 && verse <= verseCount)
    .sort((a, b) => a - b);
  if (tidy.length === 0) return noSelection;
  // Every verse, however it was reached, is the chapter.
  return tidy.length === verseCount ? wholeChapter : { kind: "verses", verses: tidy };
}

/** The verses a selection covers, in order. */
export function selectedVerses(selection: VerseSelection, verseCount: number): readonly number[] {
  if (selection.kind === "none") return [];
  return selection.kind === "chapter" ? everyVerse(verseCount) : selection.verses;
}

/** Selects a verse that is not selected, and unselects one that is. */
export function toggleVerse(
  selection: VerseSelection,
  verse: number,
  verseCount: number,
): VerseSelection {
  const current = selectedVerses(selection, verseCount);
  return selectVerses(
    current.includes(verse) ? current.filter((item) => item !== verse) : [...current, verse],
    verseCount,
  );
}

/**
 * The selection as references: none for nothing, one for the whole chapter,
 * and otherwise one for each unbroken run of verses.
 */
export function selectionReferences(
  book: number,
  chapter: number,
  selection: VerseSelection,
): ScriptureReference[] {
  if (selection.kind === "none") return [];
  return versesToReferences(book, chapter, selection.kind === "chapter" ? [] : selection.verses);
}

/** Stands on a line of its own where copied verses pass over others. */
export const omission = "...";

/**
 * Passages of one chapter as text to copy: what they are, then directly
 * beneath, their verses, numbered, each on a line of its own. Passages that
 * are apart stay apart: a line of three dots stands where verses were passed
 * over, and none of those verses is included.
 *
 * `verses` is the chapter's text: index 0 is verse 1.
 */
export function formatSelectionText(
  references: readonly ScriptureReference[],
  verses: readonly string[],
  translation: string,
): string {
  if (references.length === 0) return "";
  const passages = references.map((reference) =>
    referenceSpans(reference)
      .flatMap((span) => {
        const lines = [];
        for (let verse = span.from; verse <= Math.min(span.to, verses.length); verse++) {
          lines.push(`${verse} ${verses[verse - 1]}`);
        }
        return lines;
      })
      .join("\n"),
  );
  return `${formatReferences(references)} (${translation})\n${passages.join(`\n${omission}\n`)}`;
}
