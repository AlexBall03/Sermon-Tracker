// Rebuilds the committed King James dataset from eBible.org's USFM files.
// Developer tool only: nothing runs this during a build, a test, or `npm run dev`.
//
//   node scripts/bible/build-dataset.mjs <folder of unzipped eng-kjv2006_usfm>
//
// It writes data/bible/kjv.json, data/bible/kjv-psalm-titles.json, and
// src/features/scripture/versification.ts, then prints the counts and the
// checksums to record in data/bible/README.md.
// See that file for the source and for how the text is reduced.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { checksum, countVerses, expected, psalmsBook, titlesChecksum } from "./dataset.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));

/** Lines that are not verse text: titles, headings, and book metadata. */
const skipped = /^\\(?:id|h|toc\d|mt\d|s\d|ms\d?|r|cl)\b/;
/** A psalm's title: text that belongs to the chapter, printed above verse 1. */
const title = /^\\d\b\s*(.*)$/;
/** Paragraph and poetry markers; any text after one continues the verse. */
const layout = /^\\(?:p|q\d?|b|m|pi\d?|nb|li\d?)\b\s*/;

/** Verse text with every marker removed: no notes, Strong's numbers, or italics markup. */
function plain(text) {
  return (
    text
      .replace(/\\f\s.*?\\f\*/g, "")
      .replace(/[¶[\]]/g, "")
      .replace(/\|[^\\]*?(?=\\)/g, "")
      // The space after an opening marker belongs to the marker, so two marked
      // halves of one word ("who" + "soever") close up again.
      .replace(/\\\+?[a-z]+\d?\*/g, "")
      .replace(/\\\+?[a-z]+\d? ?/g, "")
      .replace(/\s+/g, " ")
      .replace(/ ([,.;:?!)])/g, "$1")
      .replace(/\( /g, "(")
      .trim()
  );
}

function parseBook(source) {
  const chapters = [];
  /** Chapter number to its title, where the chapter has one. */
  const titles = {};
  let verse = null;
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.replace(/^\uFEFF/, "").trim();
    if (!line || skipped.test(line)) continue;

    const chapter = /^\\c\s+(\d+)/.exec(line);
    if (chapter) {
      if (Number(chapter[1]) !== chapters.length + 1)
        throw new Error(`Chapter out of order: ${line}`);
      chapters.push([]);
      verse = null;
      continue;
    }

    const heading = title.exec(line);
    if (heading) {
      // A title stands before the first verse; anywhere else it would be verse text lost.
      if (chapters.length === 0 || chapters.at(-1).length > 0)
        throw new Error(`Title out of place: ${line.slice(0, 60)}`);
      titles[chapters.length] = [titles[chapters.length], heading[1]].filter(Boolean).join(" ");
      continue;
    }

    const start = /^\\v\s+(\d+)\s*(.*)$/.exec(line);
    if (start) {
      const verses = chapters.at(-1);
      if (Number(start[1]) !== verses.length + 1) throw new Error(`Verse out of order: ${line}`);
      verse = verses.length;
      verses.push(start[2]);
      continue;
    }

    const rest = line.replace(layout, "");
    if (rest === line && line.startsWith("\\"))
      throw new Error(`Unhandled marker: ${line.slice(0, 60)}`);
    if (rest && verse !== null) chapters.at(-1)[verse] += ` ${rest}`;
  }
  return {
    chapters: chapters.map((verses) => verses.map(plain)),
    titles: Object.fromEntries(
      Object.entries(titles).map(([chapter, text]) => [chapter, plain(text)]),
    ),
  };
}

const folder = process.argv[2];
if (!folder) {
  console.error("Usage: node scripts/bible/build-dataset.mjs <folder of USFM files>");
  process.exit(1);
}

// The files are numbered in canonical order: 02-GEN … 40-MAL, 70-MAT … 96-REV.
const files = readdirSync(folder)
  .filter((name) => name.endsWith(".usfm"))
  .sort();
const parsed = files.map((name) => parseBook(readFileSync(`${folder}/${name}`, "utf8")));
const books = parsed.map((book) => book.chapters);

// Only the Psalms have titles, and the edition has a known number of them.
const psalmTitles = parsed[psalmsBook - 1]?.titles ?? {};
if (parsed.some((book, index) => index !== psalmsBook - 1 && Object.keys(book.titles).length))
  throw new Error("A book other than Psalms has chapter titles.");
const titleCount = Object.keys(psalmTitles).length;
if (titleCount !== expected.psalmTitles || Object.values(psalmTitles).some((text) => !text))
  throw new Error(`Expected ${expected.psalmTitles} psalm titles, found ${titleCount}.`);

const empty = books.flat(2).filter((text) => !text).length;
if (empty) throw new Error(`${empty} verse(s) came out empty.`);

// One chapter per line keeps a future correction readable in a diff.
const json = `[\n${books
  .map((chapters) => `[\n${chapters.map((verses) => JSON.stringify(verses)).join(",\n")}\n]`)
  .join(",\n")}\n]\n`;
writeFileSync(`${root}data/bible/kjv.json`, json);

// One title per line, in psalm order, for the same reason.
writeFileSync(
  `${root}data/bible/kjv-psalm-titles.json`,
  `{\n${Object.entries(psalmTitles)
    .map(([psalm, text]) => `${JSON.stringify(psalm)}: ${JSON.stringify(text)}`)
    .join(",\n")}\n}\n`,
);

const counts = books.map(
  (chapters) => `  [${chapters.map((verses) => verses.length).join(", ")}],`,
);
writeFileSync(
  `${root}src/features/scripture/versification.ts`,
  `// Generated by scripts/bible/build-dataset.mjs from data/bible/kjv.json. Do not edit.

/** Verses in each chapter of each book of the King James Bible, in canonical order. */
// prettier-ignore
export const verseCounts: readonly (readonly number[])[] = [
${counts.join("\n")}
];
`,
);

console.log(`Books:    ${books.length}`);
console.log(`Chapters: ${books.reduce((total, chapters) => total + chapters.length, 0)}`);
console.log(`Verses:   ${countVerses(books)}`);
console.log(`Checksum: ${checksum(books)}`);
console.log(`Psalm titles:          ${titleCount}`);
console.log(`Psalm titles checksum: ${titlesChecksum(psalmTitles)}`);
