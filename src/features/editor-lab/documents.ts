import type { JSONContent } from "@tiptap/core";

import type { ScriptureReference } from "@/features/scripture/reference";
import { ref } from "./fixtures";
import { layoutFromNumbering } from "./layout";
import type { ProblemCode } from "./validate";

/*
 * Schema v2 documents for the lab and its tests (PS-1B.2A). Test data, not
 * interface; they stand for no real sermon or account. Each valid document is
 * written in its canonical form (every attribute present, as the editor
 * writes it), so loading it and writing it back must give exactly this JSON.
 */

type Marks = NonNullable<JSONContent["marks"]>;

const bold = { type: "bold" };
const italic = { type: "italic" };
const underline = { type: "underline" };
const color = (value: string) => ({ type: "textStyle", attrs: { color: value } });
const highlight = (value: string) => ({ type: "highlight", attrs: { color: value } });

export const text = (value: string, ...marks: Marks): JSONContent =>
  marks.length ? { type: "text", text: value, marks } : { type: "text", text: value };

export const paragraph = (...content: JSONContent[]): JSONContent =>
  content.length
    ? { type: "paragraph", attrs: { textAlign: null }, content }
    : { type: "paragraph", attrs: { textAlign: null } };

const aligned = (textAlign: string, ...content: JSONContent[]): JSONContent => ({
  type: "paragraph",
  attrs: { textAlign },
  content,
});

const heading = (level: number, ...content: JSONContent[]): JSONContent => ({
  type: "heading",
  attrs: { textAlign: null, level },
  content,
});

const quote = (...content: JSONContent[]): JSONContent => ({ type: "blockquote", content });

const items = (list: JSONContent[][]) =>
  list.map((content) => ({ type: "listItem", content }) as JSONContent);
const bullets = (...list: JSONContent[][]): JSONContent => ({
  type: "bulletList",
  content: items(list),
});
const numbered = (...list: JSONContent[][]): JSONContent => ({
  type: "orderedList",
  attrs: { start: 1, type: null },
  content: items(list),
});

export const inlineRef = (
  id: string,
  reference: ScriptureReference,
  display = "reference",
  translation: string | null = null,
): JSONContent => ({
  type: "scriptureReference",
  attrs: { id, ...reference, translation, display },
});

export const passage = (
  id: string,
  reference: ScriptureReference,
  print = "full",
  translation: string | null = null,
): JSONContent => ({
  type: "scripturePassage",
  attrs: { id, ...reference, translation, print },
});

const note = (id: string, kind: string, content: JSONContent[], print: string | null = null) => ({
  type: "preacherNote",
  attrs: { id, kind, print },
  content,
});

const pageBreak: JSONContent = { type: "pageBreak" };

const titleOf = (type: string, content: JSONContent[]): JSONContent =>
  content.length ? { type, content } : { type };

export const point = (
  id: string,
  title: JSONContent[],
  body: JSONContent[] = [],
  attrs: Record<string, unknown> = {},
): JSONContent => ({
  type: "outlinePoint",
  attrs: {
    id,
    legacyEntryId: null,
    legacyRevision: null,
    derivedFrom: null,
    sourcePointId: null,
    legacyParentId: null,
    presentation: null,
    ...attrs,
  },
  content: [titleOf("pointTitle", title), ...body],
});

export const section = (
  id: string,
  role: string,
  title: JSONContent[],
  body: JSONContent[] = [],
): JSONContent => ({
  type: "sermonSection",
  attrs: { id, legacyEntryId: null, legacyRevision: null, derivedFrom: null, role },
  content: [titleOf("sectionTitle", title), ...body],
});

export const sermonDocument = (
  content: JSONContent[],
  attrs: Record<string, unknown> = {},
): JSONContent => ({
  type: "doc",
  attrs: {
    schemaVersion: 2,
    layout: layoutFromNumbering({ version: 1, preset: "traditional" }),
    translation: null,
    legacyOutlineId: null,
    legacyRevision: null,
    ...attrs,
  },
  content,
});

const psalm119_105 = ref(19, 119, 105);

/** A sermon in outline and manuscript together, with everything schema v2 adds. */
export const lampAndPath = sermonDocument(
  [
    heading(2, text("The Lamp and the Path")),
    aligned("center", text("Thy word is a lamp unto my feet, and a light unto my path.", italic)),
    paragraph(text("An epigraph before the introduction: "), inlineRef("lp-epi", psalm119_105)),
    section(
      "lp-intro",
      "introduction",
      [text("Introduction")],
      [paragraph(text("A dark road, and one small lamp."))],
    ),
    point(
      "lp-1",
      [text("The Word "), text("Illuminates", bold), text(" "), inlineRef("lp-1-t1", psalm119_105)],
      [
        passage("lp-1-p1", psalm119_105, "full"),
        passage("lp-1-p2", ref(43, 1, 1, 5), "reference", "rvg"),
        paragraph(
          text("It shows "),
          text("where we are", color("red")),
          text(" and "),
          text("where to step", highlight("#fde68a")),
          text("."),
        ),
        note("lp-1-n1", "illustration", [paragraph(text("The miner's lamp, one step at a time."))]),
        point(
          "lp-1a",
          [text("Its clarity", color("blue"))],
          [paragraph(text("Plain to the simple."))],
        ),
        point("lp-1b", [text("Its warmth", bold, highlight("yellow"))]),
      ],
    ),
    paragraph(text("Between the points: prose that belongs to no point.")),
    numbered(
      [paragraph(text("Read it"))],
      [paragraph(text("Believe it"))],
      [paragraph(text("Obey it"))],
    ),
    point(
      "lp-2",
      [text("Walking in the Light", italic, underline)],
      [
        passage("lp-2-p1", ref(62, 1, 7), "hidden"),
        note("lp-2-n1", "cue", [bullets([paragraph(text("Pause here."))])], "show"),
        quote(paragraph(text("If we walk in the light, as he is in the light…"))),
      ],
      { sourcePointId: "saved-light" },
    ),
    section("lp-end", "conclusion", [text("Conclusion")], [paragraph(text("Take the lamp."))]),
    paragraph(text("Now unto him that is able to keep you from falling…")),
  ],
  { translation: "kjv" },
);

/** Sections in the middle, writing before and after them, and page breaks. */
export const sectionsAnywhere = sermonDocument([
  paragraph(text("Opening prayer, before anything else.")),
  point("sa-1", [text("A point before the introduction")]),
  section("sa-intro", "introduction", [], [paragraph(text("An introduction with no title."))]),
  point("sa-2", [text("A point after it")], [paragraph(text("Its own words."))]),
  pageBreak,
  section("sa-end", "conclusion", [text("Conclusion")]),
  paragraph(text("A postscript after the conclusion.")),
  pageBreak,
  paragraph(text("Notes for the next service.")),
]);

/** A manuscript with no outline at all. */
export const manuscriptOnly = sermonDocument([
  heading(2, text("Grace")),
  paragraph(
    text("For by grace are ye saved through faith; "),
    text("and that not of yourselves", bold),
  ),
  aligned("justify", text("A justified paragraph of ordinary prose.")),
  quote(paragraph(text("It is the gift of God."))),
  bullets([paragraph(text("Not of works"))], [paragraph(text("Lest any man should boast"))]),
  numbered([paragraph(text("A numbered manuscript list is not an outline."))]),
  paragraph(
    text("The verse itself, quoted: "),
    inlineRef("ms-r1", ref(49, 2, 8), "text"),
    { type: "hardBreak" },
    text("after a line break."),
  ),
  heading(3, text("A smaller heading")),
  note("ms-n1", "question", [paragraph(text("Check the Greek of 'gift'."))], "hide"),
]);

/** An outline with no prose between its points. */
export const outlineOnly = sermonDocument(
  [
    point(
      "oo-1",
      [text("First")],
      [point("oo-1a", [text("Under the first")], [point("oo-1a1", [text("Deeper")])])],
    ),
    point("oo-2", [text("Second, restarting its count")], [], {
      presentation: { version: 1, restartAt: 3 },
    }),
    point("oo-3", [text("From a saved point")], [], {
      sourcePointId: "saved-grace",
      presentation: { version: 1, marker: { kind: "bullet", bullet: "◦" } },
    }),
  ],
  { layout: layoutFromNumbering({ version: 1, preset: "decimal" }) },
);

/**
 * Numbered sentences, so that every line of a long paragraph can be told
 * apart when pages are compared (PS-1B.2B.1). Plain test text.
 */
const sentences = (prefix: string, from: number, count: number) =>
  Array.from(
    { length: count },
    (_, index) =>
      `${prefix} ${from + index}: the word of the Lord endureth, and the grass withereth, but his mercy is from everlasting.`,
  ).join(" ");

/**
 * Print Layout's test sermon (PS-1B.2B.1): prose and points mixed, a
 * paragraph longer than a Letter page, points nested across a page, an
 * explicit page break, a whole chapter printed in full (Romans 8, collapsed
 * in Regular Layout until expanded), and passages printed as a reference and
 * hidden.
 */
export const printLayout = sermonDocument(
  [
    heading(2, text("Pages Without Seams")),
    paragraph(text(`A test sermon for Print Layout. ${sentences("Opening", 1, 4)}`)),
    section(
      "pl-intro",
      "introduction",
      [text("Introduction")],
      [paragraph(text(sentences("Introduction", 1, 6)))],
    ),
    point(
      "pl-1",
      [text("A Paragraph Longer Than a Page")],
      [paragraph(text(sentences("Long", 1, 48)))],
    ),
    point(
      "pl-2",
      [text("Points Nested Across a Page")],
      [
        paragraph(text(sentences("Second", 1, 3))),
        ...Array.from({ length: 6 }, (_, index) =>
          point(
            `pl-2-${index + 1}`,
            [text(`Subpoint ${index + 1}`)],
            [
              paragraph(text(sentences(`Sub ${index + 1}`, 1, 2))),
              point(
                `pl-2-${index + 1}a`,
                [text(`Under subpoint ${index + 1}`)],
                [paragraph(text(sentences(`Deep ${index + 1}`, 1, 1)))],
              ),
            ],
          ),
        ),
      ],
    ),
    paragraph(text("Prose after the points, before an explicit page break.")),
    pageBreak,
    point(
      "pl-3",
      [text("The Spirit of Life")],
      [
        paragraph(text("Romans 8 is printed in full:")),
        passage("pl-3-p1", ref(45, 8), "full"),
        passage("pl-3-p2", ref(43, 3, 16), "reference"),
        passage("pl-3-p3", ref(43, 3, 17), "hidden"),
        paragraph(text(sentences("After", 1, 3))),
      ],
    ),
    section(
      "pl-end",
      "conclusion",
      [text("Conclusion")],
      [paragraph(text(sentences("Closing", 1, 3)))],
    ),
  ],
  { translation: "kjv" },
);

export const documentFixtures = {
  lampAndPath,
  sectionsAnywhere,
  manuscriptOnly,
  outlineOnly,
  printLayout,
};
export type DocumentFixtureId = keyof typeof documentFixtures;

/** A copy of `base` with one change, for the invalid set. */
function altered(base: JSONContent, change: (copy: JSONContent) => void): JSONContent {
  const copy = structuredClone(base);
  change(copy);
  return copy;
}

const small = sermonDocument([
  section("i-intro", "introduction", [text("Introduction")]),
  point("i-1", [text("One")], [passage("i-1-p", ref(43, 3, 16)), paragraph(text("Body"))]),
]);
const at = (doc: JSONContent, ...path: number[]) => {
  let node = doc;
  for (const index of path) node = node.content![index];
  return node;
};

/** Documents the validator must refuse, each with the problem it must name. */
export const invalidDocuments: { name: string; json: unknown; code: ProblemCode }[] = [
  { name: "not a document", json: { type: "paragraph" }, code: "not_a_document" },
  { name: "an array", json: [small], code: "not_a_document" },
  { name: "null", json: null, code: "not_a_document" },
  {
    name: "no version",
    json: altered(small, (d) => delete d.attrs!.schemaVersion),
    code: "invalid_version",
  },
  {
    name: "a version as text",
    json: altered(small, (d) => (d.attrs!.schemaVersion = "2")),
    code: "invalid_version",
  },
  {
    name: "a newer version",
    json: altered(small, (d) => (d.attrs!.schemaVersion = 3)),
    code: "unsupported_version",
  },
  {
    name: "an unknown node",
    json: altered(small, (d) => d.content!.push({ type: "callout", content: [] })),
    code: "unknown_node",
  },
  {
    name: "a link (not enabled in v2)",
    json: altered(small, (d) => {
      at(d, 1, 0).content = [{ type: "text", text: "One", marks: [{ type: "link", attrs: {} }] }];
    }),
    code: "unknown_mark",
  },
  {
    name: "an attribute the schema does not declare",
    json: altered(small, (d) => (at(d, 1).attrs!.colour = "red")),
    code: "unknown_attribute",
  },
  {
    name: "a v1 numbering attribute on a v2 document",
    json: altered(small, (d) => (d.attrs!.numbering = { version: 1, preset: "decimal" })),
    code: "unknown_attribute",
  },
  {
    name: "a field that is not part of a node",
    json: altered(small, (d) => ((at(d, 1) as Record<string, unknown>).id = "i-1")),
    code: "unknown_field",
  },
  {
    name: "a point inside a list",
    json: altered(small, (d) =>
      d.content!.push(bullets([paragraph(text("x")), point("i-x", [text("x")])])),
    ),
    code: "schema",
  },
  {
    name: "a point inside a quotation",
    json: altered(small, (d) => d.content!.push(quote(point("i-x", [text("x")])))),
    code: "schema",
  },
  {
    name: "a point inside a note",
    json: altered(small, (d) => d.content!.push(note("i-n", "note", [point("i-x", [])]))),
    code: "schema",
  },
  {
    name: "a point inside a section",
    json: altered(small, (d) => at(d, 0).content!.push(point("i-x", [text("x")]))),
    code: "schema",
  },
  {
    name: "a section inside a point",
    json: altered(small, (d) => at(d, 1).content!.push(section("i-c", "conclusion", []))),
    code: "schema",
  },
  {
    name: "a page break inside a point",
    json: altered(small, (d) => at(d, 1).content!.push(pageBreak)),
    code: "schema",
  },
  {
    name: "a passage block inside a list",
    json: altered(small, (d) =>
      d.content!.push(bullets([paragraph(text("x")), passage("i-x", ref(43, 3, 16))])),
    ),
    code: "schema",
  },
  {
    name: "a line break in a title",
    json: altered(small, (d) => {
      at(d, 1, 0).content = [text("One"), { type: "hardBreak" }, text("Two")];
    }),
    code: "schema",
  },
  {
    name: "a point without its title",
    json: altered(small, (d) => at(d, 1).content!.shift()),
    code: "schema",
  },
  {
    name: "an empty document",
    json: altered(small, (d) => (d.content = [])),
    code: "schema",
  },
  {
    name: "a point with no ID",
    json: altered(small, (d) => (at(d, 1).attrs!.id = null)),
    code: "missing_id",
  },
  {
    name: "a passage with an empty ID",
    json: altered(small, (d) => (at(d, 1, 1).attrs!.id = "")),
    code: "missing_id",
  },
  {
    name: "two nodes with one ID",
    json: altered(small, (d) => (at(d, 1, 1).attrs!.id = "i-1")),
    code: "duplicate_id",
  },
  {
    name: "two introductions",
    json: altered(small, (d) => d.content!.push(section("i-intro-2", "introduction", []))),
    code: "duplicate_section",
  },
  {
    name: "two conclusions apart",
    json: altered(small, (d) => {
      d.content!.unshift(section("i-c1", "conclusion", []));
      d.content!.push(section("i-c2", "conclusion", []));
    }),
    code: "duplicate_section",
  },
  {
    name: "a role that is not one",
    json: altered(small, (d) => (at(d, 0).attrs!.role = "epilogue")),
    code: "invalid_attribute",
  },
  {
    name: "a section that names no role",
    json: altered(small, (d) => delete at(d, 0).attrs!.role),
    code: "invalid_attribute",
  },
  {
    name: "a print setting that is not one",
    json: altered(small, (d) => (at(d, 1, 1).attrs!.print = "always")),
    code: "invalid_attribute",
  },
  {
    name: "a translation that is not offered",
    json: altered(small, (d) => (at(d, 1, 1).attrs!.translation = "niv")),
    code: "invalid_attribute",
  },
  {
    name: "a document translation that is not offered",
    json: altered(small, (d) => (d.attrs!.translation = "niv")),
    code: "invalid_attribute",
  },
  {
    name: "an inline display that is not one",
    json: altered(small, (d) => {
      at(d, 1, 2).content = [inlineRef("i-r", ref(43, 3, 16), "verse")];
    }),
    code: "invalid_attribute",
  },
  {
    name: "a note kind that is not one",
    json: altered(small, (d) => d.content!.push(note("i-n", "joke", [paragraph()]))),
    code: "invalid_attribute",
  },
  {
    name: "a note print that is not one",
    json: altered(small, (d) => d.content!.push(note("i-n", "cue", [paragraph()], "sometimes"))),
    code: "invalid_attribute",
  },
  {
    name: "a level-one heading",
    json: altered(small, (d) => d.content!.push(heading(1, text("Too big")))),
    code: "invalid_attribute",
  },
  {
    name: "an alignment that is not one",
    json: altered(small, (d) => d.content!.push(aligned("middle", text("x")))),
    code: "invalid_attribute",
  },
  {
    name: "a presentation of another version",
    json: altered(small, (d) => (at(d, 1).attrs!.presentation = { version: 2 })),
    code: "invalid_attribute",
  },
  {
    name: "a legacy revision as text",
    json: altered(small, (d) => (at(d, 1).attrs!.legacyRevision = "3")),
    code: "invalid_attribute",
  },
  {
    name: "a named CSS color",
    json: altered(small, (d) => (at(d, 1, 0).content = [text("One", color("crimson"))])),
    code: "invalid_color",
  },
  {
    name: "a text style with no color",
    json: altered(small, (d) => (at(d, 1, 0).content = [text("One", { type: "textStyle" })])),
    code: "invalid_color",
  },
  {
    name: "an rgb() highlight (stored colors are #rrggbb)",
    json: altered(small, (d) => (at(d, 1, 0).content = [text("One", highlight("rgb(1, 2, 3)"))])),
    code: "invalid_color",
  },
  {
    name: "an uppercase hex color",
    json: altered(small, (d) => (at(d, 1, 0).content = [text("One", color("#FF0000"))])),
    code: "invalid_color",
  },
  {
    name: "a passage that is not in the Bible",
    json: altered(small, (d) => Object.assign(at(d, 1, 1).attrs!, ref(43, 22, 1))),
    code: "invalid_reference",
  },
  {
    name: "a passage not in its normal form",
    json: altered(small, (d) => Object.assign(at(d, 1, 1).attrs!, ref(43, 3, 16, 16))),
    code: "invalid_reference",
  },
];

/** A document whose layout this version cannot read: loaded with a warning, kept as it is. */
export const unreadableLayout = altered(small, (d) => {
  d.attrs!.layout = { version: 9, numbering: { version: 1, preset: "decimal" }, extra: true };
});
