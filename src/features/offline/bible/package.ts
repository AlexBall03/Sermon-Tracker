import { psalmsBook } from "@/features/scripture/books";
import type { TranslationId } from "@/features/scripture/translations";
import { verseCounts } from "@/features/scripture/versification";

/*
 * A whole translation, as it is sent to a device to be read offline. Plain
 * values with no server or browser code: the route that sends it and the
 * browser that keeps it read the same definitions.
 *
 * A translation is sent in a few parts of whole books, so no answer is large
 * and an interrupted download goes on from the part it stopped in, not from
 * the beginning; and in parts, not chapter by chapter, so a whole Bible is a
 * handful of requests.
 */

/**
 * The committed text of each translation, by the checksums recorded in
 * `scripts/bible/dataset.mjs` (`datasets`). A device keeps a translation only
 * once what it received has these checksums, computed the same way:
 * SHA-256 of `JSON.stringify(books)` and of the titles as `[psalm, text]`
 * pairs in psalm order. A test fails if the two places disagree.
 */
export const committedEditions: Record<TranslationId, { text: string; titles: string }> = {
  kjv: {
    text: "32cf22df7ea6458cae45f962c8044677bfcfdb604fb059c9fc5f0b977f56a165",
    titles: "8356d05fc4b2db0f08c647de3290d7e33ef18b08c9a995cc6f3b48ca4ede713f",
  },
  rvg: {
    text: "31853733f2bf79164e2346a001f0cc273e508121706de07abaac83791830a745",
    titles: "c6af8842376c37907593f01028beecab37bd5efa74fbc478be6ddb8c98d15ca2",
  },
};

/** What an edition is stored and compared under. */
export const editionVersion = (edition: { text: string; titles: string }) =>
  `${edition.text.slice(0, 16)}.${edition.titles.slice(0, 16)}`;

export type PackageRange = { first: number; last: number };

/** About how many verses go in one part. */
const versesPerPart = 4000;

/** Whole books, in order, in parts of about `versesPerPart` verses. */
export const packageParts: readonly PackageRange[] = (() => {
  const parts: PackageRange[] = [];
  let first = 1;
  let verses = 0;
  verseCounts.forEach((chapters, index) => {
    verses += chapters.reduce((sum, count) => sum + count, 0);
    const book = index + 1;
    if (verses >= versesPerPart || book === verseCounts.length) {
      parts.push({ first, last: book });
      first = book + 1;
      verses = 0;
    }
  });
  return parts;
})();

/**
 * One part as it is sent: each book's chapters, each chapter's verses (index
 * 0 is verse 1), and the psalm titles of the part's psalms by psalm number.
 */
export type PackagePart = {
  translation: TranslationId;
  version: string;
  part: number;
  books: { book: number; chapters: string[][] }[];
  titles: Record<string, string>;
};

/**
 * The part, if it is exactly what it should be: the right translation and
 * part, every book of the part in order, every chapter with the verse count
 * the shared numbering gives it, every verse text, and titles only for
 * psalms that exist. Anything else is refused whole.
 */
export function validatePart(
  value: unknown,
  translation: TranslationId,
  part: number,
): PackagePart | null {
  const range = packageParts[part];
  if (!range || !value || typeof value !== "object") return null;
  const candidate = value as Partial<PackagePart>;
  if (candidate.translation !== translation || candidate.part !== part) return null;
  if (typeof candidate.version !== "string" || !Array.isArray(candidate.books)) return null;
  if (candidate.books.length !== range.last - range.first + 1) return null;

  for (let index = 0; index < candidate.books.length; index++) {
    const entry = candidate.books[index];
    const book = range.first + index;
    if (!entry || entry.book !== book || !Array.isArray(entry.chapters)) return null;
    const counts = verseCounts[book - 1];
    if (entry.chapters.length !== counts.length) return null;
    for (let chapter = 0; chapter < counts.length; chapter++) {
      const verses = entry.chapters[chapter];
      if (!Array.isArray(verses) || verses.length !== counts[chapter]) return null;
      if (!verses.every((verse) => typeof verse === "string" && verse.trim() !== "")) return null;
    }
  }

  const titles = candidate.titles;
  if (!titles || typeof titles !== "object" || Array.isArray(titles)) return null;
  const hasPsalms = range.first <= psalmsBook && psalmsBook <= range.last;
  for (const [psalm, text] of Object.entries(titles)) {
    const number = Number(psalm);
    if (!hasPsalms || !Number.isInteger(number) || number < 1) return null;
    if (number > verseCounts[psalmsBook - 1].length) return null;
    if (typeof text !== "string" || text.trim() === "") return null;
  }
  return candidate as PackagePart;
}
