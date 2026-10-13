/**
 * The outline vocabulary: what an entry can be, how an outline may be
 * numbered, and how much one may hold. Plain values with no database or
 * server code, so the schema, the server actions, and the browser all read
 * the same lists.
 */

/**
 * What an entry is. A point is a point at any depth: a main point, a
 * subpoint, and whatever lies under that are told apart by where they are,
 * never by a type of their own. The introduction and the conclusion are the
 * two sections: at most one of each, never under anything, never over
 * anything, and never numbered.
 */
export const entryTypes = ["introduction", "point", "conclusion"] as const;
export type EntryType = (typeof entryTypes)[number];

/** The two entries that are sections of the sermon and not points. */
export const sectionTypes = ["introduction", "conclusion"] as const satisfies readonly EntryType[];
export type SectionType = (typeof sectionTypes)[number];

/**
 * How much an outline may hold. The title and notes limits are also CHECK
 * constraints. There is no limit on how deep points may go; `entries` is what
 * bounds every operation, and so the depth too.
 */
export const outlineLimits = {
  title: 200,
  notes: 2000,
  /** Entries in one outline, sections included. */
  entries: 500,
  /** Passages on one entry. */
  references: 10,
} as const;

/** Outlines on one page of a list. */
export const outlinePageSize = 24;

/**
 * The orders the overview of outlines offers. The first is the default.
 * "Updated" is when the outline was last worked on, in any way; the title is
 * its sermon's.
 */
export const outlineSorts = [
  "updated-desc",
  "updated-asc",
  "title-asc",
  "title-desc",
  "created-desc",
] as const;
export type OutlineSort = (typeof outlineSorts)[number];

/** What a level counts with. `bullet` and `none` do not count at all. */
export const counterStyles = ["decimal", "alpha", "roman", "bullet", "none"] as const;
export type CounterStyle = (typeof counterStyles)[number];

export const letterCases = ["upper", "lower"] as const;
export type LetterCase = (typeof letterCases)[number];

/** The marks a bullet level may use. The first is the default. */
export const bullets = ["•", "◦", "▪", "–"] as const;
export type Bullet = (typeof bullets)[number];

/**
 * What a level deeper than the last one written uses: the levels again from
 * `repeatFrom`, the last level for ever, or no number at all.
 */
export const overflowRules = ["repeat", "last", "none"] as const;
export type OverflowRule = (typeof overflowRules)[number];

/** The built-in numbering styles. The first is what a new outline has. */
export const numberingPresetIds = [
  "traditional",
  "decimal",
  "numeric",
  "alphabetic",
  "roman",
  "bullets",
  "none",
] as const;
export type NumberingPresetId = (typeof numberingPresetIds)[number];

/** How long and how many the parts of a custom numbering may be. */
export const numberingLimits = {
  levels: 12,
  prefix: 16,
  suffix: 16,
  separator: 4,
  /** The longest label ever produced. A longer one keeps its end. */
  label: 64,
  /** The stored configuration, as JSON text. Also a CHECK constraint. */
  stored: 4000,
} as const;
