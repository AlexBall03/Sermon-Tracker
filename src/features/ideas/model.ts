/**
 * The idea vocabulary: what an idea can be, where it stands, and how long its
 * text may run. Plain values with no database or server code, so the schema,
 * the server actions, and the browser all read the same list.
 */
export const ideaKinds = ["sermon", "point", "undecided"] as const;
export type IdeaKind = (typeof ideaKinds)[number];

/**
 * How far an idea has been developed. It is changed by hand and by nothing
 * else: any status may follow any other, and preaching a sermon does not move
 * it. Whether an idea is archived is a separate fact (`archivedAt`).
 */
export const ideaStatuses = ["idea", "developing", "ready", "on_hold"] as const;
export type IdeaStatus = (typeof ideaStatuses)[number];

/**
 * What `idea` was called before Phase 2D.1. Migration 0008 rewrote the rows
 * that held it and the table now refuses it. It is still recognized in an old
 * library address and by the defensive read in `ideas.ts`, and never written.
 */
export const legacyIdeaStatus = "captured";

/**
 * The length a sermon is meant for. It says nothing of how it was delivered
 * on any one occasion, which preaching history will record for itself.
 */
export const intendedFormats = ["full_length", "mini", "flexible", "unspecified"] as const;
export type IntendedFormat = (typeof intendedFormats)[number];

/** A sermon's primary type. One to a sermon; `unspecified` until the preacher says. */
export const sermonTypes = ["topical", "textual", "expository", "unspecified"] as const;
export type SermonType = (typeof sermonTypes)[number];

/** What a new idea is given when nothing is said. An update never falls back to these. */
export const classificationDefaults = {
  status: "idea",
  intendedFormat: "unspecified",
  sermonType: "unspecified",
} as const satisfies { status: IdeaStatus; intendedFormat: IntendedFormat; sermonType: SermonType };

/**
 * Which ideas a list shows by whether they are archived. The first is the
 * default: an archived idea is only ever listed because it was asked for.
 */
export const archiveViews = ["active", "archived", "all"] as const;
export type ArchiveView = (typeof archiveViews)[number];

/**
 * The statuses of an idea that is not finished. `ready` is the one that is;
 * an idea on hold is still unfinished. Preaching a sermon finishes nothing.
 */
export const unfinishedStatuses = [
  "idea",
  "developing",
  "on_hold",
] as const satisfies readonly IdeaStatus[];

/**
 * The statuses of a sermon that is being worked towards now: the dashboard's
 * "Continue Working". One that is ready is finished, and one on hold was put
 * aside on purpose.
 */
export const activeStatuses = ["idea", "developing"] as const satisfies readonly IdeaStatus[];

/**
 * How many days an unfinished sermon may go without being worked on before it
 * is offered again. The dashboard and the library both read it from here.
 */
export const revisitAfterDays = 30;

/**
 * The library's two revisiting filters, both about sermon ideas only. `never`:
 * not worked on since it was captured. `attention`: unfinished, and not worked
 * on for `revisitAfterDays`.
 */
export const revisitFilters = ["never", "attention"] as const;
export type RevisitFilter = (typeof revisitFilters)[number];

/** The database enforces the same limits with CHECK constraints. */
export const ideaLimits = { title: 200, subject: 200, notes: 20000, references: 25 } as const;

export const ideaKindLabels: Record<IdeaKind, string> = {
  sermon: "Sermon idea",
  point: "Point idea",
  undecided: "Undecided",
};

/** A tag's name, and how many tags one idea may carry. The name limit is also a CHECK constraint. */
export const tagLimits = { name: 50, perIdea: 20 } as const;

/**
 * Library search. A query is cut to `query` characters and its first `terms`
 * words are used, which bounds the work one request can ask for.
 */
export const searchLimits = { query: 200, terms: 8 } as const;

/** How many tags the library can be filtered by at once. */
export const tagFilterLimit = 20;

/** How several chosen tags filter the library: any one of them, or every one. The first is the default. */
export const tagModes = ["any", "all"] as const;
export type TagMode = (typeof tagModes)[number];

export const tagModeLabels: Record<TagMode, string> = { any: "Any", all: "All" };

/** The library's orderings. The first is the default. */
export const librarySorts = [
  "updated-desc",
  "updated-asc",
  "created-desc",
  "created-asc",
  "title-asc",
  "title-desc",
] as const;
export type LibrarySort = (typeof librarySorts)[number];

export const librarySortLabels: Record<LibrarySort, string> = {
  "updated-desc": "Recently updated",
  "updated-asc": "Least recently updated",
  "created-desc": "Recently created",
  "created-asc": "Oldest created",
  "title-asc": "Title A–Z",
  "title-desc": "Title Z–A",
};

/** Ideas on one page of the library. */
export const libraryPageSize = 24;
