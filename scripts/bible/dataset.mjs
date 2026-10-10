// Reads the committed King James dataset. Shared by the seeder and the builder.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const datasetName = "kjv";
export const datasetPath = fileURLToPath(new URL("../../data/bible/kjv.json", import.meta.url));

/** What a complete Protestant canon contains. Anything else is not loaded. */
export const expected = { books: 66, chapters: 1189, verses: 31102 };

/**
 * The checksum of the committed edition (see `checksum` below). Update it,
 * and data/bible/README.md, only when the text is deliberately replaced: a
 * test fails if the file and this value disagree.
 */
export const committedChecksum = "32cf22df7ea6458cae45f962c8044677bfcfdb604fb059c9fc5f0b977f56a165";

/** `books[book - 1][chapter - 1][verse - 1]` is the verse text. */
export function readDataset(path = datasetPath) {
  return JSON.parse(readFileSync(path, "utf8"));
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
