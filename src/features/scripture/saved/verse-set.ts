import { dictionary } from "@/i18n";
import { defaultLocale, type Locale } from "@/i18n/locales";
import { chapterBookName, chaptersIn, getBook, versesIn } from "../books";
import {
  parseReference,
  referenceSpans,
  versesToReferences,
  type ScriptureReference,
} from "../reference";

/**
 * One verse, as numbers. A saved passage is a set of these: any verses at
 * all, in one chapter or several, next to one another or apart. A psalm's
 * title is not a verse and can never be one of them.
 */
export type VerseRef = { book: number; chapter: number; verse: number };

/** A stable string for a verse: "43.3.16". */
export const verseKey = ({ book, chapter, verse }: VerseRef) => `${book}.${chapter}.${verse}`;

/** True for a verse the Bible has. */
export function verseExists({ book, chapter, verse }: VerseRef) {
  return Number.isInteger(verse) && verse >= 1 && verse <= versesIn(book, chapter);
}

function compareVerses(a: VerseRef, b: VerseRef) {
  return a.book - b.book || a.chapter - b.chapter || a.verse - b.verse;
}

/**
 * Verses as a saved passage holds them: in the Bible's order, each once, and
 * only those that exist. Two selections of the same verses, however they were
 * made, come out the same.
 */
export function normaliseVerses(verses: readonly VerseRef[]): VerseRef[] {
  const seen = new Set<string>();
  const tidy: VerseRef[] = [];
  for (const { book, chapter, verse } of verses) {
    const item = { book, chapter, verse };
    const key = verseKey(item);
    if (seen.has(key) || !verseExists(item)) continue;
    seen.add(key);
    tidy.push(item);
  }
  return tidy.sort(compareVerses);
}

/** What makes a set of verses itself. Equal sets have equal keys, and no others do. */
export function canonicalKey(verses: readonly VerseRef[]): string {
  return normaliseVerses(verses).map(verseKey).join(",");
}

/** True when two lists hold the same verses, in any order. */
export function sameVerses(a: readonly VerseRef[], b: readonly VerseRef[]) {
  return canonicalKey(a) === canonicalKey(b);
}

/** Every verse the references cover. A reference to a chapter is all of its verses. */
export function referencesToVerses(references: readonly ScriptureReference[]): VerseRef[] {
  const verses: VerseRef[] = [];
  for (const reference of references) {
    for (const span of referenceSpans(reference)) {
      for (let verse = span.from; verse <= span.to; verse++) {
        verses.push({ book: span.book, chapter: span.chapter, verse });
      }
    }
  }
  return normaliseVerses(verses);
}

/** The set, chapter by chapter, in order. */
function byChapter(verses: readonly VerseRef[]) {
  const chapters: { book: number; chapter: number; verses: number[] }[] = [];
  for (const { book, chapter, verse } of normaliseVerses(verses)) {
    const last = chapters.at(-1);
    if (last && last.book === book && last.chapter === chapter) last.verses.push(verse);
    else chapters.push({ book, chapter, verses: [verse] });
  }
  return chapters;
}

/** The set as references: one for each unbroken run of verses within a chapter. */
export function versesToRuns(verses: readonly VerseRef[]): ScriptureReference[] {
  return byChapter(verses).flatMap((group) =>
    versesToReferences(group.book, group.chapter, group.verses),
  );
}

/** "16–18, 21": the runs of one chapter's verses. */
function runsText(book: number, chapter: number, verses: number[]) {
  return versesToReferences(book, chapter, verses)
    .map(({ verseStart, verseEnd }) => `${verseStart}${verseEnd === null ? "" : `–${verseEnd}`}`)
    .join(", ");
}

/**
 * The set as it is written: "John 3:16", "Psalm 23:1–6", "Romans 3:10, 23;
 * 6:23", "John 3:16; Romans 6:23", "Jude 5, 7". The book is named once, and
 * each chapter once within it, in `language`.
 */
export function formatVerseSet(
  verses: readonly VerseRef[],
  language: Locale = defaultLocale,
): string {
  const books: { book: number; chapters: { chapter: number; verses: number[] }[] }[] = [];
  for (const group of byChapter(verses)) {
    const last = books.at(-1);
    if (last && last.book === group.book) last.chapters.push(group);
    else books.push({ book: group.book, chapters: [group] });
  }
  return books
    .map(({ book, chapters }) => {
      const name = getBook(book, language)?.name ?? "";
      if (chaptersIn(book) === 1) return `${name} ${runsText(book, 1, chapters[0].verses)}`;
      // One psalm is "Psalm 23"; several are from the "Psalms".
      const shown = chapters.length === 1 ? chapterBookName(book, language) : name;
      const parts = chapters.map(
        ({ chapter, verses: list }) => `${chapter}:${runsText(book, chapter, list)}`,
      );
      return `${shown} ${parts.join("; ")}`;
    })
    .join("; ");
}

export type ParsedVerseSet = { ok: true; verses: VerseRef[] } | { ok: false; message: string };

/**
 * Reads a passage as it is typed, in the same form `formatVerseSet` writes:
 * "John 3:16", "Psalm 23", "Romans 3:10, 23; 6:23", "John 3:16-18; Romans
 * 6:23". A part that names no book belongs to the book before it, and a bare
 * number after a comma to the chapter before it. Every verse is checked
 * against the Bible, and what is wrong is said in `locale`.
 */
export function parseVerseSet(input: string, locale: Locale = defaultLocale): ParsedVerseSet {
  const references: ScriptureReference[] = [];
  // The passage before, which a part that names less than a whole reference is read from.
  let before: ScriptureReference | null = null;

  for (const group of input.split(/[;\n]/)) {
    for (const [index, piece] of group.split(",").entries()) {
      const part = piece.trim();
      if (!part) continue;
      let typed = part;
      if (before && !/\p{L}/u.test(part)) {
        const name = getBook(before.book)?.name ?? "";
        const chapter = before.chapterEnd ?? before.chapterStart;
        // After a comma, a number alone is a verse of the chapter before: "3:10, 23".
        // Anywhere else it is read in the book before: "6:23", or a chapter.
        const verseOfChapter =
          index > 0 &&
          before.verseStart !== null &&
          chaptersIn(before.book) > 1 &&
          /^\d+(\s*[-–—]\s*\d+)?$/.test(part);
        typed = verseOfChapter ? `${name} ${chapter}:${part}` : `${name} ${part}`;
      }
      const read = parseReference(typed, locale);
      if (!read.ok) return read;
      references.push(read.reference);
      before = read.reference;
    }
  }
  if (references.length === 0) {
    return { ok: false, message: dictionary(locale, "scripture").reference.emptyPassage };
  }
  return { ok: true, verses: referencesToVerses(references) };
}

/** The verses of the set that are in one chapter, in order. */
export function versesInChapter(verses: readonly VerseRef[], book: number, chapter: number) {
  return verses
    .filter((item) => item.book === book && item.chapter === chapter)
    .map((item) => item.verse);
}
