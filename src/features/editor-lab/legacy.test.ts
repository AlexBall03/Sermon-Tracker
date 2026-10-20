import { describe, expect, it } from "vitest";

import { numberOutline } from "@/features/outlines/numbering";
import { orderEntries } from "@/features/outlines/tree";
import { legacyFixtures, powerOfGodsWord, type LegacyFixtureId } from "./fixtures";
import {
  documentToLegacy,
  legacyToDocument,
  shownOutline,
  type LegacyEntry,
  type LegacyOutline,
} from "./legacy";
import { layoutFromNumbering } from "./layout";
import { migrateDocument } from "./migrate";
import { documentLabels } from "./numbering";
import { labSchema } from "./schema/extensions";
import { testEditor } from "./testing";
import { restoreDocument } from "./validate";

const schema = labSchema();
const byId = (entries: LegacyEntry[]) => [...entries].sort((a, b) => (a.id < b.id ? -1 : 1));

function convert(outline: LegacyOutline) {
  const result = legacyToDocument(outline);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result;
}

/** Fixtures whose rows keep every constraint the tables enforce. */
const wellFormed: LegacyFixtureId[] = [
  "empty",
  "minimal",
  "sections",
  "nested",
  "custom",
  "reusedPoints",
  "passages",
  "whitespace",
  "stress",
];

describe("legacy outline → document → legacy", () => {
  it.each(wellFormed)("%s converts with no issue, deterministically, and loads", (name) => {
    const outline = legacyFixtures[name];
    const first = convert(outline);
    expect(first.issues).toEqual([]);
    expect(JSON.stringify(convert(outline).doc)).toBe(JSON.stringify(first.doc));
    const restored = restoreDocument(first.doc, schema);
    expect(restored.ok ? [] : restored.problems).toEqual([]);
  });

  it.each(wellFormed)("%s comes back exactly, with nothing lost", (name) => {
    const outline = legacyFixtures[name];
    const back = documentToLegacy(convert(outline).doc);
    expect(back.losses).toEqual([]);
    expect(byId(back.outline.entries)).toEqual(byId(outline.entries));
    expect(back.outline.numbering).toEqual(outline.numbering);
    expect(back.outline.id).toBe(outline.id);
    expect(back.outline.revision).toBe(outline.revision);
  });

  it.each(wellFormed)("%s converts idempotently", (name) => {
    const once = convert(legacyFixtures[name]).doc;
    const twice = convert(documentToLegacy(once).outline).doc;
    expect(twice).toEqual(once);
  });

  it.each(wellFormed)("%s keeps order, hierarchy, labels, passages, and provenance", (name) => {
    const outline = legacyFixtures[name];
    const doc = schema.nodeFromJSON(convert(outline).doc);
    const { placed, labels } = documentLabels(doc);
    const legacy = orderEntries(outline.entries);
    // Same entries, in the same order, at the same depth and path.
    expect(placed.map(({ id, type, depth, path }) => ({ id, type, depth, path }))).toEqual(
      legacy.map(({ id, type, depth, path }) => ({ id, type, depth, path })),
    );
    // The same labels the outline editor shows.
    expect(labels).toEqual(numberOutline(legacy, outline.numbering));
    // Every passage, in order, and every node's provenance.
    const found = new Map<string, { refs: unknown[]; attrs: Record<string, unknown> }>();
    doc.descendants((node) => {
      if (typeof node.attrs.legacyEntryId === "string") {
        const refs: unknown[] = [];
        node.forEach((child) => {
          if (child.type.name === "scripturePassage") {
            const { id: _id, translation, print, appearance, ...numbers } = child.attrs;
            void _id;
            // Converted passages follow the document's translation and print as references.
            expect({ translation, print, appearance }).toEqual({
              translation: null,
              print: "reference",
              appearance: null,
            });
            refs.push(numbers);
          }
        });
        found.set(node.attrs.legacyEntryId, { refs, attrs: node.attrs });
      }
      return true;
    });
    expect(found.size).toBe(outline.entries.length);
    for (const entry of outline.entries) {
      const node = found.get(entry.id)!;
      expect(node.refs).toEqual(entry.references);
      expect(node.attrs.id).toBe(entry.id);
      expect(node.attrs.legacyRevision).toBe(entry.revision);
      if (entry.type === "point") expect(node.attrs.sourcePointId).toBe(entry.sourcePointId);
    }
  });

  it("keeps a reused source point on each entry made from it", () => {
    const doc = schema.nodeFromJSON(convert(legacyFixtures.reusedPoints).doc);
    const sources: [string, string | null][] = [];
    doc.descendants((node) => {
      if (node.type.name === "outlinePoint")
        sources.push([node.attrs.id, node.attrs.sourcePointId]);
      return true;
    });
    expect(sources).toEqual([
      ["r-1", "saved-grace"],
      ["r-2", "saved-grace"],
      ["r-2a", "saved-faith"],
    ]);
  });
});

describe("notes and whitespace", () => {
  const cases: [string, string | null][] = [
    ["null", null],
    ["empty string", ""],
    ["one line", "One line"],
    ["blank line between", "First\n\nSecond"],
    ["several blank lines", "First\n\n\n\nSecond"],
    ["leading and trailing spaces", "   spaced   "],
    ["leading newline", "\nafter a newline"],
    ["trailing newline", "before a newline\n"],
    ["only newlines", "\n\n\n"],
    ["only spaces", "     "],
    ["tabs", "\tone\n\t\ttwo"],
    ["spaces at line ends", "a  \n  b  \n"],
    ["carriage return", "Windows\r\nline\r\n"],
    ["unicode separators", "line\u2028separator and\u00a0no-break space"],
  ];

  const withNotes = (notes: string | null): LegacyOutline => ({
    id: "fx-notes",
    revision: 1,
    numbering: { version: 1, preset: "traditional" },
    entries: [
      {
        id: "only",
        parentId: null,
        type: "point",
        position: 0,
        title: "Notes",
        notes,
        revision: 1,
        references: [],
        sourcePointId: null,
      },
    ],
  });

  it.each(cases)("%s comes back character for character through JSON", (_name, notes) => {
    const back = documentToLegacy(convert(withNotes(notes)).doc);
    expect(back.losses).toEqual([]);
    expect(back.outline.entries[0].notes).toBe(notes);
  });

  it.each(cases)("%s comes back character for character through the editor", (_name, notes) => {
    const editor = testEditor(convert(withNotes(notes)).doc);
    const reloaded = documentToLegacy(editor.getJSON());
    expect(reloaded.outline.entries[0].notes).toBe(notes);
    editor.destroy();
  });

  it("keeps the whitespace fixture exactly, through the editor", () => {
    const outline = legacyFixtures.whitespace;
    const editor = testEditor(convert(outline).doc);
    const back = documentToLegacy(editor.getJSON());
    expect(back.losses).toEqual([]);
    expect(byId(back.outline.entries)).toEqual(byId(outline.entries));
    editor.destroy();
  });

  it("tells a null note from an empty one", () => {
    expect(convert(withNotes(null)).doc.content![0].content).toHaveLength(1);
    expect(convert(withNotes("")).doc.content![0].content).toHaveLength(2);
  });
});

describe("malformed legacy rows", () => {
  it("shows every row as orderEntries does and reports what it changed", () => {
    const outline = legacyFixtures.malformed;
    const result = convert(outline);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        { code: "duplicate_position", entryId: "m-b" },
        { code: "orphan_parent", entryId: "m-orphan", detail: "no-such-entry" },
        { code: "section_parent", entryId: "m-under-intro", detail: "m-intro" },
        { code: "cycle", entryId: "m-loop-x", detail: "m-loop-y" },
      ]),
    );
    expect(result.issues).toHaveLength(4);

    const doc = schema.nodeFromJSON(result.doc);
    const { placed, labels } = documentLabels(doc);
    const legacy = orderEntries(outline.entries);
    expect(placed.map((row) => row.id)).toEqual(legacy.map((row) => row.id));
    expect(labels).toEqual(numberOutline(legacy, outline.numbering));

    // The parent each row named is kept on the node, not lost.
    const named = new Map<string, string | null>();
    doc.descendants((node) => {
      if (node.type.name === "outlinePoint") named.set(node.attrs.id, node.attrs.legacyParentId);
      return true;
    });
    expect(named.get("m-orphan")).toBe("no-such-entry");
    expect(named.get("m-under-intro")).toBe("m-intro");
    expect(named.get("m-loop-x")).toBe("m-loop-y");
    expect(named.get("m-loop-y")).toBeNull();
  });

  it("comes back as it is shown, which is not what was stored", () => {
    const outline = legacyFixtures.malformed;
    const back = documentToLegacy(convert(outline).doc);
    expect(back.losses).toEqual([]);
    const parent = new Map(back.outline.entries.map((entry) => [entry.id, entry.parentId]));
    // Normalized: these become main points.
    expect(parent.get("m-orphan")).toBeNull();
    expect(parent.get("m-under-intro")).toBeNull();
    expect(parent.get("m-loop-x")).toBeNull();
    expect(parent.get("m-loop-y")).toBe("m-loop-x");
    // The shared position is written apart, in the order that was shown.
    const position = new Map(back.outline.entries.map((entry) => [entry.id, entry.position]));
    expect([position.get("m-a"), position.get("m-b")]).toEqual([0, 1]);
    // And it is shown exactly as before.
    expect(shownOutline(back.outline).map(({ id, depth, path }) => ({ id, depth, path }))).toEqual(
      orderEntries(outline.entries).map(({ id, depth, path }) => ({ id, depth, path })),
    );
  });

  it("refuses two introductions rather than dropping one", () => {
    const outline = legacyFixtures.sections;
    const result = legacyToDocument({
      ...outline,
      entries: [...outline.entries, { ...outline.entries[0], id: "second-intro" }],
    });
    expect(result).toEqual({
      ok: false,
      issues: [{ code: "duplicate_section", entryId: "second-intro", detail: "introduction" }],
    });
  });

  it("reports a numbering configuration the engine does not accept, and keeps it", () => {
    const broken = { version: 1, preset: "custom", levels: [] } as never;
    const result = convert({ ...legacyFixtures.minimal, numbering: broken });
    expect(result.issues).toEqual([{ code: "invalid_numbering" }]);
    expect(result.doc.attrs?.layout).toEqual(layoutFromNumbering(broken));
    expect(result.doc.attrs?.layout.numbering).toBe(broken);
    // The document still loads: the unreadable layout is a warning, kept as it is.
    const restored = restoreDocument(result.doc, schema);
    expect(restored.ok && restored.warnings).toEqual([
      { code: "invalid_layout", path: "/attrs/layout" },
    ]);
  });
});

describe("document → legacy losses", () => {
  it("reports everything in a mixed document that an entry cannot hold", () => {
    const migrated = migrateDocument(powerOfGodsWord);
    if (!migrated.ok) throw new Error("not migrated");
    const { outline, losses } = documentToLegacy(migrated.doc);
    expect(outline.entries.map((entry) => entry.id)).toEqual([
      "pw-intro",
      "pw-1",
      "pw-1a",
      "pw-1b",
      "pw-2",
      "pw-end",
    ]);
    const codes = losses.map((loss) => `${loss.code}:${loss.entryId ?? "-"}:${loss.detail ?? ""}`);
    expect(codes).toEqual(
      expect.arrayContaining([
        "top_level_block:-:paragraph",
        "top_level_block:-:blockquote",
        "formatting:pw-intro:italic",
        "formatting:pw-1:bold",
        "unsupported_block:pw-1b:bulletList",
        expect.stringMatching(/^inline_scripture:pw-1a:/),
      ]),
    );
    // The words of what could not go back are in the report.
    expect(losses.find((loss) => loss.detail === "blockquote")?.text).toContain(
      "lamp unto my feet",
    );
  });

  it("reports prose after a subpoint as out of place in the notes", () => {
    const { losses, outline } = documentToLegacy({
      type: "doc",
      attrs: { layout: layoutFromNumbering({ version: 1, preset: "traditional" }) },
      content: [
        {
          type: "outlinePoint",
          attrs: { id: "a" },
          content: [
            { type: "pointTitle", content: [{ type: "text", text: "A" }] },
            { type: "paragraph", content: [{ type: "text", text: "before" }] },
            { type: "outlinePoint", attrs: { id: "a1" }, content: [{ type: "pointTitle" }] },
            { type: "paragraph", content: [{ type: "text", text: "after" }] },
          ],
        },
      ],
    });
    expect(losses).toEqual([{ code: "interleaved_prose", entryId: "a", text: "after" }]);
    expect(outline.entries[0].notes).toBe("before\nafter");
  });
});
