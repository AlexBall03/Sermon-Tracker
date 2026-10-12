// Reads the committed Bible datasets: for each translation, the verses and the
// titles of the Psalms. Shared by the seeder and the builders.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const file = (name) => fileURLToPath(new URL(`../../data/bible/${name}`, import.meta.url));

export const datasetName = "kjv";
export const datasetPath = file("kjv.json");

/** The titles printed above verse 1 of many psalms. They are not verse text. */
export const titlesDatasetName = "kjv-psalm-titles";
export const titlesDatasetPath = file("kjv-psalm-titles.json");
/** Psalms is the nineteenth book, and has 150 psalms. */
export const psalmsBook = 19;
export const psalmCount = 150;

/**
 * What a complete Protestant canon contains. Anything else is not loaded.
 * `psalmTitles` is the King James count; each translation has its own in `datasets`.
 */
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

/**
 * The publisher's file the Reina-Valera Gómez dataset is built from (see
 * data/bible/README.md). scripts/bible/build-rvg.mjs refuses any other.
 */
export const rvgSource = {
  url: "https://www.reinavaleragomez.com/audio/RVG23-RLI-20251028.txt.zip",
  file: "RVG23-RLI-20251028.txt",
  archiveSha256: "4f365c9fc5cb2a974926a18c8b68af99dd69547fa16ccbebe558570489654cfd",
  textSha256: "d6639ef05239fb51f432ca68a4a82182b8a0bd57cb300d360ca4d9d953f3ccc4",
};

/**
 * Every translation the application holds, by the ID its rows are stored
 * under. `name` and `titlesName` are what `reference_datasets` records the
 * loaded edition as. The checksums are of the committed files: update one,
 * and data/bible/README.md, only when that text is deliberately replaced.
 */
export const datasets = {
  kjv: {
    id: "kjv",
    label: "King James Bible",
    name: "scripture-kjv",
    titlesName: "scripture-kjv-psalm-titles",
    path: datasetPath,
    titlesPath: titlesDatasetPath,
    checksum: committedChecksum,
    titlesChecksum: committedTitlesChecksum,
    psalmTitles: expected.psalmTitles,
  },
  rvg: {
    id: "rvg",
    label: "Reina-Valera Gómez",
    name: "scripture-rvg",
    titlesName: "scripture-rvg-psalm-titles",
    path: file("rvg.json"),
    titlesPath: file("rvg-psalm-titles.json"),
    checksum: "31853733f2bf79164e2346a001f0cc273e508121706de07abaac83791830a745",
    titlesChecksum: "c6af8842376c37907593f01028beecab37bd5efa74fbc478be6ddb8c98d15ca2",
    psalmTitles: 123,
  },
};

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
