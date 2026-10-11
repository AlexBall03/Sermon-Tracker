import { routes } from "@/lib/site";
import { bibleBooks, chaptersIn, versesIn } from "./books";
import type { ScriptureReference } from "./reference";

/**
 * Where the Bible reader is open: the address of `/bible`, and the place this
 * browser was last reading. There is no server code here, so the page and the
 * reader build and read the same addresses.
 *
 *   /bible                              wherever this browser last read, or Genesis 1
 *   /bible?book=43&chapter=3            John 3
 *   /bible?book=43&chapter=3&verse=16   John 3, brought to verse 16
 *
 * `book` is the canonical number, 1 to 66. `verse` says where to look; it
 * never selects anything.
 */
export type ReaderLocation = { book: number; chapter: number; verse: number | null };

export type ReaderSearchParams = Record<string, string | string[] | undefined>;

export const firstLocation: ReaderLocation = { book: 1, chapter: 1, verse: null };

const wholeNumber = /^[1-9]\d{0,2}$/;

function numberOf(value: string | string[] | null | undefined): number {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === "string" && wholeNumber.test(first) ? Number(first) : 0;
}

/** A location that exists in the Bible, or null. */
function settle(book: number, chapter: number, verse: number): ReaderLocation | null {
  const chapters = chaptersIn(book);
  if (chapters === 0) return null;
  const validChapter = chapter >= 1 && chapter <= chapters;
  if (!validChapter) return { book, chapter: 1, verse: null };
  return { book, chapter, verse: verse >= 1 && verse <= versesIn(book, chapter) ? verse : null };
}

/**
 * Reads a location from an address. It never throws. Without a real book
 * there is no location (null); a chapter the book does not have becomes
 * chapter 1; a verse the chapter does not have is dropped. Anything else in
 * the address is ignored, and of a repeated parameter the first is used.
 */
export function parseReaderLocation(
  params: ReaderSearchParams | URLSearchParams | null | undefined,
): ReaderLocation | null {
  if (!params) return null;
  const read = (name: string) =>
    params instanceof URLSearchParams ? params.get(name) : params[name];
  return settle(numberOf(read("book")), numberOf(read("chapter")), numberOf(read("verse")));
}

/** The one address of a location. */
export function readerHref({ book, chapter, verse }: ReaderLocation): string {
  return `${routes.bible}?book=${book}&chapter=${chapter}${verse ? `&verse=${verse}` : ""}`;
}

/** The chapter before or after, across books; null before Genesis 1 and after Revelation 22. */
export function stepChapter(location: ReaderLocation, direction: 1 | -1): ReaderLocation | null {
  const next = location.chapter + direction;
  if (next >= 1 && next <= chaptersIn(location.book)) {
    return { book: location.book, chapter: next, verse: null };
  }
  const neighbour = location.book + direction;
  if (neighbour < 1 || neighbour > bibleBooks.length) return null;
  return { book: neighbour, chapter: direction === 1 ? 1 : chaptersIn(neighbour), verse: null };
}

/** Where a reference begins. */
export function locationOfReference(reference: ScriptureReference): ReaderLocation {
  return settle(reference.book, reference.chapterStart, reference.verseStart ?? 0) ?? firstLocation;
}

/** Two locations in the same chapter. */
export function sameChapter(a: ReaderLocation | null, b: ReaderLocation | null) {
  return a !== null && b !== null && a.book === b.book && a.chapter === b.chapter;
}

/**
 * The chapter last read in this browser. It is a preference of the device,
 * kept in `localStorage` and never sent anywhere; an address that names a
 * place always wins over it.
 */
export const savedLocationKey = "bible-location";

/** The saved chapter, or null when there is none, it is unreadable, or storage is unavailable. */
export function readSavedLocation(): ReaderLocation | null {
  try {
    const stored = window.localStorage.getItem(savedLocationKey);
    const match = stored ? /^(\d{1,2})\.(\d{1,3})$/.exec(stored) : null;
    if (!match) return null;
    const [book, chapter] = [Number(match[1]), Number(match[2])];
    // A chapter that does not exist is not a place to return to.
    return versesIn(book, chapter) > 0 ? { book, chapter, verse: null } : null;
  } catch {
    return null;
  }
}

/** Remembers a chapter. The verse is not kept: returning starts at the chapter's head. */
export function saveLocation({ book, chapter }: ReaderLocation) {
  if (versesIn(book, chapter) === 0) return;
  try {
    window.localStorage.setItem(savedLocationKey, `${book}.${chapter}`);
  } catch {
    // Private browsing, or storage refused: the place lasts for this page.
  }
}
