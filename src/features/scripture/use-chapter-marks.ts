"use client";

import { useEffect, useSyncExternalStore } from "react";

import type { ActionResult } from "@/lib/action-result";
import { translationParam } from "./reader-location";
import { setHighlight } from "./saved/actions";
import {
  noMarks,
  type ChapterMarks,
  type FavoriteSummary,
  type HighlightColor,
} from "./saved/model";
import { isTranslationId, type TranslationId } from "./translations";

/*
 * What the signed-in account has marked, a chapter of one translation at a
 * time: its highlights and the favorites that touch the chapter. Marks belong
 * to the translation they were made in, so the same chapter in two
 * translations is two entries here and neither shows the other's. The text beside it is the same
 * for everyone and is kept for good (use-chapter.ts); this is one person's and
 * can change, so it is held differently:
 *
 * - A chapter's marks are shown from memory at once and asked for again each
 *   time the chapter is shown, so a change made elsewhere arrives without a
 *   reload and a turn of the page is never bare for a moment.
 * - A highlight is shown the instant it is asked for. What is on screen is
 *   what the server last confirmed with the changes still on their way laid
 *   over it, in the order they were made. A change the server refuses is taken
 *   back by itself; the ones made after it stay.
 * - Each chapter has its own entry, so an answer about a chapter that has been
 *   left can only ever land on that chapter.
 *
 * Every Scripture surface that marks verses reads and writes them here.
 */

type Change = { id: number; verses: readonly number[]; color: HighlightColor | null };

type Entry = {
  /** What the server last said, or null before it has. */
  confirmed: ChapterMarks | null;
  /** Highlight changes shown but not yet answered, oldest first. */
  pending: Change[];
  /** Counts everything that has changed the entry, so an older answer can be told from a newer one. */
  version: number;
  /** `confirmed` with `pending` laid over it. The same object until something changes. */
  shown: ChapterMarks;
  failed: boolean;
};

const entries = new Map<string, Entry>();
const requests = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();
/** One change at a time reaches the server, in the order they were made. */
let queue: Promise<unknown> = Promise.resolve();
let nextChange = 1;

const keyOf = (translation: TranslationId, book: number, chapter: number) =>
  `${translation}.${book}.${chapter}`;

/** The translation, book, and chapter an entry is for. */
function placeOf(key: string) {
  const [translation, book, chapter] = key.split(".");
  return { translation, book: Number(book), chapter: Number(chapter) };
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function withColor(
  highlights: ChapterMarks["highlights"],
  verses: readonly number[],
  color: HighlightColor | null,
) {
  const next = { ...highlights };
  for (const verse of verses) {
    if (color) next[verse] = color;
    else delete next[verse];
  }
  return next;
}

/** Recomputes what an entry shows, and tells whoever is showing it. */
function settle(key: string, entry: Entry) {
  const base = entry.confirmed ?? noMarks;
  entry.shown = {
    ...(base.elsewhere ? { elsewhere: base.elsewhere } : {}),
    favorites: base.favorites,
    highlights: entry.pending.reduce(
      (highlights, change) => withColor(highlights, change.verses, change.color),
      base.highlights,
    ),
  };
  entry.version += 1;
  entries.set(key, entry);
  for (const listener of listeners) listener();
}

function entryFor(key: string): Entry {
  return (
    entries.get(key) ?? { confirmed: null, pending: [], version: 0, shown: noMarks, failed: false }
  );
}

/** Keeps marks that arrived another way (with the page), unless newer ones are already held. */
export function keepMarks(
  translation: TranslationId,
  book: number,
  chapter: number,
  marks: ChapterMarks,
) {
  const key = keyOf(translation, book, chapter);
  if (entries.get(key)?.confirmed) return;
  settle(key, { ...entryFor(key), confirmed: marks, failed: false });
}

/**
 * Asks for a chapter's marks. Asking again while an answer is on its way
 * waits for that one. An answer that was overtaken by a change made here is
 * dropped: what is held is newer than it.
 */
export function loadMarks(
  translation: TranslationId,
  book: number,
  chapter: number,
): Promise<void> {
  const key = keyOf(translation, book, chapter);
  const waiting = requests.get(key);
  if (waiting) return waiting;

  const asked = entryFor(key).version;
  const request = fetch(`/api/bible/${book}/${chapter}/marks?${translationParam}=${translation}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  })
    .then(async (response) => {
      if (!response.ok) throw new Error(`Marks request failed: ${response.status}`);
      const marks = (await response.json()) as ChapterMarks;
      if (typeof marks?.highlights !== "object" || !Array.isArray(marks.favorites)) {
        throw new Error("Marks answer was not understood");
      }
      const entry = entryFor(key);
      if (entry.version !== asked && entry.confirmed) return;
      settle(key, { ...entry, confirmed: marks, failed: false });
    })
    .catch(() => {
      const entry = entryFor(key);
      // Marks already held are still worth showing; only their absence is a failure.
      if (!entry.confirmed && !entry.failed) settle(key, { ...entry, failed: true });
    })
    .finally(() => requests.delete(key));
  requests.set(key, request);
  return request;
}

export type ChapterMarksState = {
  marks: ChapterMarks;
  /** True once the server has answered for this chapter, or its marks came with the page. */
  ready: boolean;
  /** True when they could not be read and none are held. The text is still worth reading. */
  failed: boolean;
};

/** The account's marks in one chapter, kept up to date for as long as it is shown. */
export function useChapterMarks(
  translation: TranslationId,
  book: number,
  chapter: number,
  /** False where there is no account to ask (the offline reader): nothing is asked for. */
  enabled = true,
): ChapterMarksState {
  const key = keyOf(translation, book, chapter);
  const entry = useSyncExternalStore(
    subscribe,
    () => (enabled ? entries.get(key) : undefined),
    () => undefined,
  );
  useEffect(() => {
    if (enabled) void loadMarks(translation, book, chapter);
  }, [translation, book, chapter, enabled]);
  return {
    marks: entry?.shown ?? noMarks,
    ready: Boolean(entry?.confirmed),
    failed: entry?.failed ?? false,
  };
}

/**
 * Highlights verses of one chapter of one translation in a color, or takes
 * their highlight off with null. They are shown changed at once; the answer says whether the
 * change was kept, and when it was not, it has already been taken back.
 */
export function highlightVerses(
  translation: TranslationId,
  book: number,
  chapter: number,
  verses: readonly number[],
  color: HighlightColor | null,
  /** What to say when the request never arrives, in the interface's language. */
  offline = "The highlight could not be saved. Check your connection and try again.",
): Promise<ActionResult> {
  const key = keyOf(translation, book, chapter);
  const change: Change = { id: nextChange++, verses: [...verses], color };
  const entry = entryFor(key);
  settle(key, { ...entry, pending: [...entry.pending, change] });

  const send = async (): Promise<ActionResult> => {
    let result: ActionResult;
    try {
      result = await setHighlight({
        translation,
        verses: verses.map((verse) => ({ book, chapter, verse })),
        color,
      });
    } catch {
      // The request never arrived, or its answer never came back.
      result = { ok: false, message: offline };
    }
    const now = entryFor(key);
    const pending = now.pending.filter((item) => item.id !== change.id);
    const base = now.confirmed ?? noMarks;
    settle(key, {
      ...now,
      pending,
      // Kept: it becomes part of what the server holds. Refused: it simply goes.
      confirmed: result.ok
        ? { ...base, highlights: withColor(base.highlights, change.verses, change.color) }
        : now.confirmed,
    });
    return result;
  };
  const sent = queue.then(send, send);
  queue = sent;
  return sent;
}

/** Puts a favorite that was saved or changed into every chapter held that it touches, and out of the rest. */
export function putFavorite(favorite: FavoriteSummary) {
  for (const [key, entry] of entries) {
    if (!entry.confirmed) continue;
    const { translation, book, chapter } = placeOf(key);
    const others = entry.confirmed.favorites.filter((item) => item.id !== favorite.id);
    const touches =
      isTranslationId(translation) &&
      favorite.translation === translation &&
      favorite.verses.some((verse) => verse.book === book && verse.chapter === chapter);
    if (!touches && others.length === entry.confirmed.favorites.length) continue;
    settle(key, {
      ...entry,
      confirmed: { ...entry.confirmed, favorites: touches ? [...others, favorite] : others },
    });
  }
}

/** Takes a deleted favorite out of every chapter held. Highlights are not its concern. */
export function dropFavorite(id: string) {
  for (const [key, entry] of entries) {
    if (!entry.confirmed?.favorites.some((item) => item.id === id)) continue;
    settle(key, {
      ...entry,
      confirmed: {
        ...entry.confirmed,
        favorites: entry.confirmed.favorites.filter((item) => item.id !== id),
      },
    });
  }
}

/** For tests: forget every chapter's marks. */
export function clearMarksCache() {
  entries.clear();
  requests.clear();
  queue = Promise.resolve();
}
