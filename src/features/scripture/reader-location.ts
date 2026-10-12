import { routes } from "@/lib/site";
import { bibleBooks, chaptersIn, versesIn } from "./books";
import { referenceSpans, type ScriptureReference } from "./reference";

/**
 * Where the Bible reader is open: the address of `/bible`, and the place this
 * browser was last reading. There is no server code here, so the page and the
 * reader build and read the same addresses.
 *
 *   /bible                              wherever this browser last read, or Genesis 1
 *   /bible?book=43&chapter=3            John 3
 *   /bible?book=43&chapter=3&verse=16   John 3, brought to verse 16
 *   …&verse=16&through=18               the same, pointing out verses 16 to 18
 *   …&idea=<id>                         opened from that idea, which is the way back
 *
 * `book` is the canonical number, 1 to 66. `verse` says where to look, and
 * `through` how far the passage runs in that chapter; neither ever selects
 * anything. `idea` is an idea's ID and nothing more: whose it is, and what it
 * is called, is for the server to find out. None of them names a translation.
 */
export type ReaderLocation = {
  book: number;
  chapter: number;
  verse: number | null;
  /** The last verse of the passage gone to, when it is more than `verse` alone. */
  through?: number | null;
  /** The idea the reader was opened from. */
  idea?: string | null;
};

export type ReaderSearchParams = Record<string, string | string[] | undefined>;

export const firstLocation: ReaderLocation = { book: 1, chapter: 1, verse: null };

const wholeNumber = /^[1-9]\d{0,2}$/;

function numberOf(value: string | string[] | null | undefined): number {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === "string" && wholeNumber.test(first) ? Number(first) : 0;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ideaOf(value: string | string[] | null | undefined): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === "string" && uuid.test(first) ? first.toLowerCase() : null;
}

/** A location that exists in the Bible, or null. */
function settle(book: number, chapter: number, verse: number, through = 0): ReaderLocation | null {
  const chapters = chaptersIn(book);
  if (chapters === 0) return null;
  const validChapter = chapter >= 1 && chapter <= chapters;
  if (!validChapter) return { book, chapter: 1, verse: null };
  const verses = versesIn(book, chapter);
  if (verse < 1 || verse > verses) return { book, chapter, verse: null };
  // A passage ends after it starts, in the chapter it starts in; anything else is one verse.
  return through > verse && through <= verses
    ? { book, chapter, verse, through }
    : { book, chapter, verse };
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
  const place = settle(
    numberOf(read("book")),
    numberOf(read("chapter")),
    numberOf(read("verse")),
    numberOf(read("through")),
  );
  const idea = ideaOf(read("idea"));
  return place && idea ? { ...place, idea } : place;
}

/** The one address of a location. */
export function readerHref({ book, chapter, verse, through, idea }: ReaderLocation): string {
  let href = `${routes.bible}?book=${book}&chapter=${chapter}`;
  if (verse) href += `&verse=${verse}`;
  if (verse && through && through > verse) href += `&through=${through}`;
  if (idea) href += `&idea=${idea}`;
  return href;
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

/**
 * Where a reference is read: its first chapter, at its first verse, with the
 * rest of what it covers in that chapter pointed out beside it. A passage
 * that runs on into later chapters is pointed out to the end of its first. A
 * whole chapter needs no pointing out. `idea` is the idea it was opened from.
 */
export function referenceLocation(
  reference: ScriptureReference,
  idea?: string | null,
): ReaderLocation {
  const start = locationOfReference(reference);
  const [span] = referenceSpans(reference);
  const through = start.verse !== null && span && span.to > start.verse ? span.to : 0;
  const place = settle(start.book, start.chapter, start.verse ?? 0, through) ?? firstLocation;
  return idea ? { ...place, idea } : place;
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
