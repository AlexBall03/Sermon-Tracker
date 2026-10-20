import type { Editor, JSONContent } from "@tiptap/core";
import { undo } from "@tiptap/pm/history";
import { NodeSelection, Selection, TextSelection, type Transaction } from "@tiptap/pm/state";
import { afterEach, describe, expect, it } from "vitest";

import type { ScriptureReference } from "@/features/scripture/reference";
import {
  clearFormatting,
  setAlignment,
  setNamedStyle,
  setParagraphFormat,
} from "../formatting-commands";
import { blockState, componentLook } from "../formatting-state";
import { labFixture, labFixtureIds } from "../load";
import { run } from "../outline-commands";
import { labSchema } from "../schema/extensions";
import { restoreDocument } from "../validate";
import { duplicatePointGroup, insertPassage } from "./commands";
import { documentV4, noteV4, passageV4, pointV4, proseV4, v4Fixtures } from "./fixtures";
import { analyze, reparented } from "./ownership";
import { allIds, caret, owners, ownership, testEditorV4, textStart } from "./testing";

/*
 * A1, the integrated workspace: what the v3 toolbar's commands do on a v4
 * document, the two v4 commands the workspace added (Scripture passage,
 * duplicate a point with its content), and that every lab document opens
 * in v4 with nothing refused and no text lost.
 */

const editors: Editor[] = [];
const make = (content: JSONContent) => {
  const editor = testEditorV4(content);
  editors.push(editor);
  return editor;
};
afterEach(() => {
  while (editors.length) editors.pop()!.destroy();
});

const john316: ScriptureReference = {
  book: 43,
  chapterStart: 3,
  verseStart: 16,
  chapterEnd: null,
  verseEnd: null,
};

const list = (text: string, depth: number): JSONContent => ({
  type: "bulletList",
  attrs: { depth },
  content: [
    { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text }] }] },
  ],
});

/** Every kind of place a passage can be asked for: writing, headings, a list, a note, a passage, irregular depth. */
const varied = documentV4([
  proseV4("Opening words", 0),
  pointV4("p-i", "Main Point I", 1, { role: "introduction" }),
  pointV4("p-a", "Subpoint A", 2),
  proseV4("Body of A", 2),
  list("Listed under A", 2),
  noteV4("n-1", "A note for I", 1),
  proseV4("Belongs to I", 1),
  pointV4("p-b", "Subpoint B", 2),
  proseV4("Deeper than B", 3),
  passageV4("x-1", john316, 2),
  pointV4("p-ii", "Main Point II", 1),
]);

const block = (editor: Editor, index: number) => editor.state.doc.child(index);

/** Puts the selection in, or on, the top-level block at `index`. */
function selectBlock(editor: Editor, index: number) {
  const { doc } = editor.state;
  let pos = 0;
  for (let other = 0; other < index; other += 1) pos += doc.child(other).nodeSize;
  const node = doc.child(index);
  const selection =
    node.isAtom && NodeSelection.isSelectable(node)
      ? NodeSelection.create(doc, pos)
      : Selection.near(doc.resolve(pos + 1));
  editor.view.dispatch(editor.state.tr.setSelection(selection));
}

/**
 * Asks for a passage with the selection where it is, and checks: it applies;
 * no block already in the document changes owner; the passage stands right
 * after the block the selection ends in and belongs to what that block
 * belongs to (after a point heading, to the point); one undo gives the exact
 * document back.
 */
function insertsKeepingOwners(editor: Editor) {
  const before = editor.getJSON();
  const structure = analyze(editor.state.doc);
  const { selection } = editor.state;
  const anchor =
    selection instanceof NodeSelection && selection.$from.depth === 0
      ? selection.$from.index(0)
      : selection.$to.index(0);
  const anchorBlock = structure.blocks[anchor];
  const expectedOwner = anchorBlock.isPoint ? anchor : structure.owner[anchor];
  const expectedId = expectedOwner === null ? null : structure.blocks[expectedOwner].node.attrs.id;

  let made: Transaction | null = null;
  const applies = insertPassage(john316)(editor.state, (tr) => {
    made = tr;
    editor.view.dispatch(tr);
  });
  expect(applies).toBe(true);
  const tr = made! as Transaction;
  expect(reparented(structure, tr.doc, tr.mapping)).toBe(0);

  const after = analyze(editor.state.doc);
  const inserted = after.blocks[anchor + 1];
  expect(inserted.node.type.name).toBe("scripturePassage");
  const owner = after.owner[anchor + 1];
  expect(owner === null ? null : after.blocks[owner].node.attrs.id).toBe(expectedId);

  undo(editor.state, editor.view.dispatch);
  expect(editor.getJSON()).toEqual(before);
}

describe("a Scripture passage keeps everyone's owner", () => {
  it.each([
    ["a point heading that owns content", "p-a", "p-a"],
    ["writing that belongs to a subpoint", "Body of A", "p-a"],
    ["writing that belongs to the document", "Opening words", null],
    ["writing of a main point after its subpoints", "Belongs to I", "p-i"],
    ["writing deeper than its point (irregular)", "Deeper than B", "p-b"],
    ["the last block", "p-ii", "p-ii"],
  ])("in %s", (_case, name, owner) => {
    const editor = make(varied);
    caret(editor, name, 1);
    insertsKeepingOwners(editor);
    // And by name, once more, without undo.
    caret(editor, name, 1);
    run(editor, insertPassage(john316));
    const index = editor.state.selection.$from.index(0);
    const ownerIndex = analyze(editor.state.doc).owner[index];
    expect(ownerIndex === null ? null : block(editor, ownerIndex).attrs.id).toBe(owner);
  });

  it("in a list and in a note: after the container, with the container's owner", () => {
    const editor = make(varied);
    selectBlock(editor, 4);
    insertsKeepingOwners(editor);
    selectBlock(editor, 5);
    insertsKeepingOwners(editor);
  });

  it("with a passage selected: after it", () => {
    const editor = make(varied);
    selectBlock(editor, 9);
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
    insertsKeepingOwners(editor);
  });

  it("with a selection across blocks: after the block it ends in", () => {
    const editor = make(varied);
    const from = textStart(editor, "Body of A") + 2;
    const to = textStart(editor, "Belongs to I") + 3;
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, from, to)),
    );
    insertsKeepingOwners(editor);
  });

  it("at every top-level block of every lab document", () => {
    const documents: JSONContent[] = [
      ...Object.values(v4Fixtures),
      ...labFixtureIds.filter((id) => id !== "stress").map((id) => labFixture(id).doc),
    ];
    for (const document of documents) {
      const editor = make(document);
      for (let index = 0; index < editor.state.doc.childCount; index += 1) {
        selectBlock(editor, index);
        insertsKeepingOwners(editor);
      }
      editor.destroy();
      editors.pop();
    }
  });
});

describe("duplicating a point with its content", () => {
  it("puts a copy right after its group, with new IDs that remember the originals; nothing else changes owner", () => {
    const editor = make(varied);
    const before = editor.getJSON();
    const rowsBefore = ownership(editor);
    caret(editor, "p-a", 3);
    expect(run(editor, duplicatePointGroup)).toBe(true);
    const names = editor.state.doc.content.content.map((node) => node.attrs.id ?? node.textContent);
    // The copy of Subpoint A, its body, and its list follow the original group, before the note.
    expect(names.slice(2, 9)).toEqual([
      "p-a",
      "Body of A",
      "Listed under A",
      "new-1",
      "Body of A",
      "Listed under A",
      "n-1",
    ]);
    const copy = block(editor, 5);
    expect(copy.attrs.derivedFrom).toBe("p-a");
    expect(copy.attrs.depth).toBe(2);
    expect(new Set(allIds(editor)).size).toBe(allIds(editor).length);
    // Everything that was there keeps its owner (the copy is blocks 5–7).
    const rows = ownership(editor);
    expect([...rows.slice(0, 5), ...rows.slice(8)]).toEqual(rowsBefore);
    expect(rows.slice(5, 8).map((row) => row.owner)).toEqual(["p-i", "new-1", "new-1"]);
    // The caret is in the copy's heading, where it was in the original's.
    expect(editor.state.selection.$from.parent).toBe(copy);
    undo(editor.state, editor.view.dispatch);
    expect(editor.getJSON()).toEqual(before);
  });

  it("does not copy a role: the document keeps one introduction", () => {
    const editor = make(varied);
    caret(editor, "p-i");
    run(editor, duplicatePointGroup);
    const roles: unknown[] = [];
    editor.state.doc.forEach((node) => {
      if (node.type.name === "point" && node.attrs.role) roles.push(node.attrs.role);
    });
    expect(roles).toEqual(["introduction"]);
  });

  it("does not apply outside every point", () => {
    const editor = make(varied);
    caret(editor, "Opening words");
    expect(duplicatePointGroup(editor.state)).toBe(false);
  });
});

describe("the toolbar's formatting on a v4 document", () => {
  it("a named style on writing keeps its depth, so it keeps its owner", () => {
    const editor = make(varied);
    const before = owners(editor);
    caret(editor, "Body of A", 2);
    expect(run(editor, setNamedStyle("heading3"))).toBe(true);
    expect(block(editor, 3).type.name).toBe("heading");
    expect(block(editor, 3).attrs.depth).toBe(2);
    expect(owners(editor)).toEqual(before);
  });

  it("a named style on a point is its look: it stays the same point; null gives back its component's look", () => {
    const editor = make(varied);
    caret(editor, "p-i", 2);
    expect(blockState(editor.state)).toMatchObject({ style: componentLook, component: true });
    expect(run(editor, setNamedStyle("heading1"))).toBe(true);
    const point = block(editor, 1);
    expect(point.type.name).toBe("point");
    expect(point.attrs).toMatchObject({
      id: "p-i",
      depth: 1,
      role: "introduction",
      styleName: "heading1",
    });
    expect(blockState(editor.state).style).toBe("heading1");
    expect(run(editor, setNamedStyle(null))).toBe(true);
    expect(block(editor, 1).attrs.styleName).toBeNull();
    // On writing alone, "the component's look" means nothing.
    caret(editor, "Body of A");
    expect(setNamedStyle(null)(editor.state)).toBe(false);
  });

  it("alignment and spacing apply to a point; clearing removes them and keeps its look and identity", () => {
    const editor = make(varied);
    caret(editor, "p-a", 1);
    run(editor, setNamedStyle("subtitle"));
    expect(run(editor, setAlignment("center"))).toBe(true);
    expect(run(editor, setParagraphFormat({ spaceBefore: 12 }))).toBe(true);
    expect(block(editor, 2).attrs).toMatchObject({
      textAlign: "center",
      format: { spaceBefore: 12 },
    });
    expect(blockState(editor.state)).toMatchObject({ align: "center", spaceBefore: 12 });
    expect(run(editor, clearFormatting)).toBe(true);
    expect(block(editor, 2).attrs).toMatchObject({
      id: "p-a",
      textAlign: null,
      format: null,
      styleName: "subtitle",
    });
  });

  it("a selection across writing and a point styles both, and each stays what it is", () => {
    const editor = make(varied);
    const from = textStart(editor, "Body of A");
    const to = textStart(editor, "p-b") + 2;
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, from, to)),
    );
    expect(run(editor, setNamedStyle("heading2"))).toBe(true);
    expect(block(editor, 3).type.name).toBe("heading");
    expect(block(editor, 7).type.name).toBe("point");
    expect(block(editor, 7).attrs.styleName).toBe("heading2");
  });
});

describe("every lab document opens in v4", () => {
  it.each([...labFixtureIds])("%s: accepted, with all of its text", (id) => {
    const { doc } = labFixture(id);
    const v3 = restoreDocument(doc, labSchema());
    expect(v3.ok).toBe(true);
    const editor = make(doc);
    if (v3.ok) expect(editor.state.doc.textContent).toBe(v3.doc.textContent);
  });

  it.each(Object.keys(v4Fixtures))("%s (v4): accepted unchanged", (id) => {
    const editor = make(v4Fixtures[id as keyof typeof v4Fixtures]);
    expect(editor.state.doc.childCount).toBeGreaterThan(0);
  });
});
