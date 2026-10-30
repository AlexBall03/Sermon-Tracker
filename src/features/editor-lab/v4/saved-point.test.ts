import { Editor } from "@tiptap/core";
import { redo, undo, undoDepth } from "@tiptap/pm/history";
import { afterEach, describe, expect, it } from "vitest";

import { sessionWriteGuard } from "@/features/sermon-editor/persistence/session/write-guard";
import { restoreSermonDocument } from "@/features/sermon-editor/document";
import { insertSavedPoint, type SavedPointTarget } from "./commands";
import { labV4Extensions, loadV4 } from "./extensions";
import { documentV4, pointV4, proseV4 } from "./fixtures";
import { allIds, caret, owners, ownership, testEditorV4 } from "./testing";

/*
 * A3.1, Add from Saved Point: a copy of a saved point idea is a new point
 * with the idea's title and `sourcePointId`, and nothing else; placed by the
 * anchor's ID; one undo step each; never where the session cannot edit.
 */

const open: Editor[] = [];
afterEach(() => {
  for (const editor of open.splice(0)) editor.destroy();
});

const sermon = () =>
  documentV4([
    pointV4("intro", "Welcome", 1, { role: "introduction" }),
    proseV4("Opening words", 0),
    pointV4("p-1", "Grace", 1),
    proseV4("Under grace", 1),
    pointV4("p-1a", "Free", 2),
    pointV4("p-2", "Hope", 1),
    proseV4("After hope", 0),
    pointV4("end", "Go in peace", 1, { role: "conclusion" }),
  ]);

function make(content = sermon()) {
  const editor = testEditorV4(content);
  open.push(editor);
  return editor;
}

const idea = { id: "idea-7", title: "Faith comes by hearing" };

function place(editor: Editor, target: SavedPointTarget, point = idea) {
  return editor.commands.command(({ state, dispatch }) =>
    insertSavedPoint(point, target)(state, dispatch),
  );
}

/** The point made from the idea, with its row in the ownership table. */
function copies(editor: Editor) {
  const rows = ownership(editor);
  const found: { index: number; attrs: Record<string, unknown>; row: (typeof rows)[number] }[] = [];
  editor.state.doc.forEach((node, _pos, index) => {
    if (node.type.name === "point" && node.attrs.sourcePointId === idea.id) {
      found.push({ index, attrs: node.attrs, row: rows[index] });
    }
  });
  return found;
}

const accepted = (editor: Editor) => restoreSermonDocument(editor.getJSON()).ok;

describe("insertSavedPoint", () => {
  it("copies only the title and the source: no role, legacy link, notes, or passages", () => {
    const editor = make();
    const blocks = editor.state.doc.childCount;
    expect(place(editor, { anchorId: "p-1", place: "below" })).toBe(true);
    expect(editor.state.doc.childCount).toBe(blocks + 1);
    const [copy] = copies(editor);
    expect(copy.row.name).toMatch(/^new-/);
    expect(editor.state.doc.child(copy.index).textContent).toBe(idea.title);
    expect(copy.attrs).toMatchObject({
      sourcePointId: idea.id,
      role: null,
      legacyEntryId: null,
      legacyRevision: null,
      legacyParentId: null,
      derivedFrom: null,
      presentation: null,
    });
    expect(accepted(editor)).toBe(true);
  });

  it("below: after the anchor's whole group, at its level, taking nothing over", () => {
    const editor = make();
    const before = owners(editor);
    place(editor, { anchorId: "p-1", place: "below" });
    const [copy] = copies(editor);
    // After p-1, "Under grace", and p-1a; before p-2.
    expect(ownership(editor)[copy.index - 1].name).toBe("p-1a");
    expect(ownership(editor)[copy.index + 1].name).toBe("p-2");
    expect(copy.row).toMatchObject({ depth: 1, owner: null });
    for (const [name, owner] of Object.entries(before)) expect(owners(editor)[name]).toBe(owner);
  });

  it("under: the anchor's last subpoint", () => {
    const editor = make();
    const before = owners(editor);
    place(editor, { anchorId: "p-1", place: "under" });
    const [copy] = copies(editor);
    expect(ownership(editor)[copy.index - 1].name).toBe("p-1a");
    expect(copy.row).toMatchObject({ depth: 2, owner: "p-1" });
    for (const [name, owner] of Object.entries(before)) expect(owners(editor)[name]).toBe(owner);
  });

  it("under a subpoint goes a level deeper", () => {
    const editor = make();
    place(editor, { anchorId: "p-1a", place: "under" });
    expect(copies(editor)[0].row).toMatchObject({ depth: 3, owner: "p-1a" });
  });

  it("below a point followed by its parent's writing keeps that writing its parent's", () => {
    const editor = make();
    const before = owners(editor);
    place(editor, { anchorId: "p-2", place: "below" });
    const [copy] = copies(editor);
    expect(ownership(editor)[copy.index + 1].name).toBe("After hope");
    for (const [name, owner] of Object.entries(before)) expect(owners(editor)[name]).toBe(owner);
    expect(accepted(editor)).toBe(true);
  });

  it("with no anchor: a main point before the conclusion", () => {
    const editor = make();
    place(editor, { anchorId: null, place: "below" });
    const [copy] = copies(editor);
    expect(ownership(editor)[copy.index + 1].name).toBe("end");
    expect(copy.row).toMatchObject({ depth: 1, owner: null });
  });

  it("with no anchor and no conclusion: at the end", () => {
    const editor = make(documentV4([proseV4("Notes", 0), pointV4("p-1", "Grace", 1)]));
    place(editor, { anchorId: null, place: "below" });
    const [copy] = copies(editor);
    expect(copy.index).toBe(editor.state.doc.childCount - 1);
    expect(copy.row.depth).toBe(1);
  });

  it("may place the same idea again and again, each with its own identity", () => {
    const editor = make();
    for (let count = 0; count < 3; count += 1) {
      expect(place(editor, { anchorId: "p-1", place: "under" })).toBe(true);
    }
    const made = copies(editor);
    expect(made).toHaveLength(3);
    const ids = made.map((copy) => copy.attrs.id);
    expect(new Set(ids).size).toBe(3);
    expect(new Set(allIds(editor)).size).toBe(allIds(editor).length);
    // The anchor is found by ID each time, so all three stay under p-1, in order.
    for (const copy of made) expect(copy.row.owner).toBe("p-1");
    expect(accepted(editor)).toBe(true);
  });

  it("is refused where the anchor is gone or the depth would pass the limit", () => {
    const editor = make();
    expect(place(editor, { anchorId: "missing", place: "below" })).toBe(false);
    const deep = make(documentV4([pointV4("deep", "Deep", 32)]));
    expect(place(deep, { anchorId: "deep", place: "under" })).toBe(false);
    expect(place(deep, { anchorId: "deep", place: "below" })).toBe(true);
  });

  it("is one undo step each, and redo brings it back", () => {
    const editor = make();
    const original = editor.getJSON();
    place(editor, { anchorId: "p-1", place: "below" });
    place(editor, { anchorId: "p-1", place: "below" });
    expect(copies(editor)).toHaveLength(2);
    undo(editor.state, editor.view.dispatch);
    expect(copies(editor)).toHaveLength(1);
    undo(editor.state, editor.view.dispatch);
    expect(copies(editor)).toHaveLength(0);
    expect(editor.getJSON()).toEqual(original);
    redo(editor.state, editor.view.dispatch);
    expect(copies(editor)).toHaveLength(1);
    expect(copies(editor)[0].attrs.sourcePointId).toBe(idea.id);
  });

  it("puts the caret at the end of the new heading, ready to edit", () => {
    const editor = make();
    caret(editor, "Opening words");
    place(editor, { anchorId: "p-2", place: "under" });
    const { $from } = editor.state.selection;
    expect($from.parent.attrs.sourcePointId).toBe(idea.id);
    expect($from.parentOffset).toBe(idea.title.length);
    editor.commands.insertContent("!");
    expect($from.parent.attrs.sourcePointId).toBe(idea.id);
    expect(copies(editor)[0].attrs.sourcePointId).toBe(idea.id);
  });

  it("changes nothing where the session may not edit (the write guard)", () => {
    let canEdit = false;
    const editor = new Editor({
      element: document.createElement("div"),
      extensions: [...labV4Extensions({}), sessionWriteGuard(() => canEdit)],
    });
    open.push(editor);
    expect(loadV4(editor, sermon(), "doc").ok).toBe(true);
    const before = editor.getJSON();
    const depth = undoDepth(editor.state);
    place(editor, { anchorId: "p-1", place: "below" });
    expect(editor.getJSON()).toEqual(before);
    expect(undoDepth(editor.state)).toBe(depth);
    canEdit = true;
    place(editor, { anchorId: "p-1", place: "below" });
    expect(copies(editor)).toHaveLength(1);
  });
});
