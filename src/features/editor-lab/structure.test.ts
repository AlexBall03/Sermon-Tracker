import type { Editor, JSONContent } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { afterEach, describe, expect, it } from "vitest";

import type { ClipboardNotice } from "./clipboard";
import { documentFixtures, paragraph, point, section, sermonDocument, text } from "./documents";
import { legacyFixtures } from "./fixtures";
import { documentToLegacy, legacyToDocument } from "./legacy";
import {
  backspaceAfterContainer,
  duplicatePoint,
  indent,
  leaveContainer,
  mergeWithPrevious,
  movePoint,
  outdent,
  run,
  titleEnter,
  turnIntoPoint,
  turnIntoSection,
} from "./outline-commands";
import { numberingKey } from "./numbering";
import { GapCursor } from "@tiptap/pm/gapcursor";
import { ids, nodeJSON, nodePos, shape, testEditor, titleStart, topLevel } from "./testing";
import { restoreDocument } from "./validate";

/*
 * Structure and identity over the canonical document (PS-1B.1 §B.5, §B.6):
 * ownership through every operation, the identity table row by row, the
 * boundary keys, and copy and paste within and between documents.
 */

const { lampAndPath, sectionsAnywhere, outlineOnly, manuscriptOnly } = documentFixtures;

// jsdom has no ClipboardEvent; ProseMirror's pasteHTML makes one to carry the paste.
if (typeof globalThis.ClipboardEvent === "undefined") {
  (globalThis as { ClipboardEvent?: unknown }).ClipboardEvent = class extends Event {
    clipboardData = null;
  };
}

/** A key pressed in the editor, through its own key handling (selection changes included). */
function press(editor: Editor, key: string, modifiers: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...modifiers,
  });
  editor.view.someProp("handleKeyDown", (handler) => handler(editor.view, event));
}

const open: Editor[] = [];
afterEach(() => {
  for (const editor of open.splice(0)) editor.destroy();
});
function editorFor(
  content: JSONContent,
  options: { documentKey?: string; prefix?: string; notices?: ClipboardNotice[] } = {},
) {
  const editor = testEditor(content, options);
  open.push(editor);
  return editor;
}
function fromLegacy(id: keyof typeof legacyFixtures, options = {}) {
  const result = legacyToDocument(legacyFixtures[id]);
  if (!result.ok) throw new Error("not converted");
  return editorFor(result.doc, options);
}

const select = (editor: Editor, pos: number) =>
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, pos)));
const cursorIn = (editor: Editor, id: string, offset = 0) =>
  select(editor, titleStart(editor, id) + offset);
const valid = (editor: Editor) => {
  const restored = restoreDocument(editor.getJSON(), editor.schema);
  return restored.ok ? [] : restored.problems;
};

/** A node's JSON with every ID and lineage attribute taken out, to compare a copy with its original. */
function withoutIdentity(json: JSONContent): JSONContent {
  const { attrs, content, ...rest } = json;
  const next: JSONContent = { ...rest };
  if (attrs) {
    const kept = { ...attrs };
    for (const field of [
      "id",
      "derivedFrom",
      "legacyEntryId",
      "legacyRevision",
      "legacyParentId",
    ]) {
      delete kept[field];
    }
    next.attrs = kept;
  }
  if (content) next.content = content.map(withoutIdentity);
  return next;
}

/** Every identified node in a subtree: [id, derivedFrom, legacyEntryId, sourcePointId]. */
function lineage(json: JSONContent): unknown[][] {
  const rows: unknown[][] = [];
  const walk = (node: JSONContent) => {
    if (typeof node.attrs?.id === "string") {
      rows.push([
        node.attrs.id,
        node.attrs.derivedFrom ?? null,
        node.attrs.legacyEntryId ?? null,
        node.attrs.sourcePointId ?? null,
      ]);
    }
    for (const child of node.content ?? []) walk(child);
  };
  walk(json);
  return rows;
}

/** Copies the node with `id` as the browser would, and pastes it at `at` in `target`. */
function copyNode(source: Editor, id: string) {
  const pos = nodePos(source, id);
  const node = source.state.doc.nodeAt(pos)!;
  const { dom, text: plain } = source.view.serializeForClipboard(
    source.state.doc.slice(pos, pos + node.nodeSize),
  );
  return { html: dom.innerHTML, text: plain };
}
function pasteAt(target: Editor, at: number, html: string) {
  select(target, at);
  expect(target.view.pasteHTML(html)).toBe(true);
}
/** The end of the document's last textblock. */
const docEnd = (editor: Editor) => {
  let end = 0;
  editor.state.doc.descendants((node, pos) => {
    if (node.isTextblock) end = pos + 1 + node.content.size;
    return true;
  });
  return end;
};

describe("a point owns what is nested in it (§B.5)", () => {
  it("exchanges a point with the one beside it; the prose between them keeps its place", () => {
    const editor = editorFor(lampAndPath);
    const first = nodeJSON(editor, "lp-1");
    const second = nodeJSON(editor, "lp-2");
    cursorIn(editor, "lp-2", 3);
    expect(run(editor, movePoint("up"))).toBe(true);
    expect(topLevel(editor)).toEqual([
      "heading",
      "paragraph",
      "paragraph",
      "lp-intro",
      "lp-2",
      "paragraph",
      "orderedList",
      "lp-1",
      "lp-end",
      "paragraph",
    ]);
    expect(nodeJSON(editor, "lp-1")).toEqual(first);
    expect(nodeJSON(editor, "lp-2")).toEqual(second);
    expect(editor.state.selection.from).toBe(titleStart(editor, "lp-2") + 3);
    expect(valid(editor)).toEqual([]);
  });

  it("moves past a section in the middle of the document, which stays put; down undoes up", () => {
    const editor = editorFor(sectionsAnywhere);
    const original = editor.getJSON();
    cursorIn(editor, "sa-2");
    expect(run(editor, movePoint("up"))).toBe(true);
    expect(topLevel(editor).slice(0, 4)).toEqual(["paragraph", "sa-2", "sa-intro", "sa-1"]);
    expect(run(editor, movePoint("down"))).toBe(true);
    expect(editor.getJSON()).toEqual(original);
    expect(valid(editor)).toEqual([]);
  });

  it("is reversible on the smallest case: A, prose, B", () => {
    const editor = editorFor(
      sermonDocument([
        point("a", [text("A")]),
        paragraph(text("Prose between")),
        point("b", [text("B")]),
      ]),
    );
    const original = editor.getJSON();
    cursorIn(editor, "b");
    expect(run(editor, movePoint("up"))).toBe(true);
    expect(topLevel(editor)).toEqual(["b", "paragraph", "a"]);
    expect(run(editor, movePoint("down"))).toBe(true);
    expect(editor.getJSON()).toEqual(original);
    // Each move is one undo step, and redo returns it exactly.
    editor.commands.undo();
    expect(topLevel(editor)).toEqual(["b", "paragraph", "a"]);
    editor.commands.undo();
    expect(editor.getJSON()).toEqual(original);
    editor.commands.redo();
    editor.commands.redo();
    expect(editor.getJSON()).toEqual(original);
  });

  it("exchanges subpoints inside their parent, past the parent's prose, and never leaves it", () => {
    const editor = editorFor(
      sermonDocument([
        point(
          "p",
          [text("Parent")],
          [
            point("c1", [text("One")], [point("c1a", [text("Under one")])]),
            paragraph(text("The parent's own words")),
            point("c2", [text("Two")]),
          ],
        ),
        point("q", [text("Next main")]),
      ]),
    );
    const one = nodeJSON(editor, "c1");
    cursorIn(editor, "c1");
    expect(run(editor, movePoint("down"))).toBe(true);
    expect(nodeJSON(editor, "p").content!.map((n) => n.attrs?.id ?? n.type)).toEqual([
      "pointTitle",
      "c2",
      "paragraph",
      "c1",
    ]);
    expect(nodeJSON(editor, "c1")).toEqual(one);
    // The last subpoint does not move down out of its parent.
    expect(run(editor, movePoint("down"))).toBe(false);
  });

  it("keeps hierarchy, identity, numbering, and content through many moves", () => {
    const editor = editorFor(lampAndPath);
    const before = editor.getJSON();
    const labels = () => numberingKey.getState(editor.state)!.labels;
    cursorIn(editor, "lp-2", 2);
    for (let round = 0; round < 5; round += 1) {
      expect(run(editor, movePoint("up"))).toBe(true);
      expect(labels().get("lp-2")).toBe("I.");
      expect(labels().get("lp-1")).toBe("II.");
      expect(run(editor, movePoint("down"))).toBe(true);
      expect(labels().get("lp-2")).toBe("II.");
    }
    expect(editor.getJSON()).toEqual(before);
    expect(new Set(ids(editor)).size).toBe(ids(editor).length);
    expect(editor.state.selection.from).toBe(titleStart(editor, "lp-2") + 2);
  });

  it("indents, outdents, and moves to the top with everything under the point", () => {
    const editor = editorFor(outlineOnly);
    const deep = nodeJSON(editor, "oo-1a");
    cursorIn(editor, "oo-2");
    const moved = nodeJSON(editor, "oo-2");
    expect(run(editor, indent)).toBe(true);
    expect(shape(editor)).toEqual([
      "First",
      "  Under the first",
      "    Deeper",
      "  Second, restarting its count",
      "From a saved point",
    ]);
    expect(nodeJSON(editor, "oo-2")).toEqual(moved);
    expect(run(editor, outdent)).toBe(true);
    cursorIn(editor, "oo-1a1");
    expect(run(editor, movePoint("top"))).toBe(true);
    expect(shape(editor).slice(0, 3)).toEqual(["First", "  Under the first", "Deeper"]);
    // What was under oo-1a1 went with it; oo-1a lost only the moved point.
    expect(nodeJSON(editor, "oo-1a")).toEqual({ ...deep, content: deep.content!.slice(0, 1) });
  });

  it("deletes a point with everything it owns, and undo brings it back with the same IDs", () => {
    const editor = editorFor(lampAndPath);
    const before = editor.getJSON();
    const pos = nodePos(editor, "lp-1");
    editor.view.dispatch(editor.state.tr.delete(pos, pos + editor.state.doc.nodeAt(pos)!.nodeSize));
    expect(ids(editor)).not.toContain("lp-1a");
    editor.commands.undo();
    expect(editor.getJSON()).toEqual(before);
  });
});

describe("node identity (§B.6)", () => {
  it("duplicates a point: the original keeps its IDs, the copy is new throughout and says where it came from", () => {
    const editor = editorFor(lampAndPath);
    const original = nodeJSON(editor, "lp-1");
    cursorIn(editor, "lp-1", 4);
    expect(run(editor, duplicatePoint)).toBe(true);
    const copyId = topLevel(editor)[5];
    expect(copyId).toMatch(/^new-/);
    const copy = nodeJSON(editor, copyId);
    expect(nodeJSON(editor, "lp-1")).toEqual(original);
    // The same content, marks, passages, notes, and subpoints.
    expect(withoutIdentity(copy)).toEqual(withoutIdentity(original));
    // New IDs throughout; points and their copies are linked by derivedFrom.
    const rows = lineage(copy);
    expect(rows.every(([id]) => String(id).startsWith("new-"))).toBe(true);
    const points = rows.filter(([, derived]) => derived !== null).map(([, derived]) => derived);
    expect(points).toEqual(["lp-1", "lp-1a", "lp-1b"]);
    expect(new Set(ids(editor)).size).toBe(ids(editor).length);
    // The cursor is in the copy, where it was in the original.
    expect(editor.state.selection.from).toBe(titleStart(editor, copyId) + 4);
    // One undo removes it.
    editor.commands.undo();
    expect(ids(editor)).not.toContain(copyId);
  });

  it("a copy of a converted point does not claim its legacy entry; it keeps its source point", () => {
    const editor = fromLegacy("reusedPoints");
    cursorIn(editor, "r-2");
    run(editor, duplicatePoint);
    const copies = lineage(editor.getJSON()).filter(([id]) => String(id).startsWith("new-"));
    expect(copies).toEqual([
      ["new-1", "r-2", null, "saved-grace"],
      ["new-2", "r-2a", null, "saved-faith"],
    ]);
    // So the legacy projection meets each entry once.
    const back = documentToLegacy(editor.getJSON());
    expect(back.losses).toEqual([]);
    expect(back.outline.entries.filter((entry) => entry.id === "r-2")).toHaveLength(1);
  });

  it("splits a rich title: the marks and the inline passage go with their words", () => {
    const editor = editorFor(lampAndPath);
    cursorIn(editor, "lp-1", "The Word ".length);
    expect(run(editor, titleEnter)).toBe(true);
    const json = editor.getJSON();
    const first = json.content![4];
    const second = json.content![5];
    expect(first.attrs).toMatchObject({ id: "lp-1", sourcePointId: null });
    expect(first.content![0]).toEqual({ type: "pointTitle", content: [text("The Word ")] });
    // The body and the subpoints stay with the first part.
    expect(first.content!.length).toBe(nodeJSON(editorFor(lampAndPath), "lp-1").content!.length);
    expect(second.attrs).toMatchObject({
      id: "new-1",
      derivedFrom: "lp-1",
      legacyEntryId: null,
      sourcePointId: null,
    });
    expect(second.content).toEqual([
      {
        type: "pointTitle",
        content: [
          text("Illuminates", { type: "bold" }),
          text(" "),
          // The inline passage moved, so it keeps its ID.
          expect.objectContaining({
            type: "scriptureReference",
            attrs: expect.objectContaining({ id: "lp-1-t1" }),
          }),
        ],
      },
    ]);
    expect(valid(editor)).toEqual([]);
  });

  it("merges a point into the one before: titles join with their marks, the first ID survives", () => {
    const editor = editorFor(lampAndPath);
    cursorIn(editor, "lp-1b");
    expect(run(editor, mergeWithPrevious)).toBe(true);
    expect(ids(editor)).not.toContain("lp-1b");
    expect(nodeJSON(editor, "lp-1a").content).toEqual([
      {
        type: "pointTitle",
        content: [
          text("Its clarity", {
            type: "textStyle",
            attrs: { color: "blue", fontFamily: null, fontSize: null },
          }),
          text("Its warmth", { type: "bold" }, { type: "highlight", attrs: { color: "yellow" } }),
        ],
      },
      paragraph(text("Plain to the simple.")),
    ]);
    expect(editor.state.selection.from).toBe(titleStart(editor, "lp-1a") + "Its clarity".length);
  });

  it("inserts a converted point into another document with new IDs, keeping only its source point", () => {
    const source = fromLegacy("reusedPoints", { documentKey: "doc-r" });
    const target = editorFor(manuscriptOnly, { documentKey: "doc-m", prefix: "m-" });
    const { html } = copyNode(source, "r-2");
    pasteAt(target, docEnd(target), html);
    const pasted = lineage(target.getJSON()).filter(([id]) => String(id).startsWith("m-"));
    expect(pasted).toEqual([
      ["m-1", null, null, "saved-grace"],
      ["m-2", null, null, "saved-faith"],
    ]);
    // The source is untouched.
    expect(ids(source)).toEqual(["r-1", "r-2", "r-2a"]);
    expect(valid(target)).toEqual([]);
  });

  it("re-keys rich content pasted from another document and keeps all of it", () => {
    const a = editorFor(lampAndPath, { documentKey: "doc-a" });
    const b = editorFor(sectionsAnywhere, { documentKey: "doc-b", prefix: "b-" });
    const original = nodeJSON(a, "lp-2");
    pasteAt(b, docEnd(b), copyNode(a, "lp-2").html);
    const pasted = b
      .getJSON()
      .content!.find((node) => node.attrs?.sourcePointId === "saved-light")!;
    expect(withoutIdentity(pasted)).toEqual(withoutIdentity(original));
    expect(
      lineage(pasted).every(
        ([id, derived, legacy]) =>
          String(id).startsWith("b-") && derived === null && legacy === null,
      ),
    ).toBe(true);
    expect(valid(b)).toEqual([]);
  });

  it("re-keys a Script pasted from another document and keeps its words, lists, and appearance", () => {
    const a = editorFor(documentFixtures.stylesAndScript, { documentKey: "doc-a" });
    const b = editorFor(sectionsAnywhere, { documentKey: "doc-b", prefix: "b-" });
    const original = nodeJSON(a, "st-1-s");
    pasteAt(b, docEnd(b), copyNode(a, "st-1-s").html);
    const pasted = b.getJSON().content!.filter((node) => node.type === "script");
    expect(pasted).toHaveLength(1);
    expect(pasted[0].attrs!.id).toMatch(/^b-/);
    expect(withoutIdentity(pasted[0])).toEqual(withoutIdentity(original));
    expect(pasted[0].attrs!.appearance).toEqual({ accent: "#0f766e", italic: false });
    expect(valid(b)).toEqual([]);
  });

  it("gives a Script copied within its document a new ID and leaves the original's", () => {
    const editor = editorFor(documentFixtures.stylesAndScript, { documentKey: "doc-a" });
    const original = nodeJSON(editor, "st-open");
    pasteAt(editor, docEnd(editor), copyNode(editor, "st-open").html);
    const scripts = editor
      .getJSON()
      .content!.filter((node) => node.type === "script")
      .map((node) => node.attrs!.id);
    expect(scripts).toEqual(["st-open", "new-1"]);
    expect(withoutIdentity(nodeJSON(editor, "new-1"))).toEqual(withoutIdentity(original));
    expect(valid(editor)).toEqual([]);
  });

  it("treats pasted HTML that names no document as foreign, even when it carries IDs", () => {
    const editor = editorFor(lampAndPath, { documentKey: "doc-a" });
    const { html } = copyNode(editor, "lp-1b");
    const unstamped = html.replace(/ data-ps-document="[^"]*"/g, "");
    pasteAt(editor, docEnd(editor), unstamped);
    const copies = lineage(editor.getJSON()).filter(([id]) => String(id).startsWith("new-"));
    expect(copies).toEqual([["new-1", null, null, null]]);
  });

  it("a copy pasted in the same document is a copy; a cut and paste keeps its IDs", () => {
    const editor = editorFor(lampAndPath, { documentKey: "doc-a" });
    pasteAt(editor, docEnd(editor), copyNode(editor, "lp-1b").html);
    expect(lineage(editor.getJSON()).filter(([id]) => String(id).startsWith("new-"))).toEqual([
      ["new-1", "lp-1b", null, null],
    ]);

    const moved = editorFor(lampAndPath, { documentKey: "doc-c" });
    const { html } = copyNode(moved, "lp-2");
    const pos = nodePos(moved, "lp-2");
    const node = moved.state.doc.nodeAt(pos)!;
    const json = node.toJSON();
    moved.view.dispatch(moved.state.tr.delete(pos, pos + node.nodeSize));
    pasteAt(moved, docEnd(moved), html);
    expect(nodeJSON(moved, "lp-2")).toEqual(json);
    expect(ids(moved).filter((id) => id.startsWith("new-"))).toEqual([]);
  });

  it("turns a point into a section and back, keeping its ID; a section has no source point", () => {
    const editor = fromLegacy("reusedPoints");
    const before = nodeJSON(editor, "r-1");
    cursorIn(editor, "r-1", 2);
    expect(run(editor, turnIntoSection("introduction"))).toBe(true);
    expect(nodeJSON(editor, "r-1")).toMatchObject({
      type: "sermonSection",
      attrs: { id: "r-1", legacyEntryId: "r-1", role: "introduction" },
    });
    expect(editor.state.selection.from).toBe(titleStart(editor, "r-1") + 2);
    expect(run(editor, turnIntoPoint)).toBe(true);
    expect(nodeJSON(editor, "r-1")).toEqual({
      ...before,
      attrs: { ...before.attrs, sourcePointId: null },
    });
  });

  it("refuses to make a section of a point with subpoints, its own numbering, or a role the document has", () => {
    const outline = editorFor(outlineOnly);
    cursorIn(outline, "oo-1");
    expect(run(outline, turnIntoSection("introduction"))).toBe(false);
    cursorIn(outline, "oo-2");
    expect(run(outline, turnIntoSection("introduction"))).toBe(false);
    const anywhere = editorFor(sectionsAnywhere);
    cursorIn(anywhere, "sa-2");
    expect(run(anywhere, turnIntoSection("introduction"))).toBe(false);
    expect(run(anywhere, turnIntoSection("conclusion"))).toBe(false);
  });
});

describe("one introduction and one conclusion (§B.2 invariant 1)", () => {
  it("refuses a change that would make a second", () => {
    const editor = editorFor(sectionsAnywhere);
    const before = editor.getJSON();
    const intro = editor.state.doc.nodeAt(nodePos(editor, "sa-intro"))!;
    editor.view.dispatch(
      editor.state.tr.insert(0, intro.type.create({ ...intro.attrs, id: "x" }, intro.content)),
    );
    expect(editor.getJSON()).toEqual(before);
  });

  it("turns a pasted second introduction into a heading with its content, and says so", () => {
    const notices: ClipboardNotice[] = [];
    const a = editorFor(lampAndPath, { documentKey: "doc-a" });
    const b = editorFor(sectionsAnywhere, { documentKey: "doc-b", prefix: "b-", notices });
    pasteAt(b, docEnd(b), copyNode(a, "lp-intro").html);
    expect(notices).toEqual([{ code: "section_to_heading", role: "introduction" }]);
    const json = b.getJSON() as JSONContent;
    const at = json.content!.findIndex(
      (node) => node.type === "heading" && node.content?.[0]?.text === "Introduction",
    );
    expect(at).toBeGreaterThan(-1);
    expect(json.content![at + 1]).toEqual(paragraph(text("A dark road, and one small lamp.")));
    expect(valid(b)).toEqual([]);
  });

  it("keeps a pasted introduction as a section where the document has none", () => {
    const a = editorFor(lampAndPath, { documentKey: "doc-a" });
    const m = editorFor(manuscriptOnly, { documentKey: "doc-m", prefix: "m-" });
    pasteAt(m, docEnd(m), copyNode(a, "lp-intro").html);
    const sections = m.getJSON().content!.filter((node) => node.type === "sermonSection");
    expect(sections).toHaveLength(1);
    expect(sections[0].attrs).toMatchObject({
      role: "introduction",
      id: "m-1",
      legacyEntryId: null,
    });
    expect(valid(m)).toEqual([]);
  });

  it("loses nothing when a section is pasted inside a point", () => {
    const a = editorFor(lampAndPath, { documentKey: "doc-a" });
    const o = editorFor(outlineOnly, { documentKey: "doc-o", prefix: "o-" });
    pasteAt(o, titleStart(o, "oo-1a1") + 3, copyNode(a, "lp-end").html);
    // ProseMirror closes the point around the paste, so the title is split where the cursor was
    // and the conclusion lands at the top level, a section; every word is kept.
    const textOf = o.getText();
    for (const words of ["Conclusion", "Take the lamp.", "Dee", "per", "Under the first"]) {
      expect(textOf).toContain(words);
    }
    const sections = o.getJSON().content!.filter((node) => node.type === "sermonSection");
    expect(sections.map((node) => node.attrs?.role)).toEqual(["conclusion"]);
    expect(valid(o)).toEqual([]);
  });
});

describe("Enter and Backspace at structural boundaries", () => {
  it("Enter at the end of a title opens the body after the passages under it", () => {
    const editor = editorFor(lampAndPath);
    cursorIn(
      editor,
      "lp-1",
      editor.state.doc.nodeAt(nodePos(editor, "lp-1"))!.firstChild!.content.size,
    );
    expect(run(editor, titleEnter)).toBe(true);
    const content = nodeJSON(editor, "lp-1").content!;
    expect(content.slice(1, 4).map((node) => node.type)).toEqual([
      "scripturePassage",
      "scripturePassage",
      "paragraph",
    ]);
    expect(content[3]).toEqual(paragraph());
    expect(editor.state.selection.$from.parent.type.name).toBe("paragraph");
  });

  it("Enter at the start of a title opens an empty point before it; the point keeps its words and ID", () => {
    const editor = editorFor(lampAndPath);
    const before = nodeJSON(editor, "lp-2");
    cursorIn(editor, "lp-2");
    expect(run(editor, titleEnter)).toBe(true);
    expect(nodeJSON(editor, "lp-2")).toEqual(before);
    const top = topLevel(editor);
    expect(top[top.indexOf("lp-2") - 1]).toBe("new-1");
    expect(editor.state.selection.from).toBe(titleStart(editor, "lp-2"));
  });

  it("Enter on an empty last line of a point leaves the point; the line then belongs to its parent", () => {
    const editor = editorFor(lampAndPath);
    const inner = nodeJSON(editor, "lp-1a");
    const end =
      titleStart(editor, "lp-1a") -
      2 +
      editor.state.doc.nodeAt(nodePos(editor, "lp-1a"))!.nodeSize -
      2;
    select(editor, end);
    press(editor, "Enter");
    expect(nodeJSON(editor, "lp-1a").content).toHaveLength(3);
    press(editor, "Enter");
    expect(nodeJSON(editor, "lp-1a")).toEqual(inner);
    const outer = nodeJSON(editor, "lp-1").content!.map((node) => node.attrs?.id ?? node.type);
    expect(outer.slice(-3)).toEqual(["lp-1a", "paragraph", "lp-1b"]);
    expect(valid(editor)).toEqual([]);
  });

  it("Enter on an empty last line of the conclusion writes after it, at the top level", () => {
    const editor = editorFor(lampAndPath);
    const pos = nodePos(editor, "lp-end");
    select(editor, pos + editor.state.doc.nodeAt(pos)!.nodeSize - 2);
    press(editor, "Enter");
    expect(run(editor, leaveContainer)).toBe(true);
    expect(topLevel(editor).slice(-3)).toEqual(["lp-end", "paragraph", "paragraph"]);
    expect(editor.state.selection.$from.depth).toBe(1);
  });

  it("Backspace at the start of prose after a point joins it to the point's last line, and never deletes the point", () => {
    const editor = editorFor(lampAndPath);
    const before = editor.getJSON();
    const after =
      nodePos(editor, "lp-1") + editor.state.doc.nodeAt(nodePos(editor, "lp-1"))!.nodeSize;
    select(editor, after + 1);
    press(editor, "Backspace");
    // As a word processor joins two lines: the prose ends lp-1's last line (lp-1b's title).
    const title = editor.state.doc.nodeAt(nodePos(editor, "lp-1b"))!.firstChild!;
    expect(title.textContent).toBe("Its warmthBetween the points: prose that belongs to no point.");
    expect(editor.state.selection.$from.parentOffset).toBe("Its warmth".length);
    expect(ids(editor)).toEqual(ids(editorFor(lampAndPath)));
    expect(valid(editor)).toEqual([]);
    editor.commands.undo();
    expect(editor.getJSON()).toEqual(before);
  });

  it("Backspace after a point never joins a line break into a title; it only moves the cursor", () => {
    const editor = editorFor(
      sermonDocument([
        point("j-1", [text("One")]),
        paragraph(text("Two"), { type: "hardBreak" }, text("lines")),
      ]),
    );
    const before = editor.getJSON();
    select(editor, editor.state.doc.firstChild!.nodeSize + 1);
    press(editor, "Backspace");
    expect(editor.getJSON()).toEqual(before);
    expect(editor.state.selection.$from.parent.type.name).toBe("pointTitle");
  });

  it("Backspace removes an empty line after a point and stops at the point", () => {
    const editor = editorFor(sermonDocument([point("e-1", [text("One")]), paragraph()]));
    select(editor, nodePos(editor, "e-1") + editor.state.doc.nodeAt(0)!.nodeSize + 1);
    expect(run(editor, backspaceAfterContainer)).toBe(true);
    expect(topLevel(editor)).toEqual(["e-1"]);
  });

  it("Delete at the end of prose before a point goes into the point and deletes nothing", () => {
    const editor = editorFor(
      sermonDocument([
        paragraph(text("Prose")),
        point("d-1", [text("Point")], [point("d-1a", [text("Sub")])]),
      ]),
    );
    const before = editor.getJSON();
    select(editor, 1 + "Prose".length);
    press(editor, "Delete");
    press(editor, "Delete");
    // Twice: ProseMirror's default would have selected the point, then deleted it and its subpoint.
    expect(editor.getJSON()).toEqual(before);
    expect(editor.state.selection.$from.parent.type.name).toBe("pointTitle");
    expect(editor.state.selection.from).toBe(titleStart(editor, "d-1"));
  });

  it("Delete removes an empty line before a point and stops at the point", () => {
    const editor = editorFor(sermonDocument([paragraph(), point("d-1", [text("Point")])]));
    select(editor, 1);
    press(editor, "Delete");
    expect(topLevel(editor)).toEqual(["d-1"]);
    expect(editor.state.selection.from).toBe(titleStart(editor, "d-1"));
  });

  it("Backspace at the start of a title turns the point into writing; its body stays, one undo restores it", () => {
    const editor = editorFor(lampAndPath);
    const before = editor.getJSON();
    const point = nodeJSON(editor, "lp-2");
    const index = topLevel(editor).indexOf("lp-2");
    cursorIn(editor, "lp-2");
    press(editor, "Backspace");
    const top = editor.getJSON().content!;
    // The title is a paragraph with the same words and marks, where the point was; the body follows.
    expect(top[index]).toEqual({
      type: "paragraph",
      attrs: { textAlign: null, styleName: null, format: null },
      content: point.content![0].content,
    });
    expect(top.slice(index + 1, index + point.content!.length)).toEqual(point.content!.slice(1));
    expect(ids(editor)).not.toContain("lp-2");
    expect(editor.state.selection.from).toBe(
      editor.state.doc.resolve(editor.state.selection.from).start(),
    );
    expect(valid(editor)).toEqual([]);
    editor.commands.undo();
    expect(editor.getJSON()).toEqual(before);
  });

  it("Backspace unwrapping a point moves its subpoints up one level, with everything they own", () => {
    const editor = editorFor(lampAndPath);
    const a = nodeJSON(editor, "lp-1a");
    const b = nodeJSON(editor, "lp-1b");
    cursorIn(editor, "lp-1");
    press(editor, "Backspace");
    expect(topLevel(editor)).toContain("lp-1a");
    expect(nodeJSON(editor, "lp-1a")).toEqual(a);
    expect(nodeJSON(editor, "lp-1b")).toEqual(b);
    expect(valid(editor)).toEqual([]);
  });

  it("Backspace twice merges a point into the one before, as list items merge in a word processor", () => {
    const editor = editorFor(
      sermonDocument([
        point("m-1", [text("One")], [paragraph(text("Body"))]),
        point("m-2", [text("Two")]),
      ]),
    );
    cursorIn(editor, "m-2");
    press(editor, "Backspace");
    expect(topLevel(editor)).toEqual(["m-1", "paragraph"]);
    press(editor, "Backspace");
    expect(topLevel(editor)).toEqual(["m-1"]);
    expect(nodeJSON(editor, "m-1").content!.at(-1)).toEqual(paragraph(text("BodyTwo")));
    expect(editor.state.selection.$from.parentOffset).toBe("Body".length);
    editor.commands.undo();
    editor.commands.undo();
    expect(topLevel(editor)).toEqual(["m-1", "m-2"]);
  });

  it("Backspace in an empty point removes it and goes to the end of the line before", () => {
    const editor = editorFor(
      sermonDocument([point("e-1", [text("One")], [point("e-1a", [])]), paragraph(text("After"))]),
    );
    cursorIn(editor, "e-1a");
    press(editor, "Backspace");
    expect(ids(editor)).toEqual(["e-1"]);
    expect(editor.state.selection.$from.parent.textContent).toBe("One");
    expect(editor.state.selection.$from.parentOffset).toBe(3);
    // The only thing in a document: an empty line is left.
    const alone = editorFor(sermonDocument([point("e-2", [])]));
    cursorIn(alone, "e-2");
    press(alone, "Backspace");
    expect(alone.getJSON().content).toEqual([paragraph()]);
  });

  it("a title takes no line break; Mod+B and colors work in it", () => {
    const editor = editorFor(lampAndPath);
    const before = nodeJSON(editor, "lp-2");
    cursorIn(editor, "lp-2", 4);
    press(editor, "Enter", { shiftKey: true });
    expect(nodeJSON(editor, "lp-2")).toEqual(before);
    editor.commands.setTextSelection({
      from: titleStart(editor, "lp-2"),
      to: titleStart(editor, "lp-2") + 7,
    });
    press(editor, "b", { ctrlKey: true });
    editor.commands.setColor("green");
    expect(nodeJSON(editor, "lp-2").content![0].content![0]).toEqual(
      text(
        "Walking",
        // Marks are kept in the schema's order: textStyle ranks first.
        { type: "textStyle", attrs: { color: "green", fontFamily: null, fontSize: null } },
        { type: "bold" },
        { type: "italic" },
        { type: "underline" },
      ),
    );
    expect(valid(editor)).toEqual([]);
  });
});

describe("the caret before and after a section (a gap cursor), the owner's checks (PS-1B.2B.1)", () => {
  const sermon = () =>
    editorFor(
      sermonDocument([
        section("g-intro", "introduction", [text("Introduction")], [paragraph(text("Opening."))]),
        point("g-1", [text("A point")]),
        section("g-end", "conclusion", [text("Conclusion")], [paragraph(text("Closing."))]),
      ]),
    );

  it("Enter after the conclusion opens a line below it; Backspace there removes it and returns to the conclusion", () => {
    const editor = sermon();
    const before = editor.getJSON();
    const end = editor.state.doc.content.size;
    editor.view.dispatch(
      editor.state.tr.setSelection(new GapCursor(editor.state.doc.resolve(end))),
    );
    press(editor, "Enter");
    expect(topLevel(editor)).toEqual(["g-intro", "g-1", "g-end", "paragraph"]);
    expect(editor.state.selection.$from.parent.type.name).toBe("paragraph");
    press(editor, "Backspace");
    expect(editor.getJSON()).toEqual(before);
    // Back at the end of the conclusion's last text.
    expect(editor.state.selection.$from.parent.textContent).toBe("Closing.");
    expect(editor.state.selection.$from.parentOffset).toBe("Closing.".length);
  });

  it("Enter before a section opens a line above it, and between a section and a point too", () => {
    const editor = sermon();
    editor.view.dispatch(editor.state.tr.setSelection(new GapCursor(editor.state.doc.resolve(0))));
    press(editor, "Enter");
    expect(topLevel(editor)).toEqual(["paragraph", "g-intro", "g-1", "g-end"]);
    const between = nodePos(editor, "g-1");
    editor.view.dispatch(
      editor.state.tr.setSelection(new GapCursor(editor.state.doc.resolve(between))),
    );
    press(editor, "Enter");
    expect(topLevel(editor)).toEqual(["paragraph", "g-intro", "paragraph", "g-1", "g-end"]);
    expect(valid(editor)).toEqual([]);
  });

  it("a document needs no line after its last section", () => {
    const editor = sermon();
    expect(topLevel(editor).at(-1)).toBe("g-end");
  });
});
