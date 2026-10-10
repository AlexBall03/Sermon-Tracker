/**
 * The idea vocabulary: what an idea can be, where it stands, and how long its
 * text may run. Plain values with no database or server code, so the schema,
 * the server actions, and the browser all read the same list.
 */
export const ideaKinds = ["sermon", "point", "undecided"] as const;
export type IdeaKind = (typeof ideaKinds)[number];

export const ideaStatuses = ["captured", "developing", "ready"] as const;
export type IdeaStatus = (typeof ideaStatuses)[number];

export const sermonTypes = ["topical", "expository"] as const;
export type SermonType = (typeof sermonTypes)[number];

/** The database enforces the same limits with CHECK constraints. */
export const ideaLimits = { title: 200, subject: 200, notes: 20000, references: 25 } as const;

export const ideaKindLabels: Record<IdeaKind, string> = {
  sermon: "Sermon idea",
  point: "Point idea",
  undecided: "Undecided",
};

export const ideaStatusLabels: Record<IdeaStatus, string> = {
  captured: "Captured",
  developing: "Developing",
  ready: "Ready",
};

export const sermonTypeLabels: Record<SermonType, string> = {
  topical: "Topical",
  expository: "Expository",
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
  "updated-asc": "Oldest updated",
  "created-desc": "Recently created",
  "created-asc": "Oldest created",
  "title-asc": "Title A–Z",
  "title-desc": "Title Z–A",
};

/** Ideas on one page of the library. */
export const libraryPageSize = 24;
