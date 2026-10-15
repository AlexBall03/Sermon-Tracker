import { routes } from "@/lib/site";
import { bibleBooks, chaptersIn, versesIn } from "./books";
import { referenceSpans, type ScriptureReference } from "./reference";
import { isTranslationId, type TranslationId } from "./translations";

/**
 * Where the Bible reader is open: the address of `/bible`, and the place this
 * browser was last reading. There is no server code here, so the page and the
 * reader build and read the same addresses.
 *
 *   /bible                              wherever this browser last read, or Genesis 1
 *   /bible?book=43&chapter=3            John 3
 *   /bible?book=43&chapter=3&verse=16   John 3, brought to verse 16
 *   …&verse=16&through=18               the same, pointing out verses 16 to 18
 *   …&t=rvg                             read in that translation, not the reader's usual one
 *   …&beside=kjv.45.8                   with Romans 8 in the King James open beside it
 *   …&idea=<id>                         opened from that idea, which is the way back
 *   …&outline=<id>                      opened from that outline, which is the way back
 *
 * `book` is the canonical number, 1 to 66. `verse` says where to look, and
 * `through` how far the passage runs in that chapter; neither ever selects
 * anything. `idea` is an idea's ID and `outline` an outline's, and nothing
 * more: whose it is, and what it is called, is for the server to find out. An
 * address names one way back at most; given both, the outline is the one.
 *
 * A place is the same place in every translation, so `t` is apart from it: it
 * says which text to read the place in, and an address without it is read in
 * the reader's own translation. `beside` is the second pane of a comparison:
 * a translation and a chapter of its own, which need not be the first pane's.
 * Whether a translation is on offer is not decided here (see `offered`).
 */
export type ReaderLocation = {
  book: number;
  chapter: number;
  verse: number | null;
  /** The last verse of the passage gone to, when it is more than `verse` alone. */
  through?: number | null;
  /** The idea the reader was opened from. */
  idea?: string | null;
  /** The outline the reader was opened from, in place of an idea. */
  outline?: string | null;
  /** The translation to read it in. Absent, it is the reader's own. */
  translation?: TranslationId | null;
  /** The pane open beside this one, when two are being compared. */
  beside?: BesidePane | null;
};

/** The second pane of a comparison: its own translation and its own chapter. */
export type BesidePane = { translation: TranslationId; book: number; chapter: number };

/** The parameter that names a translation, in the reader's address and in /api/bible. */
export const translationParam = "t";

export type ReaderSearchParams = Record<string, string | string[] | undefined>;

export const firstLocation: ReaderLocation = { book: 1, chapter: 1, verse: null };

const wholeNumber = /^[1-9]\d{0,2}$/;

function numberOf(value: string | string[] | null | undefined): number {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === "string" && wholeNumber.test(first) ? Number(first) : 0;
}

function translationOf(value: string | string[] | null | undefined): TranslationId | null {
  const first = Array.isArray(value) ? value[0] : value;
  return isTranslationId(first) ? first : null;
}

/** "kjv.45.8": a translation and a chapter that exists, or nothing. */
function besideOf(value: string | string[] | null | undefined): BesidePane | null {
  const first = Array.isArray(value) ? value[0] : value;
  const match =
    typeof first === "string" ? /^([a-z0-9]+)\.(\d{1,2})\.(\d{1,3})$/.exec(first) : null;
  if (!match || !isTranslationId(match[1])) return null;
  const [book, chapter] = [Number(match[2]), Number(match[3])];
  return versesIn(book, chapter) > 0 ? { translation: match[1], book, chapter } : null;
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
 * chapter 1; a verse the chapter does not have is dropped. A translation that
 * is not one, and a second pane that does not name a real chapter, are
 * dropped too. Anything else in the address is ignored, and of a repeated
 * parameter the first is used.
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
  if (!place) return null;
  const translation = translationOf(read(translationParam));
  const beside = besideOf(read("beside"));
  const outline = ideaOf(read("outline"));
  const idea = outline ? null : ideaOf(read("idea"));
  return {
    ...place,
    ...(translation ? { translation } : {}),
    ...(beside ? { beside } : {}),
    ...(idea ? { idea } : {}),
    ...(outline ? { outline } : {}),
  };
}

/**
 * The location with anything that is not on offer taken out of it: a
 * translation an administrator has switched off is read as the reader's own,
 * and a second pane in it is closed. The place itself never changes.
 */
export function offered(
  location: ReaderLocation,
  translations: readonly TranslationId[],
): ReaderLocation {
  const { translation, beside, ...place } = location;
  return {
    ...place,
    ...(translation && translations.includes(translation) ? { translation } : {}),
    ...(beside && translations.includes(beside.translation) ? { beside } : {}),
  };
}

/** The one address of a location. */
export function readerHref({
  book,
  chapter,
  verse,
  through,
  idea,
  outline,
  translation,
  beside,
}: ReaderLocation): string {
  let href = `${routes.bible}?book=${book}&chapter=${chapter}`;
  if (verse) href += `&verse=${verse}`;
  if (verse && through && through > verse) href += `&through=${through}`;
  if (translation) href += `&${translationParam}=${translation}`;
  if (beside) href += `&beside=${beside.translation}.${beside.book}.${beside.chapter}`;
  if (outline) href += `&outline=${outline}`;
  else if (idea) href += `&idea=${idea}`;
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

/**
 * What a reference shown somewhere was opened from, and so the way back the
 * reader offers: an idea's ID, as a plain string, or an outline's.
 */
export type ReferenceOrigin = string | { outline: string };

/** Where a reference begins. */
export function locationOfReference(reference: ScriptureReference): ReaderLocation {
  return settle(reference.book, reference.chapterStart, reference.verseStart ?? 0) ?? firstLocation;
}

/**
 * Where a reference is read: its first chapter, at its first verse, with the
 * rest of what it covers in that chapter pointed out beside it. A passage
 * that runs on into later chapters is pointed out to the end of its first. A
 * whole chapter needs no pointing out. `origin` is where it was opened from:
 * an idea's ID, or an outline's.
 */
export function referenceLocation(
  reference: ScriptureReference,
  origin?: ReferenceOrigin | null,
): ReaderLocation {
  const start = locationOfReference(reference);
  const [span] = referenceSpans(reference);
  const through = start.verse !== null && span && span.to > start.verse ? span.to : 0;
  const place = settle(start.book, start.chapter, start.verse ?? 0, through) ?? firstLocation;
  if (!origin) return place;
  return typeof origin === "string" ? { ...place, idea: origin } : { ...place, ...origin };
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

/**
 * The translation last read in this visit, in the reader or the Scripture
 * Panel. It is a view, never the account's translation, which is chosen only
 * in Settings: kept in `sessionStorage`, so it lasts while the tab or the
 * installed window is open and is gone when it closes, and an address that
 * names a translation always wins over it.
 */
export const sessionTranslationKey = "bible-translation";

const sessionListeners = new Set<() => void>();

/** The visit's translation when it is one on offer, or null. */
export function readSessionTranslation(offered: readonly TranslationId[]): TranslationId | null {
  try {
    const stored = window.sessionStorage.getItem(sessionTranslationKey);
    return isTranslationId(stored) && offered.includes(stored) ? stored : null;
  } catch {
    return null;
  }
}

/** Remembers the translation being read, for the rest of the visit. */
export function saveSessionTranslation(translation: TranslationId) {
  try {
    window.sessionStorage.setItem(sessionTranslationKey, translation);
  } catch {
    // Private browsing, or storage refused: the choice lasts for this page.
  }
  sessionListeners.forEach((notify) => notify());
}

/** For `useSyncExternalStore`: a choice made in this tab. */
export function subscribeSessionTranslation(notify: () => void) {
  sessionListeners.add(notify);
  return () => {
    sessionListeners.delete(notify);
  };
}
