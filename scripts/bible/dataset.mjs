// Reads the committed King James dataset: the verses, and the titles of the
// Psalms. Shared by the seeder and the builder.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const datasetName = "kjv";
export const datasetPath = fileURLToPath(new URL("../../data/bible/kjv.json", import.meta.url));

/** The titles printed above verse 1 of many psalms. They are not verse text. */
export const titlesDatasetName = "kjv-psalm-titles";
export const titlesDatasetPath = fileURLToPath(
  new URL("../../data/bible/kjv-psalm-titles.json", import.meta.url),
);
/** Psalms is the nineteenth book, and has 150 psalms. */
export const psalmsBook = 19;
export const psalmCount = 150;

/** What a complete Protestant canon contains. Anything else is not loaded. */
export const expected = { books: 66, chapters: 1189, verses: 31102, psalmTitles: 116 };

/**
 * The checksum of the committed edition (see `checksum` below). Update it,
 * and data/bible/README.md, only when the text is deliberately replaced: a
 * test fails if the file and this value disagree.
 */
export const committedChecksum = "32cf22df7ea6458cae45f962c8044677bfcfdb604fb059c9fc5f0b977f56a165";

/** The checksum of the committed psalm titles (see `titlesChecksum` below). */
export const committedTitlesChecksum =
  "8356d05fc4b2db0f08c647de3290d7e33ef18b08c9a995cc6f3b48ca4ede713f";

/** `books[book - 1][chapter - 1][verse - 1]` is the verse text. */
export function readDataset(path = datasetPath) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** `titles[psalm]` is that psalm's title; a psalm without one is absent. */
export function readPsalmTitles(path = titlesDatasetPath) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** The titles as rows, in psalm order: `{ psalm, text }`. */
export function titleRows(titles) {
  return Object.entries(titles)
    .map(([psalm, text]) => ({ psalm: Number(psalm), text }))
    .sort((a, b) => a.psalm - b.psalm);
}

/** Identifies the titles themselves, whatever order or layout the file has. */
export function titlesChecksum(titles) {
  const rows = titleRows(titles).map(({ psalm, text }) => [psalm, text]);
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

export function countVerses(books) {
  return books.reduce(
    (total, chapters) => total + chapters.reduce((sum, verses) => sum + verses.length, 0),
    0,
  );
}

/**
 * Identifies the text itself, not the file's bytes, so a checkout that
 * rewrites line endings does not look like a new edition.
 */
export function checksum(books) {
  return createHash("sha256").update(JSON.stringify(books)).digest("hex");
}
