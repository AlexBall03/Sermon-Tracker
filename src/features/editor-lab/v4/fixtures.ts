import type { JSONContent } from "@tiptap/core";

import type { ScriptureReference } from "@/features/scripture/reference";
import { ref } from "../fixtures";
import { defaultLayout } from "../layout";
import type { PointRole } from "./model";

/*
 * The v4 prototype's documents. Each is v4 JSON as it would be stored;
 * v3's fixtures are also opened in v4 by migrating them (`migrate.ts`).
 */

const words = (value: string): JSONContent[] => (value ? [{ type: "text", text: value }] : []);

export const pointV4 = (
  id: string,
  title: string,
  depth: number,
  extra: { role?: PointRole; sourcePointId?: string } = {},
): JSONContent => ({
  type: "point",
  attrs: { id, depth, role: extra.role ?? null, sourcePointId: extra.sourcePointId ?? null },
  content: words(title),
});

export const proseV4 = (text: string, depth: number): JSONContent => ({
  type: "paragraph",
  attrs: { depth },
  content: words(text),
});

export const passageV4 = (
  id: string,
  { book, chapterStart, verseStart, chapterEnd, verseEnd }: ScriptureReference,
  depth: number,
): JSONContent => ({
  type: "scripturePassage",
  attrs: {
    id,
    book,
    chapterStart,
    verseStart,
    chapterEnd,
    verseEnd,
    translation: null,
    print: "full",
    depth,
  },
});

export const noteV4 = (id: string, text: string, depth: number): JSONContent => ({
  type: "preacherNote",
  attrs: { id, kind: "reminder", print: null, depth },
  content: [{ type: "paragraph", content: words(text) }],
});

export const documentV4 = (content: JSONContent[]): JSONContent => ({
  type: "doc",
  attrs: { schemaVersion: 4, layout: defaultLayout(), translation: null },
  content,
});

/**
 * The owner's scenario (the prototype brief, §4): writing that belongs to
 * Point I itself stands between its two subpoints.
 */
export const parentProse = documentV4([
  pointV4("p-i", "Main Point I", 1),
  pointV4("p-a", "Subpoint A", 2),
  proseV4("Body of A", 2),
  proseV4("Belongs to I", 1),
  pointV4("p-b", "Subpoint B", 2),
  proseV4("Body of B", 2),
  pointV4("p-ii", "Main Point II", 1),
]);

/**
 * Introduction and conclusion as roles on main points, holding everything a
 * point can, and standing where a person puts them: not first, not last.
 */
export const rolesAnywhere = documentV4([
  proseV4("A word before anything else.", 0),
  pointV4("p-1", "The lamp", 1),
  proseV4("Writing under the first main point.", 1),
  pointV4("intro", "Introduction", 1, { role: "introduction" }),
  proseV4("Why this psalm, and why now.", 1),
  passageV4("s-1", ref(19, 119, 105), 1),
  noteV4("n-1", "Ask who walked in the dark this week.", 1),
  pointV4("intro-a", "A dark road", 2),
  proseV4("The road without a light.", 2),
  pointV4("intro-b", "A small light", 2),
  pointV4("p-2", "The path", 1),
  pointV4("p-2a", "Lit one step at a time", 2),
  pointV4("concl", "Conclusion", 1, { role: "conclusion" }),
  proseV4("Walk in the light you have.", 1),
  pointV4("concl-a", "Take the next step", 2),
  proseV4("A closing word, the document's own.", 0),
]);

/** Writing first, structure later: a manuscript that happens to hold one point. */
export const writingFirst = documentV4([
  proseV4("The sermon begins as writing, with no structure at all.", 0),
  proseV4("A second paragraph, still just writing.", 0),
  pointV4("p-only", "One point, added when it was wanted", 1),
  proseV4("Writing under that point.", 1),
  proseV4("And writing after it, the document's again.", 0),
]);

export const v4Fixtures = { parentProse, rolesAnywhere, writingFirst } as const;
export type V4FixtureId = keyof typeof v4Fixtures;
