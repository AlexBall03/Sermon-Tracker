import { defaultLocale, type Locale } from "@/i18n/locales";
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

type Row = readonly [name: string, short: string, ...aliases: string[]];

// prettier-ignore
const english: readonly Row[] = [
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

// The books as the Reina-Valera names them.
// prettier-ignore
const spanish: readonly Row[] = [
  ["Génesis", "Gn", "gen"], ["Éxodo", "Éx", "exo"], ["Levítico", "Lv", "lev"],
  ["Números", "Nm", "num"], ["Deuteronomio", "Dt", "deut"], ["Josué", "Jos"],
  ["Jueces", "Jue", "jc"], ["Rut", "Rt"], ["1 Samuel", "1 S", "1sam"],
  ["2 Samuel", "2 S", "2sam"], ["1 Reyes", "1 R", "1re", "1rey"], ["2 Reyes", "2 R", "2re", "2rey"],
  ["1 Crónicas", "1 Cr", "1cro"], ["2 Crónicas", "2 Cr", "2cro"], ["Esdras", "Esd"],
  ["Nehemías", "Neh"], ["Ester", "Est"], ["Job", "Job"],
  ["Salmos", "Sal", "salmo", "slm"], ["Proverbios", "Pr", "prov"],
  ["Eclesiastés", "Ec", "ecl"],
  ["Cantares", "Cnt", "cantar", "cantardeloscantares", "cant"], ["Isaías", "Is", "isa"],
  ["Jeremías", "Jer"], ["Lamentaciones", "Lm", "lam"], ["Ezequiel", "Ez", "eze"],
  ["Daniel", "Dn", "dan"], ["Oseas", "Os"], ["Joel", "Jl"], ["Amós", "Am"],
  ["Abdías", "Abd"], ["Jonás", "Jon"], ["Miqueas", "Mi", "miq"],
  ["Nahúm", "Nah"], ["Habacuc", "Hab"], ["Sofonías", "Sof"],
  ["Hageo", "Hag"], ["Zacarías", "Zac"], ["Malaquías", "Mal"],
  ["Mateo", "Mt", "mat"], ["Marcos", "Mr", "mar"], ["Lucas", "Lc", "luc"],
  ["Juan", "Jn"], ["Hechos", "Hch", "hech"], ["Romanos", "Ro", "rom"],
  ["1 Corintios", "1 Co", "1cor"], ["2 Corintios", "2 Co", "2cor"], ["Gálatas", "Gá", "gal"],
  ["Efesios", "Ef"], ["Filipenses", "Fil", "flp"], ["Colosenses", "Col"],
  ["1 Tesalonicenses", "1 Ts", "1tes"], ["2 Tesalonicenses", "2 Ts", "2tes"],
  ["1 Timoteo", "1 Ti", "1tim"], ["2 Timoteo", "2 Ti", "2tim"], ["Tito", "Tit"],
  ["Filemón", "Flm", "filem"], ["Hebreos", "He", "heb"], ["Santiago", "Stg", "sant"],
  ["1 Pedro", "1 P", "1pe", "1ped"], ["2 Pedro", "2 P", "2pe", "2ped"],
  ["1 Juan", "1 Jn"], ["2 Juan", "2 Jn"],
  ["3 Juan", "3 Jn"], ["Judas", "Jud"], ["Apocalipsis", "Ap", "apoc"],
];

const tables: Record<Locale, readonly BibleBook[]> = {
  en: english.map(([name, short, ...aliases], index) => ({ id: index + 1, name, short, aliases })),
  es: spanish.map(([name, short, ...aliases], index) => ({ id: index + 1, name, short, aliases })),
};

/** The 66 books of the Protestant canon, in order, named in English. */
export const bibleBooks: readonly BibleBook[] = tables.en;

/** The 66 books named in a language: the interface's, or that of the text beside them. */
export function booksIn(language: Locale = defaultLocale): readonly BibleBook[] {
  return tables[language] ?? tables.en;
}

export const oldTestamentBooks = 39;

/** Psalms: the one book whose chapters can carry a title above verse 1. */
export const psalmsBook = 19;

/** A book by its number. The number is what is stored; the name is only how it is shown. */
export function getBook(id: number, language: Locale = defaultLocale): BibleBook | undefined {
  return booksIn(language)[id - 1];
}

/** One psalm is a "Psalm", not "Psalms": the name a single chapter of the book goes by. */
export function chapterBookName(id: number, language: Locale = defaultLocale): string {
  if (id === psalmsBook) return language === "es" ? "Salmo" : "Psalm";
  return getBook(id, language)?.name ?? "";
}

/** How many chapters a book has, or 0 when there is no such book. */
export function chaptersIn(book: number): number {
  return verseCounts[book - 1]?.length ?? 0;
}

/**
 * How many verses a chapter has, or 0 when there is no such chapter. The King
 * James and the Reina-Valera Gómez number alike, so this serves every translation.
 */
export function versesIn(book: number, chapter: number): number {
  return verseCounts[book - 1]?.[chapter - 1] ?? 0;
}

/** Letters and digits only, with accents taken off: "Génesis" and "genesis" are one spelling. */
const squash = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

// A spelling belongs to the first book that claims it, and English claims first, so
// what was read as a book before Spanish names were added is read the same now. For
// the same reason a Spanish spelling that begins another book's English name is left
// unclaimed: "Jud" could be Judges, so it stays a question and not an answer.
const exact = new Map<string, number>();
for (const language of ["en", "es"] as const) {
  for (const book of tables[language]) {
    for (const spelling of [book.name, book.short, ...book.aliases]) {
      const key = squash(spelling);
      const begins = (other: BibleBook) =>
        other.id !== book.id && squash(other.name).startsWith(key);
      if (exact.has(key) || (language === "es" && tables.en.some(begins))) continue;
      exact.set(key, book.id);
    }
  }
}
const names = (["en", "es"] as const).flatMap((language) =>
  tables[language].map((book) => ({ id: book.id, key: squash(book.name) })),
);

/**
 * Finds a book from what someone typed, in English or Spanish whatever the
 * interface is in: a name, a usual abbreviation, or the start of a name when
 * only one book begins that way ("deut", "1 cor", "II Kings", "First John",
 * "Génesis", "1 Reyes", "Apoc"). The book comes back named in `language`.
 */
export function findBook(input: string, language: Locale = defaultLocale): BibleBook | undefined {
  const key = squash(
    input
      .trim()
      .toLowerCase()
      .replace(/^(?:first|1st|primera?|primero|1ra?|1ro|i)\s+/, "1 ")
      .replace(/^(?:second|2nd|segund[ao]|2d[ao]|ii)\s+/, "2 ")
      .replace(/^(?:third|3rd|tercera?|tercero|3ra?|3ro|iii)\s+/, "3 "),
  );
  if (!key) return undefined;
  const known = exact.get(key);
  if (known) return getBook(known, language);
  if (key.replace(/^\d/, "").length < 2) return undefined;
  const matches = new Set(names.filter((name) => name.key.startsWith(key)).map((name) => name.id));
  return matches.size === 1 ? getBook([...matches][0], language) : undefined;
}
