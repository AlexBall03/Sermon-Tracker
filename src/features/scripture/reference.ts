import { z } from "zod";

import { bibleBooks, chaptersIn, findBook, getBook, versesIn } from "./books";

/**
 * A passage, as numbers. This is the one shape used by the database, the
 * server actions, and every Scripture component.
 *
 *   John 3          { book: 43, chapterStart: 3 }
 *   John 3:16       { …, verseStart: 16 }
 *   John 3:16-18    { …, verseStart: 16, verseEnd: 18 }
 *   Genesis 1-2     { book: 1, chapterStart: 1, chapterEnd: 2 }
 *   John 3:16-4:2   { …, verseStart: 16, chapterEnd: 4, verseEnd: 2 }
 *
 * Absent parts are null. `chapterEnd` is set only when the passage leaves its
 * first chapter, and `verseEnd` only when it covers more than one verse.
 */
export type ScriptureReference = {
  book: number;
  chapterStart: number;
  verseStart: number | null;
  chapterEnd: number | null;
  verseEnd: number | null;
};

/** Why a reference does not exist in the King James Bible, or null when it does. */
export function checkReference(reference: ScriptureReference): string | null {
  const { book, chapterStart, verseStart, chapterEnd, verseEnd } = reference;
  const name = getBook(book)?.name;
  if (!name) return "That is not a book of the Bible.";

  const chapters = chaptersIn(book);
  const lastChapter = chapterEnd ?? chapterStart;
  for (const chapter of [chapterStart, lastChapter]) {
    if (!Number.isInteger(chapter) || chapter < 1 || chapter > chapters) {
      return chapters === 1
        ? `${name} has one chapter.`
        : `${name} has ${chapters} chapters; there is no chapter ${chapter}.`;
    }
  }
  if (chapterEnd !== null && chapterEnd <= chapterStart) return "A range must end after it starts.";
  if (verseEnd !== null && verseStart === null) return "A range needs a starting verse.";
  if (chapterEnd !== null && (verseStart === null) !== (verseEnd === null)) {
    return "Give a verse at both ends of the range, or at neither.";
  }

  const outOfRange = (chapter: number, verse: number | null) => {
    if (verse === null) return null;
    const verses = versesIn(book, chapter);
    if (Number.isInteger(verse) && verse >= 1 && verse <= verses) return null;
    return `${chapters === 1 ? name : `${displayName(book)} ${chapter}`} has ${verses} verses; there is no verse ${verse}.`;
  };
  const problem = outOfRange(chapterStart, verseStart) ?? outOfRange(lastChapter, verseEnd);
  if (problem) return problem;
  if (chapterEnd === null && verseEnd !== null && verseStart !== null && verseEnd <= verseStart) {
    return "A range must end after it starts.";
  }
  return null;
}

const part = z.number().int().min(1).max(200).nullable();

/** The fields of a reference, for schemas that add their own beside them. */
export const referenceShape = {
  book: z.number().int().min(1).max(bibleBooks.length),
  chapterStart: z.number().int().min(1).max(200),
  verseStart: part,
  chapterEnd: part,
  verseEnd: part,
};

/** Reports a reference that the King James Bible does not contain. */
export function refineReference(reference: ScriptureReference, context: z.RefinementCtx) {
  const problem = checkReference(reference);
  if (problem) context.addIssue({ code: "custom", message: problem });
}

/** Validates a reference against the real chapter and verse counts. */
export const scriptureReferenceSchema = z.object(referenceShape).superRefine(refineReference);

/** "Psalm 23", not "Psalms 23": one psalm is singular. */
function displayName(book: number) {
  return book === 19 ? "Psalm" : (getBook(book)?.name ?? "");
}

/** The reference as it is written: "John 3:16–18", "Genesis 1–2", "Jude 5". */
export function formatReference(reference: ScriptureReference): string {
  const { book, chapterStart, verseStart, chapterEnd, verseEnd } = reference;
  const single = chaptersIn(book) === 1;
  if (single) {
    const name = getBook(book)?.name ?? "";
    if (verseStart === null) return name;
    return `${name} ${verseStart}${verseEnd === null ? "" : `–${verseEnd}`}`;
  }
  const name = chapterEnd !== null && book === 19 ? (getBook(book)?.name ?? "") : displayName(book);
  let text = `${name} ${chapterStart}`;
  if (verseStart !== null) text += `:${verseStart}`;
  if (chapterEnd !== null) text += `–${chapterEnd}${verseEnd === null ? "" : `:${verseEnd}`}`;
  else if (verseEnd !== null) text += `–${verseEnd}`;
  return text;
}

export type ParsedReference =
  { ok: true; reference: ScriptureReference } | { ok: false; message: string };

const numbers = /^(\d+)(?:[:.](\d+))?(?:-(\d+)(?:[:.](\d+))?)?$/;

/**
 * Reads a typed reference: "John 3:16", "Romans 12:1-2", "Psalm 23",
 * "1 Cor 13:4–7", "Gen 1-2", "John 3:16-4:2", "Jude 5". The result is checked
 * against the King James Bible, so a verse that does not exist is refused.
 */
export function parseReference(input: string): ParsedReference {
  const text = input
    .trim()
    .replace(/[‐-―]/g, "-")
    .replace(/\s*-\s*/g, "-")
    .replace(/\s*:\s*/g, ":")
    .replace(/\s+/g, " ");
  if (!text) return { ok: false, message: "Type a reference, such as John 3:16." };

  // The book is everything before the last run of numbers.
  const split = /^(.*?[a-z.]) ?(\d[\d:.-]*)?$/i.exec(text);
  const book = split ? findBook(split[1]) : undefined;
  if (!split || !book) {
    return { ok: false, message: "That book was not recognised. Try John 3:16 or Psalm 23." };
  }

  const single = chaptersIn(book.id) === 1;
  if (!split[2]) {
    if (!single) return { ok: false, message: `Add a chapter, such as ${book.name} 1.` };
    return finish({
      book: book.id,
      chapterStart: 1,
      verseStart: null,
      chapterEnd: null,
      verseEnd: null,
    });
  }

  const match = numbers.exec(split[2]);
  if (!match) {
    return { ok: false, message: "That reference could not be read. Try John 3:16–18." };
  }
  const [a, b, c, d] = match.slice(1).map((value) => (value ? Number(value) : null));

  // In a one-chapter book a lone number is a verse: "Jude 5" is Jude 1:5.
  if (single && b === null && d === null) {
    return finish({ book: book.id, chapterStart: 1, verseStart: a, chapterEnd: null, verseEnd: c });
  }

  let reference: ScriptureReference;
  if (b === null) {
    // "3", "3-4", or "3-4:2" (which has no starting verse, and is refused below).
    reference = { book: book.id, chapterStart: a!, verseStart: null, chapterEnd: c, verseEnd: d };
  } else if (d === null) {
    // "3:16" or "3:16-18".
    reference = { book: book.id, chapterStart: a!, verseStart: b, chapterEnd: null, verseEnd: c };
  } else {
    // "3:16-4:2".
    reference = { book: book.id, chapterStart: a!, verseStart: b, chapterEnd: c, verseEnd: d };
  }
  return finish(reference);
}

function finish(reference: ScriptureReference): ParsedReference {
  const tidy = normaliseReference(reference);
  const problem = checkReference(tidy);
  return problem ? { ok: false, message: problem } : { ok: true, reference: tidy };
}

/** Removes an end that only repeats the start, so equal passages compare equal. */
export function normaliseReference(reference: ScriptureReference): ScriptureReference {
  let { chapterEnd, verseEnd } = reference;
  const { book, chapterStart, verseStart } = reference;
  if (chapterEnd === chapterStart) chapterEnd = null;
  if (chapterEnd === null && verseEnd === verseStart) verseEnd = null;
  return { book, chapterStart, verseStart: verseStart ?? null, chapterEnd, verseEnd };
}

/** A stable string for a passage, for React keys and for spotting duplicates. */
export function referenceKey(reference: ScriptureReference): string {
  const { book, chapterStart, verseStart, chapterEnd, verseEnd } = reference;
  return [book, chapterStart, verseStart ?? 0, chapterEnd ?? 0, verseEnd ?? 0].join(".");
}

export type ChapterSpan = {
  book: number;
  chapter: number;
  /** First and last verse of the passage within this chapter. */
  from: number;
  to: number;
};

/** The chapters a passage touches, with the verses it covers in each. */
export function referenceSpans(reference: ScriptureReference): ChapterSpan[] {
  const { book, chapterStart, verseStart, chapterEnd, verseEnd } = reference;
  const last = chapterEnd ?? chapterStart;
  const spans: ChapterSpan[] = [];
  for (let chapter = chapterStart; chapter <= last; chapter++) {
    const verses = versesIn(book, chapter);
    const from = chapter === chapterStart ? (verseStart ?? 1) : 1;
    let to = verses;
    if (chapter === last && verseStart !== null)
      to = verseEnd ?? (chapterEnd === null ? verseStart : verses);
    spans.push({ book, chapter, from, to });
  }
  return spans;
}

/** How many verses a passage covers. */
export function countReferenceVerses(reference: ScriptureReference): number {
  return referenceSpans(reference).reduce((total, span) => total + span.to - span.from + 1, 0);
}

/**
 * Verses picked one by one in a chapter, as references: each unbroken run is
 * one passage, so verses 1, 2, 3 and 7 become "1–3" and "7". No verses at all
 * means the whole chapter.
 */
export function versesToReferences(
  book: number,
  chapter: number,
  verses: readonly number[],
): ScriptureReference[] {
  const whole = { book, chapterStart: chapter, verseStart: null, chapterEnd: null, verseEnd: null };
  const sorted = [...new Set(verses)].sort((a, b) => a - b);
  if (sorted.length === 0) return [whole];

  const references: ScriptureReference[] = [];
  let start = sorted[0];
  let previous = start;
  for (const verse of [...sorted.slice(1), Infinity]) {
    if (verse === previous + 1) {
      previous = verse;
      continue;
    }
    references.push({ ...whole, verseStart: start, verseEnd: previous > start ? previous : null });
    start = previous = verse;
  }
  return references;
}

/** Several passages on one line: "Genesis 1:1–4, 7, 9–10", or "John 3:16; Psalm 23". */
export function formatReferences(references: readonly ScriptureReference[]): string {
  const [first, ...rest] = references;
  if (!first) return "";
  const sameChapter = references.every(
    (reference) =>
      reference.book === first.book &&
      reference.chapterStart === first.chapterStart &&
      reference.chapterEnd === null &&
      reference.verseStart !== null,
  );
  if (!sameChapter) return references.map(formatReference).join("; ");
  const verses = rest.map(
    ({ verseStart, verseEnd }) => `${verseStart}${verseEnd === null ? "" : `–${verseEnd}`}`,
  );
  return [formatReference(first), ...verses].join(", ");
}
