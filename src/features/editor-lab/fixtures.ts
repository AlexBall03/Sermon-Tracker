import type { JSONContent } from "@tiptap/core";

import { outlineLimits } from "@/features/outlines/model";
import type { NumberingConfig } from "@/features/outlines/numbering";
import type { ScriptureReference } from "@/features/scripture/reference";
import type { LegacyEntry, LegacyOutline } from "./legacy";

/*
 * Fixture outlines and documents for the editor lab. They are test data, not
 * interface (migration document §15.3), are built the same way every time,
 * and stand for no real sermon or account.
 */

/** A passage. */
export const ref = (
  book: number,
  chapterStart: number,
  verseStart: number | null = null,
  verseEnd: number | null = null,
  chapterEnd: number | null = null,
): ScriptureReference => ({ book, chapterStart, verseStart, chapterEnd, verseEnd });

const books = {
  genesis: 1,
  joshua: 6,
  psalms: 19,
  proverbs: 20,
  isaiah: 23,
  matthew: 40,
  john: 43,
  romans: 45,
  timothy2: 55,
  hebrews: 58,
  james: 59,
  peter1: 60,
  jude: 65,
} as const;

type EntrySeed = Partial<LegacyEntry> & Pick<LegacyEntry, "id">;

/** An entry with everything it does not name left plain. */
const entry = (seed: EntrySeed): LegacyEntry => ({
  parentId: null,
  type: "point",
  position: 0,
  title: "",
  notes: null,
  revision: 1,
  references: [],
  sourcePointId: null,
  ...seed,
});

const outline = (
  id: string,
  entries: LegacyEntry[],
  numbering: NumberingConfig = { version: 1, preset: "traditional" },
): LegacyOutline => ({ id, revision: 7, numbering, entries });

export const customNumbering: NumberingConfig = {
  version: 1,
  preset: "custom",
  levels: [
    {
      counter: "roman",
      case: "upper",
      bullet: "•",
      prefix: "POINT ",
      suffix: ":",
      composite: false,
      separator: ".",
    },
    {
      counter: "alpha",
      case: "lower",
      bullet: "•",
      prefix: "(",
      suffix: ")",
      composite: false,
      separator: ".",
    },
    {
      counter: "decimal",
      case: "upper",
      bullet: "•",
      prefix: "",
      suffix: ".",
      composite: true,
      separator: ".",
    },
  ],
  overflow: "repeat",
  repeatFrom: 1,
};

/** The legacy outlines the conversion is tried on. */
export const legacyFixtures = {
  empty: outline("fx-empty", []),

  minimal: outline("fx-minimal", [entry({ id: "min-1", title: "The one point" })]),

  sections: outline("fx-sections", [
    entry({
      id: "sec-intro",
      type: "introduction",
      title: "Introduction",
      notes: "Open with a question.",
    }),
    entry({ id: "sec-1", position: 0, title: "First point" }),
    entry({ id: "sec-2", position: 1, title: "Second point", notes: "Explain.\nApply." }),
    entry({ id: "sec-end", type: "conclusion", title: "Conclusion", notes: "Call to respond." }),
  ]),

  nested: outline("fx-nested", [
    entry({ id: "n-a", position: 0, title: "Level one, first" }),
    entry({ id: "n-a1", parentId: "n-a", position: 0, title: "Level two" }),
    entry({ id: "n-a1x", parentId: "n-a1", position: 0, title: "Level three" }),
    entry({ id: "n-a1x1", parentId: "n-a1x", position: 0, title: "Level four" }),
    entry({ id: "n-a1x1i", parentId: "n-a1x1", position: 0, title: "Level five" }),
    entry({ id: "n-a1x1ii", parentId: "n-a1x1i", position: 0, title: "Level six" }),
    entry({ id: "n-a2", parentId: "n-a", position: 1, title: "Level two, second" }),
    entry({ id: "n-b", position: 1, title: "Level one, second" }),
    entry({ id: "n-b1", parentId: "n-b", position: 0, title: "Under the second" }),
  ]),

  custom: outline(
    "fx-custom",
    [
      entry({ id: "c-intro", type: "introduction", title: "Introduction" }),
      entry({ id: "c-a", position: 0, title: "Main" }),
      entry({ id: "c-a1", parentId: "c-a", position: 0, title: "Sub" }),
      entry({ id: "c-a1x", parentId: "c-a1", position: 0, title: "Composite" }),
      entry({
        id: "c-a1x1",
        parentId: "c-a1x",
        position: 0,
        title: "Overflow repeats from level two",
      }),
      entry({ id: "c-b", position: 1, title: "Second main" }),
    ],
    customNumbering,
  ),

  reusedPoints: outline("fx-reused", [
    entry({ id: "r-1", position: 0, title: "Grace that saves", sourcePointId: "saved-grace" }),
    entry({ id: "r-2", position: 1, title: "Grace that teaches", sourcePointId: "saved-grace" }),
    entry({
      id: "r-2a",
      parentId: "r-2",
      position: 0,
      title: "Faith comes by hearing",
      sourcePointId: "saved-faith",
    }),
  ]),

  passages: outline("fx-passages", [
    entry({
      id: "p-1",
      position: 0,
      title: "Ten passages, in their stored order",
      references: [
        ref(books.psalms, 12, 6, 7),
        ref(books.psalms, 119, 105),
        ref(books.timothy2, 3, 16, 17),
        ref(books.hebrews, 4, 12),
        ref(books.isaiah, 40, 8),
        ref(books.matthew, 24, 35),
        ref(books.peter1, 1, 23, 25),
        ref(books.proverbs, 30, 5),
        ref(books.john, 17, 17),
        ref(books.romans, 10, 17),
      ],
    }),
    entry({
      id: "p-2",
      position: 1,
      title: "Whole chapter, across chapters, a one-chapter book",
      references: [ref(books.psalms, 23), ref(books.genesis, 1, 1, 3, 2), ref(books.jude, 1, 3)],
    }),
  ]),

  whitespace: outline("fx-whitespace", [
    entry({ id: "w-1", position: 0, title: "Blank lines", notes: "First\n\nSecond\n\n\nThird" }),
    entry({ id: "w-2", position: 1, title: "Edges", notes: "  leading and trailing  " }),
    entry({ id: "w-3", position: 2, title: "Trailing newline", notes: "Ends with a newline\n" }),
    entry({ id: "w-4", position: 3, title: "Only newlines", notes: "\n\n" }),
    entry({ id: "w-5", position: 4, title: "Empty string", notes: "" }),
    entry({
      id: "w-6",
      position: 5,
      title: "Tabs and spaces",
      notes: "\tindented\n    four spaces\n \t ",
    }),
    entry({ id: "w-7", position: 6, title: "Carriage return", notes: "Windows\r\nline" }),
    entry({ id: "w-8", position: 7, title: "  padded title  ", notes: null }),
  ]),

  malformed: outline("fx-malformed", [
    entry({ id: "m-intro", type: "introduction", title: "Introduction" }),
    entry({ id: "m-a", position: 0, title: "A fine main point" }),
    entry({ id: "m-b", position: 0, title: "Shares position 0 with A" }),
    entry({
      id: "m-orphan",
      parentId: "no-such-entry",
      position: 0,
      title: "Names a parent that is gone",
    }),
    entry({
      id: "m-under-intro",
      parentId: "m-intro",
      position: 0,
      title: "Under the introduction",
    }),
    entry({ id: "m-loop-x", parentId: "m-loop-y", position: 0, title: "Loop X" }),
    entry({ id: "m-loop-y", parentId: "m-loop-x", position: 0, title: "Loop Y" }),
  ]),

  stress: stressOutline(outlineLimits.entries),
} satisfies Record<string, LegacyOutline>;

export type LegacyFixtureId = keyof typeof legacyFixtures;

/**
 * A large outline of `size` entries (sections included): main points with
 * subpoints three levels deep, notes on every point and a passage on every
 * fifth. Deterministic.
 */
export function stressOutline(size: number): LegacyOutline {
  const entries: LegacyEntry[] = [
    entry({ id: "s-intro", type: "introduction", title: "Introduction", notes: "Opening words." }),
    entry({ id: "s-end", type: "conclusion", title: "Conclusion", notes: "Closing words." }),
  ];
  let main = 0;
  let count = entries.length;
  while (count < size) {
    const mainId = `s-${main}`;
    entries.push(
      entry({
        id: mainId,
        position: main,
        title: `Main point ${main + 1}`,
        notes: `Notes for main point ${main + 1}.`,
      }),
    );
    count += 1;
    for (let sub = 0; sub < 3 && count < size; sub += 1) {
      const subId = `${mainId}-${sub}`;
      entries.push(
        entry({
          id: subId,
          parentId: mainId,
          position: sub,
          title: `Subpoint ${sub + 1}`,
          notes: `Supporting explanation ${count}.\nA second line.`,
          references: count % 5 === 0 ? [ref(books.john, 1 + (count % 21), 1)] : [],
        }),
      );
      count += 1;
      for (let deep = 0; deep < 2 && count < size; deep += 1) {
        entries.push(
          entry({
            id: `${subId}-${deep}`,
            parentId: subId,
            position: deep,
            title: `Detail ${deep + 1}`,
            notes: "Illustration.",
          }),
        );
        count += 1;
      }
    }
    main += 1;
  }
  return outline("fx-stress", entries);
}

/** Saved point ideas, as the library would offer them. Frozen: inserting one must never change it. */
export const savedPoints = Object.freeze([
  Object.freeze({
    id: "saved-grace",
    title: "Grace that saves",
    notes: "Not of works, lest any man should boast.",
    references: Object.freeze([Object.freeze(ref(books.romans, 10, 17))]),
  }),
  Object.freeze({
    id: "saved-faith",
    title: "Faith comes by hearing",
    notes: null,
    references: Object.freeze([] as ScriptureReference[]),
  }),
]);

const text = (value: string, marks?: string[]): JSONContent =>
  marks
    ? { type: "text", text: value, marks: marks.map((type) => ({ type })) }
    : { type: "text", text: value };
const paragraph = (...content: JSONContent[]): JSONContent => ({ type: "paragraph", content });
const title = (value: string): JSONContent => ({ type: "entryTitle", content: [text(value)] });
const passage = (id: string, reference: ScriptureReference): JSONContent => ({
  type: "scriptureReference",
  attrs: { id, ...reference },
});
const point = (
  id: string,
  content: JSONContent[],
  attrs: Record<string, unknown> = {},
): JSONContent => ({
  type: "outlinePoint",
  attrs: { id, ...attrs },
  content,
});

/** The mixed sermon the lab opens with: outline and manuscript in one document. */
export const powerOfGodsWord: JSONContent = {
  type: "doc",
  attrs: {
    schemaVersion: 1,
    numbering: { version: 1, preset: "traditional" },
    legacyOutlineId: null,
    legacyRevision: null,
  },
  content: [
    {
      type: "sermonIntroduction",
      attrs: { id: "pw-intro" },
      content: [
        title("Introduction"),
        paragraph(
          text("Every generation has asked whether God has spoken, and whether what He said has "),
          text("lasted", ["italic"]),
          text("."),
        ),
        paragraph(text("Tonight we open the Book itself and let it answer for itself.")),
      ],
    },
    point("pw-1", [
      title("The Word of God Is Pure"),
      { type: "entryPassages", content: [passage("pw-1-r1", ref(books.psalms, 12, 6, 7))] },
      paragraph(text("The words of the LORD are "), text("pure words", ["bold"]), text(".")),
      point("pw-1a", [
        title("Its Preservation"),
        paragraph(
          text("Heaven and earth shall pass away; His words shall not ("),
          passage("pw-1a-r1", ref(books.matthew, 24, 35)),
          text(")."),
        ),
      ]),
      point("pw-1b", [
        title("Its Authority"),
        {
          type: "entryPassages",
          content: [
            passage("pw-1b-r1", ref(books.timothy2, 3, 16, 17)),
            passage("pw-1b-r2", ref(books.hebrews, 4, 12)),
          ],
        },
        {
          type: "bulletList",
          content: [
            { type: "listItem", content: [paragraph(text("Given by inspiration"))] },
            { type: "listItem", content: [paragraph(text("Profitable for doctrine"))] },
          ],
        },
      ]),
    ]),
    point("pw-2", [
      title("Our Responsibility to God's Word"),
      paragraph(text("Be ye doers of the word, and not hearers only.")),
    ]),
    paragraph(text("A word between the points, belonging to no point: manuscript prose.")),
    {
      type: "blockquote",
      content: [paragraph(text("Thy word is a lamp unto my feet, and a light unto my path."))],
    },
    {
      type: "sermonConclusion",
      attrs: { id: "pw-end" },
      content: [title("Conclusion"), paragraph(text("Take up the Book, and read it, and do it."))],
    },
  ],
};
