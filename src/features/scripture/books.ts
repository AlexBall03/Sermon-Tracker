import { verseCounts } from "./versification";

export type BibleBook = {
  /** 1 to 66, in canonical order. This is what the database stores. */
  id: number;
  name: string;
  /** Shown in tight spaces, such as the book picker. */
  short: string;
  /** Other spellings accepted when a reference is typed. */
  aliases: readonly string[];
};

// prettier-ignore
const table: readonly (readonly [name: string, short: string, ...aliases: string[]])[] = [
  ["Genesis", "Gen", "gn"], ["Exodus", "Exod", "ex"], ["Leviticus", "Lev", "lv"],
  ["Numbers", "Num", "nm", "nb"], ["Deuteronomy", "Deut", "dt"], ["Joshua", "Josh", "jos"],
  ["Judges", "Judg", "jdg", "jg"], ["Ruth", "Ruth", "rth", "ru"], ["1 Samuel", "1 Sam", "1sm", "1sa"],
  ["2 Samuel", "2 Sam", "2sm", "2sa"], ["1 Kings", "1 Kgs", "1ki", "1kg"], ["2 Kings", "2 Kgs", "2ki", "2kg"],
  ["1 Chronicles", "1 Chr", "1ch"], ["2 Chronicles", "2 Chr", "2ch"], ["Ezra", "Ezra", "ezr"],
  ["Nehemiah", "Neh", "ne"], ["Esther", "Esth", "est", "es"], ["Job", "Job", "jb"],
  ["Psalms", "Ps", "psalm", "pss", "psa", "psm"], ["Proverbs", "Prov", "prv", "pr"],
  ["Ecclesiastes", "Eccl", "ecc", "qoh"],
  ["Song of Solomon", "Song", "songofsongs", "sos", "sng", "canticles"], ["Isaiah", "Isa", "is"],
  ["Jeremiah", "Jer", "jr"], ["Lamentations", "Lam", "la"], ["Ezekiel", "Ezek", "ezk", "eze"],
  ["Daniel", "Dan", "dn"], ["Hosea", "Hos", "ho"], ["Joel", "Joel", "jl"], ["Amos", "Amos", "am"],
  ["Obadiah", "Obad", "ob"], ["Jonah", "Jonah", "jnh", "jon"], ["Micah", "Mic", "mc"],
  ["Nahum", "Nah", "na"], ["Habakkuk", "Hab", "hb"], ["Zephaniah", "Zeph", "zp"],
  ["Haggai", "Hag", "hg"], ["Zechariah", "Zech", "zc"], ["Malachi", "Mal", "ml"],
  ["Matthew", "Matt", "mt"], ["Mark", "Mark", "mk", "mrk"], ["Luke", "Luke", "lk"],
  ["John", "John", "jn", "jhn"], ["Acts", "Acts", "ac"], ["Romans", "Rom", "rm"],
  ["1 Corinthians", "1 Cor", "1co"], ["2 Corinthians", "2 Cor", "2co"], ["Galatians", "Gal", "ga"],
  ["Ephesians", "Eph", "ephes"], ["Philippians", "Phil", "php", "pp"], ["Colossians", "Col"],
  ["1 Thessalonians", "1 Thess", "1th"], ["2 Thessalonians", "2 Thess", "2th"],
  ["1 Timothy", "1 Tim", "1ti"], ["2 Timothy", "2 Tim", "2ti"], ["Titus", "Titus", "tit"],
  ["Philemon", "Phlm", "phm", "philem"], ["Hebrews", "Heb"], ["James", "Jas", "jm"],
  ["1 Peter", "1 Pet", "1pe", "1pt"], ["2 Peter", "2 Pet", "2pe", "2pt"],
  ["1 John", "1 John", "1jn", "1jo"], ["2 John", "2 John", "2jn", "2jo"],
  ["3 John", "3 John", "3jn", "3jo"], ["Jude", "Jude", "jd"], ["Revelation", "Rev", "rv", "revelations", "apocalypse"],
];

/** The 66 books of the Protestant canon, in order. */
export const bibleBooks: readonly BibleBook[] = table.map(([name, short, ...aliases], index) => ({
  id: index + 1,
  name,
  short,
  aliases,
}));

export const oldTestamentBooks = 39;

export function getBook(id: number): BibleBook | undefined {
  return bibleBooks[id - 1];
}

/** How many chapters a book has, or 0 when there is no such book. */
export function chaptersIn(book: number): number {
  return verseCounts[book - 1]?.length ?? 0;
}

/** How many verses a chapter has in the King James Bible, or 0 when there is no such chapter. */
export function versesIn(book: number, chapter: number): number {
  return verseCounts[book - 1]?.[chapter - 1] ?? 0;
}

const squash = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");

const exact = new Map<string, number>();
for (const book of bibleBooks) {
  for (const spelling of [book.name, book.short, ...book.aliases])
    exact.set(squash(spelling), book.id);
}
const names = bibleBooks.map((book) => ({ id: book.id, key: squash(book.name) }));

/**
 * Finds a book from what someone typed: a name, a usual abbreviation, or the
 * start of a name when only one book begins that way ("deut", "1 cor",
 * "II Kings", "First John").
 */
export function findBook(input: string): BibleBook | undefined {
  const key = squash(
    input
      .trim()
      .toLowerCase()
      .replace(/^(?:first|1st|i)\s+/, "1 ")
      .replace(/^(?:second|2nd|ii)\s+/, "2 ")
      .replace(/^(?:third|3rd|iii)\s+/, "3 "),
  );
  if (!key) return undefined;
  const known = exact.get(key);
  if (known) return getBook(known);
  if (key.replace(/^\d/, "").length < 2) return undefined;
  const matches = names.filter((name) => name.key.startsWith(key));
  return matches.length === 1 ? getBook(matches[0].id) : undefined;
}
