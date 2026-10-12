/**
 * The vocabulary of saved Scripture: favorites and highlights. Plain values
 * with no database or server code, so the schema, the server actions, and the
 * browser all read the same list.
 */

import type { TranslationId } from "../translations";
import type { VerseRef } from "./verse-set";

/**
 * The translations a favorite or a highlight can belong to. Each is kept
 * with the translation it was made in and is never carried to another.
 */
export { translationIds, type TranslationId } from "../translations";

/** The highlighter's colors. A verse carries one of them, or none. */
export const highlightColors = ["yellow", "green", "blue", "red"] as const;
export type HighlightColor = (typeof highlightColors)[number];

export const highlightColorLabels: Record<HighlightColor, string> = {
  yellow: "Yellow",
  green: "Green",
  blue: "Blue",
  red: "Red",
};

/**
 * How long a favorite's text may run, and how many verses one favorite, or
 * one highlighting, may cover. The longest chapter has 176 verses. The label
 * and notes limits are also CHECK constraints.
 */
export const savedLimits = { label: 120, notes: 2000, verses: 200 } as const;

/** The orderings of saved Scripture. The first is the default. */
export const savedSorts = ["saved-desc", "updated-desc", "bible"] as const;
export type SavedSort = (typeof savedSorts)[number];

export const savedSortLabels: Record<SavedSort, string> = {
  "saved-desc": "Recently saved",
  "updated-desc": "Recently updated",
  bible: "Biblical order",
};

/** A saved passage as every surface holds it. Its verses are in canonical order. */
export type FavoriteSummary = {
  id: string;
  translation: TranslationId;
  /** The passage as it is written: "Romans 3:10, 23; 6:23". */
  reference: string;
  label: string | null;
  notes: string | null;
  verses: VerseRef[];
};

/** What one account has marked in one chapter: its highlights, and the favorites that touch it. */
export type ChapterMarks = {
  /** Verse number to color. A verse that is absent is not highlighted. */
  highlights: Record<number, HighlightColor>;
  /** Each with all of its verses, including any in other chapters. */
  favorites: FavoriteSummary[];
  /**
   * What the account has marked in this same chapter of the other
   * translations on offer, as counts: marks belong to the translation they
   * were made in and are never shown in another, so this is how a reader
   * learns they are there. Only translations with something marked are listed.
   */
  elsewhere?: MarksElsewhere[];
};

export type MarksElsewhere = { translation: TranslationId; highlights: number; favorites: number };

export const noMarks: ChapterMarks = { highlights: {}, favorites: [] };

/** Favorites on one page of the library. */
export const savedPageSize = 24;

/** How many verses of a favorite the library shows before it says there are more. */
export const savedPreviewVerses = 3;
