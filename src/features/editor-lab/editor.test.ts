import { DOMParser as ProseMirrorDOMParser, Slice } from "@tiptap/pm/model";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { afterEach, describe, expect, it } from "vitest";

import { numberingPresetIds } from "@/features/outlines/model";
import { numberOutline, type NumberingConfig } from "@/features/outlines/numbering";
import { orderEntries } from "@/features/outlines/tree";
import { paragraph, sermonDocument } from "./documents";
import { customNumbering, legacyFixtures, powerOfGodsWord, ref, savedPoints } from "./fixtures";
import { assignIds } from "./identity";
import { documentToLegacy, legacyToDocument, type LegacyOutline } from "./legacy";
import { layoutFromNumbering } from "./layout";
import { documentLabels, numberingKey } from "./numbering";
import {
  addPoint,
  indent,
  insertPassage,
  insertReference,
  mergeWithPrevious,
  movePoint,
  outdent,
  run,
  titleEnter,
} from "./outline-commands";
import { labSchema } from "./schema/extensions";
import { ids, shape, testEditor, titleStart } from "./testing";
import type { Editor, JSONContent } from "@tiptap/core";

const schema = labSchema();
const open: Editor[] = [];
afterEach(() => {
  for (const editor of open.splice(0)) editor.destroy();
});

function editorFor(content: JSONContent) {
  const editor = testEditor(content);
  open.push(editor);
  return editor;
}

function fromLegacy(outline: LegacyOutline) {
  const result = legacyToDocument(outline);
  if (!result.ok) throw new Error("conversion refused");
  return editorFor(result.doc);
}

const cursorIn = (editor: Editor, id: string, offset = 0) =>
  editor.view.dispatch(
    editor.state.tr.setSelection(
      TextSelection.create(editor.state.doc, titleStart(editor, id) + offset),
    ),
  );

const labels = (editor: Editor) => numberingKey.getState(editor.state)!.labels;

describe("JSON round trip in the editor", () => {
  const fixtures = Object.entries(legacyFixtures).filter(([name]) => name !== "malformed");

  it.each(fixtures)("%s: getJSON → load → getJSON is stable", (_name, outline) => {
    const editor = fromLegacy(outline);
    const first = editor.getJSON();
    const again = editorFor(first).getJSON();
    expect(again).toEqual(first);
    // The document attributes travel with it.
    expect(first.attrs?.layout).toEqual(layoutFromNumbering(outline.numbering));
    expect(first.attrs?.schemaVersion).toBe(3);
    expect(first.attrs?.legacyOutlineId).toBe(outline.id);
  });

  it("is stable for PS-1A's mixed sermon (migrated), and keeps its marks and inline passage", () => {
    const first = editorFor(powerOfGodsWord).getJSON();
    expect(editorFor(first).getJSON()).toEqual(first);
    expect(JSON.stringify(first)).toContain('"type":"italic"');
    expect(JSON.stringify(first)).toContain('"id":"pw-1a-r1"');
  });

  it("never writes a number into the document", () => {
    const editor = fromLegacy(legacyFixtures.nested);
    const json = JSON.stringify(editor.getJSON());
    for (const label of labels(editor).values()) {
      if (label) expect(json).not.toContain(`"text":"${label}`);
    }
    expect(json).not.toContain("data-label");
    expect(editor.getText()).not.toMatch(/^I\./m);
  });
});

describe("numbering", () => {
  const presets: NumberingConfig[] = [
    ...numberingPresetIds.map((preset) => ({ version: 1, preset }) as NumberingConfig),
    customNumbering,
  ];

  it.each(presets.map((config) => [config.preset, config] as const))(
    "%s matches the outline engine on every fixture",
    (_name, config) => {
      for (const outline of Object.values(legacyFixtures)) {
        const result = legacyToDocument({ ...outline, numbering: config });
        if (!result.ok) continue;
        const doc = schema.nodeFromJSON(result.doc);
        expect(documentLabels(doc).labels).toEqual(
          numberOutline(orderEntries(outline.entries), config),
        );
      }
    },
  );

  it("shows labels in the editor and draws them from the structure", () => {
    const editor = fromLegacy(legacyFixtures.nested);
    expect(labels(editor).get("n-a")).toBe("I.");
    expect(labels(editor).get("n-a1x1ii")).toBe("(1)");
    const title = editor.view.dom.querySelector('[data-id="n-a1"] > [data-type="point-title"]');
    expect(title?.getAttribute("data-label")).toBe("A.");
    expect(title?.textContent).toBe("Level two");
  });

  it("renumbers after a move, an indent, and an outdent", () => {
    const editor = fromLegacy(legacyFixtures.nested);
    cursorIn(editor, "n-b");
    expect(run(editor, movePoint("up"))).toBe(true);
    expect(labels(editor).get("n-b")).toBe("I.");
    expect(labels(editor).get("n-a")).toBe("II.");
    cursorIn(editor, "n-a");
    expect(run(editor, indent)).toBe(true);
    expect(labels(editor).get("n-a")).toBe("B.");
    expect(labels(editor).get("n-a1")).toBe("1.");
    expect(run(editor, outdent)).toBe(true);
    expect(labels(editor).get("n-a")).toBe("II.");
  });

  it("changing the configuration changes the labels and nothing else", () => {
    const editor = fromLegacy(legacyFixtures.custom);
    const before = editor.getJSON();
    expect(labels(editor).get("c-a")).toBe("POINT I:");
    expect(labels(editor).get("c-a1")).toBe("(a)");
    // Composite: the levels above, each in its own level's style.
    expect(labels(editor).get("c-a1x")).toBe("I.a.1.");
    // Overflow repeats from level two.
    expect(labels(editor).get("c-a1x1")).toBe("(a)");
    const layout = editor.state.doc.attrs.layout;
    editor.view.dispatch(
      editor.state.tr.setDocAttribute("layout", {
        ...layout,
        numbering: { version: 1, preset: "decimal" },
      }),
    );
    expect(labels(editor).get("c-a1x")).toBe("1.1.1.");
    expect(labels(editor).get("c-a")).toBe("1.");
    const after = editor.getJSON();
    expect({ ...after, attrs: { ...after.attrs, layout: null } }).toEqual({
      ...before,
      attrs: { ...before.attrs, layout: null },
    });
    // And back again, exactly, in one undo.
    editor.commands.undo();
    expect(editor.getJSON()).toEqual(before);
    editor.view.dispatch(
      editor.state.tr.setDocAttribute("layout", { ...layout, numbering: customNumbering }),
    );
    expect(editor.getJSON()).toEqual(before);
  });

  it("numbers a 500-entry outline as the engine does", () => {
    const editor = fromLegacy(legacyFixtures.stress);
    expect(labels(editor)).toEqual(
      numberOutline(orderEntries(legacyFixtures.stress.entries), legacyFixtures.stress.numbering),
    );
    expect(labels(editor).size).toBe(500);
  });
});

describe("moving points", () => {
  it("moves a point with everything under it and keeps every ID", () => {
    const editor = fromLegacy(legacyFixtures.nested);
    const before = new Set(ids(editor));
    cursorIn(editor, "n-a1", 3);
    expect(run(editor, movePoint("down"))).toBe(true);
    expect(shape(editor)).toEqual([
      "Level one, first",
      "  Level two, second",
      "  Level two",
      "    Level three",
      "      Level four",
      "        Level five",
      "          Level six",
      "Level one, second",
      "  Under the second",
    ]);
    expect(new Set(ids(editor))).toEqual(before);
    // The cursor went with it.
    expect(editor.state.selection.from).toBe(titleStart(editor, "n-a1") + 3);
    // Provenance is untouched.
    const legacy = documentToLegacy(editor.getJSON());
    expect(legacy.outline.entries.find((entry) => entry.id === "n-a1")?.revision).toBe(1);
  });

  it("refuses moves that cannot happen", () => {
    const editor = fromLegacy(legacyFixtures.sections);
    cursorIn(editor, "sec-intro");
    expect(run(editor, movePoint("down"))).toBe(false);
    expect(run(editor, indent)).toBe(false);
    cursorIn(editor, "sec-1");
    expect(run(editor, movePoint("up"))).toBe(false);
    expect(run(editor, indent)).toBe(false);
    expect(run(editor, outdent)).toBe(false);
  });

  it("indents into the point above and outdents to after its parent", () => {
    const editor = fromLegacy(legacyFixtures.sections);
    cursorIn(editor, "sec-2");
    expect(run(editor, indent)).toBe(true);
    expect(shape(editor)).toEqual([
      "§Introduction",
      "First point",
      "  Second point",
      "§Conclusion",
    ]);
    expect(run(editor, outdent)).toBe(true);
    expect(shape(editor)).toEqual(["§Introduction", "First point", "Second point", "§Conclusion"]);
  });

  it("undoes and redoes a move", () => {
    const editor = fromLegacy(legacyFixtures.sections);
    const before = editor.getJSON();
    cursorIn(editor, "sec-2");
    run(editor, movePoint("up"));
    expect(editor.getJSON()).not.toEqual(before);
    editor.commands.undo();
    expect(editor.getJSON()).toEqual(before);
    editor.commands.redo();
    expect(shape(editor)[1]).toBe("Second point");
  });

  it("moves a point past prose between points, and the prose stays", () => {
    const editor = editorFor(powerOfGodsWord);
    cursorIn(editor, "pw-2");
    expect(run(editor, movePoint("up"))).toBe(true);
    const top = editor.getJSON().content!.map((node) => node.attrs?.id ?? node.type);
    expect(top).toEqual(["pw-intro", "pw-2", "pw-1", "paragraph", "blockquote", "pw-end"]);
  });
});

describe("identity", () => {
  it("gives a new point a new ID, unique in the document", () => {
    const editor = fromLegacy(legacyFixtures.sections);
    cursorIn(editor, "sec-1");
    run(editor, addPoint("sibling"));
    run(editor, addPoint("child"));
    const list = ids(editor);
    expect(new Set(list).size).toBe(list.length);
    expect(list).toContain("new-1");
    expect(list).toContain("new-2");
  });

  it("gives a pasted copy a new ID; the original keeps its own", () => {
    const editor = fromLegacy(legacyFixtures.reusedPoints);
    const doc = editor.state.doc;
    const start = titleStart(editor, "r-1") - 2;
    const node = doc.nodeAt(start)!;
    // Paste a copy of the point straight before the original.
    editor.view.dispatch(editor.state.tr.insert(start, node));
    const points: Record<string, unknown>[] = [];
    editor.state.doc.descendants((child) => {
      if (child.type.name === "outlinePoint") points.push(child.attrs);
      return true;
    });
    expect(points.map((attrs) => attrs.id)).toEqual(["new-1", "r-1", "r-2", "r-2a"]);
    expect(points[0]).toMatchObject({
      derivedFrom: "r-1",
      legacyEntryId: null,
      legacyRevision: null,
      sourcePointId: "saved-grace",
    });
    expect(points[1]).toMatchObject({ id: "r-1", legacyEntryId: "r-1", derivedFrom: null });
  });

  it("re-keys a copy pasted after the original too, and a whole pasted subtree", () => {
    const editor = fromLegacy(legacyFixtures.reusedPoints);
    const start = titleStart(editor, "r-2") - 2;
    const node = editor.state.doc.nodeAt(start)!;
    editor.view.dispatch(editor.state.tr.insert(start + node.nodeSize, node));
    const list = ids(editor);
    expect(list).toEqual(["r-1", "r-2", "r-2a", "new-1", "new-2"]);
  });

  it("re-keys points pasted from HTML that carries their IDs", () => {
    const editor = fromLegacy(legacyFixtures.reusedPoints);
    const html = editor.getHTML();
    const element = document.createElement("div");
    element.innerHTML = html;
    const slice = ProseMirrorDOMParser.fromSchema(editor.schema).parseSlice(element);
    const end = editor.state.doc.content.size;
    editor.view.dispatch(editor.state.tr.replace(end, end, new Slice(slice.content, 0, 0)));
    const list = ids(editor);
    expect(list.slice(0, 3)).toEqual(["r-1", "r-2", "r-2a"]);
    expect(new Set(list).size).toBe(list.length);
    expect(list).toHaveLength(6);
  });

  it("splits a point: the first part keeps the ID, the second is new", () => {
    const editor = fromLegacy(legacyFixtures.sections);
    cursorIn(editor, "sec-2", "Second".length);
    expect(run(editor, titleEnter)).toBe(true);
    const points: Record<string, unknown>[] = [];
    const titles: string[] = [];
    editor.state.doc.descendants((node) => {
      if (node.type.name === "outlinePoint") {
        points.push(node.attrs);
        titles.push(node.firstChild!.textContent);
      }
      return true;
    });
    expect(titles).toEqual(["First point", "Second", " point"]);
    expect(points[1]).toMatchObject({ id: "sec-2", legacyEntryId: "sec-2" });
    expect(points[2]).toMatchObject({ id: "new-1", derivedFrom: "sec-2", legacyEntryId: null });
  });

  it("opens notes at the end of a title instead of splitting", () => {
    const editor = fromLegacy(legacyFixtures.sections);
    cursorIn(editor, "sec-1", "First point".length);
    expect(run(editor, titleEnter)).toBe(true);
    expect(editor.state.selection.$from.parent.type.name).toBe("paragraph");
    expect(ids(editor)).not.toContain("new-1");
  });

  it("merges a point into the one before: the first ID wins and the second retires", () => {
    const editor = fromLegacy(legacyFixtures.sections);
    cursorIn(editor, "sec-2");
    expect(run(editor, mergeWithPrevious)).toBe(true);
    expect(ids(editor)).not.toContain("sec-2");
    const legacy = documentToLegacy(editor.getJSON()).outline.entries;
    const merged = legacy.find((entry) => entry.id === "sec-1")!;
    expect(merged.title).toBe("First pointSecond point");
    expect(merged.notes).toBe("Explain.\nApply.");
    expect(editor.state.selection.from).toBe(titleStart(editor, "sec-1") + "First point".length);
  });

  it("keeps IDs through a save and a reload", () => {
    const editor = editorFor(powerOfGodsWord);
    const before = ids(editor);
    expect(ids(editorFor(JSON.parse(JSON.stringify(editor.getJSON()))))).toEqual(before);
  });

  it("inserts the same saved point twice as two separate points, and never changes it", () => {
    const frozen = JSON.stringify(savedPoints);
    const editor = fromLegacy(legacyFixtures.minimal);
    cursorIn(editor, "min-1");
    const saved = savedPoints[0];
    const seed = { ...saved, references: [...saved.references], sourcePointId: saved.id };
    run(editor, addPoint("sibling", seed));
    run(editor, addPoint("sibling", seed));
    const inserted: Record<string, unknown>[] = [];
    editor.state.doc.descendants((node) => {
      if (node.type.name === "outlinePoint" && node.attrs.sourcePointId === saved.id) {
        inserted.push(node.attrs);
      }
      return true;
    });
    expect(inserted).toHaveLength(2);
    expect(inserted[0].id).not.toBe(inserted[1].id);
    // Each copy is its own: editing one leaves the other alone.
    editor.view.dispatch(
      editor.state.tr.insertText("Edited ", titleStart(editor, inserted[0].id as string)),
    );
    const back = documentToLegacy(editor.getJSON()).outline.entries.filter(
      (entry) => entry.sourcePointId === saved.id,
    );
    expect(back.map((entry) => entry.title).sort()).toEqual([
      "Edited Grace that saves",
      "Grace that saves",
    ]);
    expect(back.every((entry) => entry.notes === saved.notes)).toBe(true);
    expect(JSON.stringify(savedPoints)).toBe(frozen);
  });

  it("gives JSON missing or duplicate IDs unique ones before loading", () => {
    let n = 0;
    const fixed = assignIds(
      {
        type: "doc",
        content: [
          {
            type: "outlinePoint",
            attrs: { id: "a", legacyEntryId: "a" },
            content: [{ type: "pointTitle" }],
          },
          {
            type: "outlinePoint",
            attrs: { id: "a", legacyEntryId: "a" },
            content: [{ type: "pointTitle" }],
          },
          { type: "outlinePoint", content: [{ type: "pointTitle" }] },
        ],
      },
      () => `fresh-${(n += 1)}`,
    );
    expect(fixed.content!.map((node) => node.attrs)).toEqual([
      { id: "a", legacyEntryId: "a" },
      { id: "fresh-1", legacyEntryId: null, derivedFrom: "a" },
      { id: "fresh-2" },
    ]);
  });
});

describe("Scripture references", () => {
  it("inserts a passage inline and shows its words, not its verses", () => {
    const editor = editorFor(powerOfGodsWord);
    const at =
      titleStart(editor, "pw-2") -
      2 +
      editor.state.doc.nodeAt(titleStart(editor, "pw-2") - 2)!.firstChild!.nodeSize +
      2;
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, at)));
    expect(run(editor, insertReference(ref(59, 1, 22)))).toBe(true);
    const span = editor.view.dom.querySelector('[data-book="59"]');
    expect(span?.textContent).toBe("James 1:22");
    expect(JSON.stringify(editor.getJSON())).not.toContain("James 1:22");
  });

  it("adds a passage block after a point's title and the passages already there", () => {
    const editor = fromLegacy(legacyFixtures.passages);
    cursorIn(editor, "p-2");
    expect(run(editor, insertPassage(ref(43, 3, 16)))).toBe(true);
    const back = documentToLegacy(editor.getJSON());
    expect(back.outline.entries[1].references).toEqual([
      ...legacyFixtures.passages.entries[1].references,
      ref(43, 3, 16),
    ]);
    // A passage a person inserts prints in full, which a legacy entry cannot say.
    expect(back.losses).toEqual([{ code: "passage_print", entryId: "p-2", detail: "full" }]);
    // An eleventh passage is a document's to hold; the projection reports it.
    cursorIn(editor, "p-1");
    expect(run(editor, insertPassage(ref(43, 3, 16)))).toBe(true);
    expect(documentToLegacy(editor.getJSON()).losses).toContainEqual({
      code: "over_limit",
      entryId: "p-1",
      detail: "references",
    });
  });

  it("puts an inline reference in a title, where v2 allows one", () => {
    const editor = fromLegacy(legacyFixtures.minimal);
    cursorIn(editor, "min-1", "The one point".length);
    expect(run(editor, insertReference(ref(43, 3, 16)))).toBe(true);
    const title = (editor.getJSON() as JSONContent).content![0].content![0];
    expect(title.content!.at(-1)).toMatchObject({
      type: "scriptureReference",
      attrs: { book: 43, translation: null, display: "reference" },
    });
  });

  it("survives edits beside it, and is deleted whole", () => {
    const editor = editorFor(powerOfGodsWord);
    const find = () => {
      let pos = -1;
      editor.state.doc.descendants((node, p) => {
        if (node.attrs.id === "pw-1a-r1") pos = p;
        return pos < 0;
      });
      return pos;
    };
    const pos = find();
    editor.view.dispatch(editor.state.tr.insertText("very ", pos - 10));
    editor.view.dispatch(editor.state.tr.insertText("!", find() + 1));
    const node = editor.state.doc.nodeAt(find())!;
    expect(node.attrs).toMatchObject({ book: 40, chapterStart: 24, verseStart: 35 });
    editor.view.dispatch(
      editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, find())),
    );
    editor.view.dispatch(editor.state.tr.deleteSelection());
    expect(find()).toBe(-1);
  });

  it("is taken from pasted HTML only when it is a passage of the Bible", () => {
    const editor = editorFor(sermonDocument([paragraph()]));
    const parse = (html: string) => {
      const element = document.createElement("div");
      element.innerHTML = html;
      return ProseMirrorDOMParser.fromSchema(editor.schema).parse(element).toJSON();
    };
    const good = parse(
      '<p>See <span data-type="scripture-reference" data-id="x" data-book="43" data-chapter-start="3" data-verse-start="16">John 3:16</span></p>',
    );
    expect(JSON.stringify(good)).toContain('"type":"scriptureReference"');
    const bad = parse(
      '<p>See <span data-type="scripture-reference" data-book="43" data-chapter-start="99" data-verse-start="1">John 99:1</span></p>',
    );
    expect(JSON.stringify(bad)).not.toContain("scriptureReference");
    expect(JSON.stringify(bad)).toContain("John 99:1");
  });

  it("copies as its words in plain text", () => {
    const editor = editorFor(powerOfGodsWord);
    expect(editor.getText()).toContain("Matthew 24:35");
  });
});
