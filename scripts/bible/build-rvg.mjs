// Rebuilds the committed Reina-Valera Gómez dataset from the publisher's own
// text file. Developer tool only: nothing runs this during a build, a test, or
// `npm run dev`.
//
//   node scripts/bible/build-rvg.mjs <RVG23-RLI-20251028.txt.zip or the .txt inside it>
//   node scripts/bible/build-rvg.mjs <the same> --verify <eBible sparvg_vpl.txt>
//
// It writes data/bible/rvg.json and data/bible/rvg-psalm-titles.json, then
// prints the counts and the checksums to record in data/bible/README.md.
// With --verify it writes nothing and compares the file, verse by verse, with
// an independent copy that carries references.
// See data/bible/README.md for the source and for how the text is reduced.
//
// The publisher's file is 31,102 lines, one verse to a line, with no
// references: a line's place in the file is the only thing that says which
// verse it is. So the file is laid over the verse counts of the King James
// dataset, which the Reina-Valera Gómez follows, and the fit is proved by the
// anchors below before anything is written.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

import {
  checksum,
  countVerses,
  datasets,
  expected,
  psalmsBook,
  readDataset,
  rvgSource,
  titlesChecksum,
} from "./dataset.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const sha256 = (data) => createHash("sha256").update(data).digest("hex");

class Refusal extends Error {}

/** The one text file inside the publisher's archive, checked against the recorded hashes. */
function readSource(path) {
  const file = readFileSync(path);
  let text = file;
  if (file.readUInt32LE(0) === 0x04034b50) {
    if (sha256(file) !== rvgSource.archiveSha256) {
      throw new Refusal(`The archive is not the recorded one (SHA-256 ${sha256(file)}).`);
    }
    // The first entry of the central directory; the other is a macOS resource fork.
    const end = file.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    const entry = file.readUInt32LE(end + 16);
    const name = file.subarray(entry + 46, entry + 46 + file.readUInt16LE(entry + 28)).toString();
    if (name !== rvgSource.file) throw new Refusal(`Unexpected file in the archive: ${name}`);
    const size = file.readUInt32LE(entry + 20);
    const local = file.readUInt32LE(entry + 42);
    const start = local + 30 + file.readUInt16LE(local + 26) + file.readUInt16LE(local + 28);
    text = inflateRawSync(file.subarray(start, start + size));
  }
  if (sha256(text) !== rvgSource.textSha256) {
    throw new Refusal(`The text is not the recorded one (SHA-256 ${sha256(text)}).`);
  }
  return text.toString("utf8");
}

/**
 * Verse text with the file's marking removed and every word kept: `[ ]` marks
 * words supplied by the translators and `< >` the words of Christ. Runs of
 * spaces become one, and a letter written as two code points becomes one.
 */
function plain(text) {
  return text
    .normalize("NFC")
    .replace(/[[\]<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** A psalm's title, which the file writes inside « » at the head of verse 1. */
const titled = /^\s*«([^»]*)»\s*(.*)$/;
/** The Hebrew letter that heads each eight verses of Psalm 119. A heading, not verse text. */
const lettered = /^\s*[A-ZÁÉÍÓÚÑ]+\.\s*/;

/** The start of each book's first verse, as reduced, and a few verses where a slip would show. */
// prettier-ignore
const openings = [
  "En el principio creó Dios", "Estos son los nombres", "Y Jehová llamó a Moisés",
  "Y Jehová habló a Moisés en el desierto", "Estas son las palabras que habló Moisés",
  "Y aconteció después de la muerte de Moisés", "Y aconteció después de la muerte de Josué",
  "Y aconteció en los días que gobernaban", "Hubo un varón de Ramataim",
  "Y aconteció después de la muerte de Saúl", "Cuando el rey David era viejo",
  "Después de la muerte de Acab", "Adán, Set, Enós,", "Y Salomón, hijo de David",
  "En el primer año de Ciro", "Las palabras de Nehemías", "Y aconteció en los días de Asuero",
  "Hubo un varón en la tierra de Uz", "Bienaventurado el hombre", "Los proverbios de Salomón",
  "Palabras del Predicador", "El cantar de los cantares", "La visión de Isaías",
  "Las palabras de Jeremías", "¡Cómo está sentada sola", "Y aconteció en el año treinta",
  "En el año tercero del reinado de Joacim", "La palabra de Jehová que vino a Oseas",
  "La palabra de Jehová que vino a Joel", "Las palabras de Amós", "La visión de Abdías",
  "Y la palabra de Jehová vino a Jonás", "La palabra de Jehová que vino a Miqueas",
  "La carga de Nínive", "La carga que vio el profeta Habacuc",
  "La palabra de Jehová que vino a Sofonías", "En el año segundo del rey Darío",
  "En el mes octavo, en el año segundo de Darío", "La carga de la palabra de Jehová a Israel",
  "El libro de la generación de Jesucristo", "Principio del evangelio de Jesucristo",
  "Puesto que ya muchos", "En el principio era el Verbo", "En el primer tratado, oh Teófilo",
  "Pablo, siervo de Jesucristo, llamado a ser", "Pablo, llamado a ser apóstol",
  "Pablo, apóstol de Jesucristo por la voluntad", "Pablo, apóstol (no de hombres",
  "Pablo, apóstol de Jesucristo por la voluntad", "Pablo y Timoteo, siervos de Jesucristo",
  "Pablo, apóstol de Jesucristo por la voluntad", "Pablo, y Silvano, y Timoteo",
  "Pablo, y Silvano, y Timoteo", "Pablo, apóstol de Jesucristo por mandato",
  "Pablo, apóstol de Jesucristo por la voluntad", "Pablo, siervo de Dios",
  "Pablo, prisionero de Jesucristo", "Dios, habiendo hablado muchas veces",
  "Jacobo, siervo de Dios", "Pedro, apóstol de Jesucristo", "Simón Pedro, siervo y apóstol",
  "Lo que era desde el principio", "El anciano a la señora elegida",
  "El anciano al muy amado Gayo", "Judas, siervo de Jesucristo", "La revelación de Jesucristo",
];
// prettier-ignore
const anchors = [
  [1, 50, 26, "Y murió José"], [19, 3, 1, "¡Oh Jehová, cuánto se han multiplicado"],
  [19, 23, 1, "Jehová es mi pastor"], [19, 119, 1, "Bienaventurados los perfectos de camino"],
  [19, 119, 73, "Tus manos me hicieron"], [19, 150, 6, "Todo lo que respira alabe a Jehová"],
  [39, 4, 6, "Él convertirá el corazón de los padres"], [43, 3, 16, "Porque de tal manera amó Dios al mundo"],
  [44, 8, 37, "Y Felipe dijo: Si crees de todo corazón"], [62, 5, 7, "Porque tres son los que dan testimonio en el cielo"],
  [64, 1, 14, "porque espero verte en breve"], [66, 12, 17, "Entonces el dragón se enfureció"],
  [66, 13, 1, "Y me paré sobre la arena del mar"],
  [66, 22, 21, "La gracia de nuestro Señor Jesucristo sea con todos vosotros. Amén."],
];

/** The publisher's lines as `books[book - 1][chapter - 1][verse - 1]`, with the psalm titles apart. */
function parse(source) {
  const lines = source.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  if (lines.length !== expected.verses || lines.some((line) => !line.trim())) {
    throw new Refusal(`Expected ${expected.verses} verses, one to a line; found ${lines.length}.`);
  }
  for (const [open, close] of ["[]", "<>", "«»"]) {
    const uneven = lines.findIndex((line) => {
      let depth = 0;
      for (const character of line) {
        if (character === open) depth += 1;
        if (character === close) depth -= 1;
        if (depth < 0 || depth > 1) return true;
      }
      return depth !== 0;
    });
    if (uneven !== -1) throw new Refusal(`Unbalanced ${open}${close} on line ${uneven + 1}.`);
  }

  const titles = {};
  let letters = 0;
  let line = 0;
  // The King James verse counts say where each line belongs.
  const books = readDataset().map((chapters, bookIndex) =>
    chapters.map((verses, chapterIndex) =>
      verses.map((_, verseIndex) => {
        let text = lines[line++];
        const place = `${bookIndex + 1}.${chapterIndex + 1}.${verseIndex + 1}`;
        const heading = titled.exec(text);
        if (heading) {
          // A title stands before a psalm's first verse; anywhere else it would be verse text lost.
          if (bookIndex + 1 !== psalmsBook || verseIndex !== 0) {
            throw new Refusal(`A title out of place at ${place}.`);
          }
          titles[chapterIndex + 1] = plain(heading[1]);
          text = heading[2];
        } else if (/[«»]/.test(text)) {
          throw new Refusal(`Unexpected « » at ${place}.`);
        }
        if (bookIndex + 1 === psalmsBook && chapterIndex + 1 === 119 && verseIndex % 8 === 0) {
          if (!lettered.test(text)) throw new Refusal(`No letter heading at ${place}.`);
          text = text.replace(lettered, "");
          letters += 1;
        }
        return plain(text);
      }),
    ),
  );
  if (letters !== 22)
    throw new Refusal(`Expected 22 letter headings in Psalm 119, found ${letters}.`);

  const all = books.flat(2);
  if (all.some((text) => !text)) throw new Refusal("A verse came out empty.");
  if ([...all, ...Object.values(titles)].some((text) => /[[\]<>«»]/.test(text))) {
    throw new Refusal("Marking was left in the text.");
  }
  openings.forEach((opening, index) => {
    if (!books[index][0][0].startsWith(opening)) {
      throw new Refusal(`Book ${index + 1} does not open as expected: ${books[index][0][0]}`);
    }
  });
  for (const [book, chapter, verse, opening] of anchors) {
    if (!books[book - 1][chapter - 1][verse - 1].startsWith(opening)) {
      throw new Refusal(`${book}.${chapter}.${verse} is not where it should be.`);
    }
  }
  const titleCount = Object.keys(titles).length;
  if (titleCount !== datasets.rvg.psalmTitles || Object.values(titles).some((text) => !text)) {
    throw new Refusal(`Expected ${datasets.rvg.psalmTitles} psalm titles, found ${titleCount}.`);
  }
  return { books, titles, lines };
}

// The books in canonical order, as eBible.org's verse-per-line export names them.
// prettier-ignore
const codes = [
  "GEN", "EXO", "LEV", "NUM", "DEU", "JOS", "JDG", "RUT", "1SA", "2SA", "1KI", "2KI", "1CH", "2CH",
  "EZR", "NEH", "EST", "JOB", "PSA", "PRO", "ECC", "SOL", "ISA", "JER", "LAM", "EZE", "DAN", "HOS",
  "JOE", "AMO", "OBA", "JON", "MIC", "NAH", "HAB", "ZEP", "HAG", "ZEC", "MAL", "MAT", "MAR", "LUK",
  "JOH", "ACT", "ROM", "1CO", "2CO", "GAL", "EPH", "PHI", "COL", "1TH", "2TH", "1TI", "2TI", "TIT",
  "PHM", "HEB", "JAM", "1PE", "2PE", "1JO", "2JO", "3JO", "JUD", "REV",
];

/**
 * Compares the publisher's file with a copy that carries references. Both are
 * read as words alone (no marking, punctuation spacing, or case of layout), so
 * what is counted is wording.
 */
function verify(books, path) {
  const words = (text) => plain(text.replace(/[«»]/g, " ")).replace(/ ([,.;:?!)])/g, "$1");
  const theirs = new Map();
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = /^(\w{3}) (\d+):(\d+) (.*)$/.exec(raw.replace(/^﻿/, ""));
    if (!match) continue;
    const book = codes.indexOf(match[1]) + 1;
    if (book) theirs.set(`${book}.${match[2]}.${match[3]}`, words(match[4]));
  }
  let same = 0;
  let missing = 0;
  const different = [];
  books.forEach((chapters, bookIndex) =>
    chapters.forEach((verses, chapterIndex) =>
      verses.forEach((text, verseIndex) => {
        const place = `${bookIndex + 1}.${chapterIndex + 1}.${verseIndex + 1}`;
        const other = theirs.get(place);
        if (other === undefined) missing += 1;
        else if (other === words(text) || other.endsWith(words(text))) same += 1;
        else different.push([place, text, other]);
      }),
    ),
  );
  console.log(`Their verses:  ${theirs.size}`);
  console.log(`Same wording:  ${same}`);
  console.log(`Different:     ${different.length}`);
  console.log(`Not in theirs: ${missing}`);
  for (const [place, ours, other] of different.slice(0, 40)) {
    console.log(`\n${place}\n  publisher: ${ours}\n  other:     ${other}`);
  }
}

const [path, flag, other] = process.argv.slice(2);
if (!path || (flag && (flag !== "--verify" || !other))) {
  console.error("Usage: node scripts/bible/build-rvg.mjs <zip or txt> [--verify <sparvg_vpl.txt>]");
  process.exit(1);
}

try {
  const { books, titles } = parse(readSource(path));
  if (flag) {
    verify(books, other);
  } else {
    // One chapter per line keeps a future correction readable in a diff.
    writeFileSync(
      datasets.rvg.path,
      `[\n${books
        .map((chapters) => `[\n${chapters.map((verses) => JSON.stringify(verses)).join(",\n")}\n]`)
        .join(",\n")}\n]\n`,
    );
    writeFileSync(
      datasets.rvg.titlesPath,
      `{\n${Object.entries(titles)
        .map(([psalm, text]) => `${JSON.stringify(psalm)}: ${JSON.stringify(text)}`)
        .join(",\n")}\n}\n`,
    );
    console.log(`Wrote ${datasets.rvg.path.slice(root.length)}`);
  }
  console.log(`Books:    ${books.length}`);
  console.log(`Chapters: ${books.reduce((total, chapters) => total + chapters.length, 0)}`);
  console.log(`Verses:   ${countVerses(books)}`);
  console.log(`Checksum: ${checksum(books)}`);
  console.log(`Psalm titles:          ${Object.keys(titles).length}`);
  console.log(`Psalm titles checksum: ${titlesChecksum(titles)}`);
} catch (error) {
  if (!(error instanceof Refusal)) throw error;
  console.error(`\nRefused: ${error.message}\nNothing was written.\n`);
  process.exit(1);
}
