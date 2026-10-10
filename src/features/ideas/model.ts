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
