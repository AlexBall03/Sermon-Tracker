import type { JSONContent } from "@tiptap/core";

import type { ScriptureReference } from "@/features/scripture/reference";
import { ref } from "../fixtures";
import { defaultLayout } from "../layout";
import type { NoteKind } from "../schema/model";
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

export const noteV4 = (
  id: string,
  text: string,
  depth: number,
  kind: NoteKind = "reminder",
): JSONContent => ({
  type: "preacherNote",
  attrs: { id, kind, print: null, depth },
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

/*
 * The visual benchmark (A1-UI.2A): a sermon as a preacher would prepare and
 * print it, with every component Balanced draws in realistic proportion.
 * The Title- and Subtitle-styled paragraphs at the top are placeholders for
 * the dedicated sermon header (A1-UI.2C): ordinary styled writing, not a
 * second title system.
 */
const styledV4 = (styleName: "title" | "subtitle", text: string): JSONContent => ({
  type: "paragraph",
  attrs: { depth: 0, styleName },
  content: words(text),
});

const proseWithRef = (
  depth: number,
  before: string,
  id: string,
  reference: ScriptureReference,
  after: string,
): JSONContent => ({
  type: "paragraph",
  attrs: { depth },
  content: [
    ...words(before),
    {
      type: "scriptureReference",
      attrs: { id, ...reference, translation: null, display: "reference" },
    },
    ...words(after),
  ],
});

const scriptV4 = (id: string, text: string, depth: number): JSONContent => ({
  type: "script",
  attrs: { id, depth },
  content: [{ type: "paragraph", content: words(text) }],
});

const quoteV4 = (text: string, depth: number): JSONContent => ({
  type: "blockquote",
  attrs: { depth },
  content: [{ type: "paragraph", content: words(text) }],
});

const bulletsV4 = (depth: number, ...list: string[]): JSONContent => ({
  type: "bulletList",
  attrs: { depth },
  content: list.map((item) => ({
    type: "listItem",
    content: [{ type: "paragraph", content: words(item) }],
  })),
});

const samuel1 = 9;
const psalms = 19;
const isaiah = 23;
const john1 = 62;

export const whenIdolsFall = documentV4([
  styledV4("title", "When Idols Fall"),
  styledV4("subtitle", "1 Samuel 5"),
  pointV4("wif-intro", "Introduction", 1, { role: "introduction" }),
  proseV4(
    "Israel had lost the ark of God. The Philistines carried it home to Ashdod as a trophy and set it beside Dagon, as though the Lord were one more god to be added to their collection.",
    1,
  ),
  passageV4("wif-s1", ref(samuel1, 5, 1, 5), 1),
  proseV4(
    "The Philistines thought they had captured God. By morning they learned that no one captures Him.",
    1,
  ),
  pointV4("wif-1", "The Lord Will Not Share His Glory", 1),
  proseV4(
    "Dagon stood in his own house, in his own city, and still he fell on his face before the ark.",
    1,
  ),
  pointV4("wif-1a", "Idols are set up beside God, not always in His place", 2),
  proseWithRef(
    2,
    "The Philistines did not throw the ark out; they made room for it. ",
    "wif-r1",
    ref(isaiah, 42, 8),
    " is the Lord's answer to every such arrangement.",
  ),
  pointV4("wif-1b", "What we bow to will eventually bow to Him", 2),
  passageV4("wif-s2", ref(isaiah, 46, 1, 2), 2),
  noteV4("wif-n1", "Pause here. Let the room picture Dagon face down on the floor.", 2),
  pointV4("wif-2", "Propping Up an Idol Cannot Save It", 1),
  proseV4(
    "They took Dagon and set him in his place again. A god who has to be picked up off the floor is no god at all.",
    1,
  ),
  pointV4("wif-2a", "The second morning was worse than the first", 2),
  proseV4(
    "His head and both his hands lay cut off upon the threshold; only the stump of Dagon was left to him.",
    2,
  ),
  pointV4("wif-2a1", "The head: the wisdom they trusted", 3),
  pointV4("wif-2a2", "The hands: the strength they relied on", 3),
  pointV4("wif-2b", "We still prop up what God has already toppled", 2),
  bulletsV4(
    2,
    "A career that has become our identity",
    "A reputation we guard more than our integrity",
    "A comfort we will not give up for obedience",
  ),
  proseV4(
    "Every one of these needs us to hold it up. That is the surest sign it was never holding us.",
    1,
  ),
  pointV4("wif-3", "The Hand of the Lord Is Heavy, and It Is Kind", 1),
  passageV4("wif-s3", ref(samuel1, 5, 6, 7), 1),
  proseV4(
    "The same hand that broke Dagon pressed on Ashdod until its people could not keep the ark. God's heaviness was a mercy: it made them let go of what was destroying them.",
    1,
  ),
  quoteV4(
    "The idols of the heart are not destroyed by being ignored, but by being exposed to the presence of God.",
    1,
  ),
  pointV4("wif-concl", "Conclusion", 1, { role: "conclusion" }),
  proseWithRef(
    1,
    "John closes his first letter with one plain command: ",
    "wif-r2",
    ref(john1, 5, 21),
    ".",
  ),
  scriptV4(
    "wif-sc1",
    "Whatever you have set up beside Him this week, you do not have to keep holding it up. Let it fall, and let the Lord stand alone in His house.",
    1,
  ),
  passageV4("wif-s4", ref(psalms, 115, 4, 8), 1),
]);

/*
 * Every component Balanced draws, side by side (A1-UI.2A.1): all seven note
 * kinds, a script, passages, an inline reference, and, in the last point,
 * a long reminder, passage, and script that run across the first pages in
 * Print Layout, to review the colored boxes where a page breaks them.
 */
const filler =
  "A paragraph of ordinary writing, long enough to fill the page the way a sermon's own explanation does: it says what the text says, why it matters, and where it is going next, so the components after it fall where a page ends.";

export const componentGallery = documentV4([
  pointV4("cg-1", "Study Notes", 1),
  proseV4("Notes made while studying, kept beside the writing they belong to.", 1),
  noteV4("cg-n1", "Why did the Philistines keep the ark for seven months?", 1, "question"),
  noteV4("cg-n2", "The statue in the old town square that the storm toppled.", 1, "illustration"),
  noteV4("cg-n3", "What have we set up beside God this week?", 1, "application"),
  noteV4("cg-n4", "Compare with Isaiah 46 and Psalm 115.", 1, "note"),
  noteV4("cg-n5", "Check the Hebrew of “threshold” in verse 5.", 1, "task"),
  pointV4("cg-2", "In the Pulpit", 1),
  proseWithRef(1, "Read ", "cg-r1", ref(samuel1, 5, 3), " slowly, then stop."),
  noteV4("cg-n6", "Slow down. Let the silence do the work.", 1, "reminder"),
  noteV4("cg-n7", "Step out from the pulpit.", 1, "cue"),
  scriptV4(
    "cg-sc1",
    "Some of you came in this morning holding something up with both hands. You can put it down.",
    1,
  ),
  passageV4("cg-s1", ref(psalms, 115, 4, 8), 1),
  noteV4("cg-n8", "Look up from the notes for the last line.", 1, "cue"),
  pointV4("cg-3", "Across a Page", 1),
  proseV4(filler, 1),
  proseV4(filler, 1),
  proseV4(filler, 1),
  noteV4(
    "cg-n9",
    "This reminder is long on purpose. It runs across the foot of a page in Print Layout, so its tint, its hairline, and its rounded corners can be checked where the page cuts it: the fill must stop at the margin, the words must stay clear of the gap, and the box must close again on the next page.",
    1,
    "reminder",
  ),
  proseV4(filler, 1),
  passageV4("cg-s2", ref(psalms, 119, 1, 16), 1),
  proseV4(filler, 1),
  scriptV4(
    "cg-sc2",
    "This script is long on purpose too. Whatever you have set up beside Him this week, you do not have to keep holding it up. Let it fall, and let the Lord stand alone in His house. He has never needed us to prop Him up; it is we who need Him to hold us. So let it fall, and let Him stand.",
    1,
  ),
  proseV4(filler, 1),
]);

export const v4Fixtures = {
  whenIdolsFall,
  componentGallery,
  parentProse,
  rolesAnywhere,
  writingFirst,
} as const;
export type V4FixtureId = keyof typeof v4Fixtures;
