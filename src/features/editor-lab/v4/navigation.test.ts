import type { Editor } from "@tiptap/core";
import { GapCursor } from "@tiptap/pm/gapcursor";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { afterEach, describe, expect, it } from "vitest";

import { ref } from "../fixtures";
import { documentV4, passageV4, pointV4, proseV4 } from "./fixtures";
import { keepSelection, unholdable } from "./held-selection";
import { testEditorV4 } from "./testing";

/*
 * BUG-001 (A4.1): walking down a document with three passages in a row sent
 * the caret back to the top. Chrome cannot hold a selection between two
 * uneditable blocks and moves it; `HeldSelection` keeps the editor's own
 * selection when that move follows a key. The browser half (Chrome moving
 * the selection) is `tests/lab/navigation.spec.ts`; this is the decision.
 */

const open: Editor[] = [];
afterEach(() => {
  for (const editor of open.splice(0)) editor.destroy();
});

// Top-level blocks: 0 point, 1 prose, 2–4 three passages in a row, 5 prose.
function make() {
  const editor = testEditorV4(
    documentV4([
      pointV4("p-1", "Grace", 1),
      proseV4("Before", 1),
      passageV4("s-1", ref(43, 3, 16), 1),
      passageV4("s-2", ref(45, 8, 38), 1),
      passageV4("s-3", ref(19, 23, 1), 1),
      proseV4("After", 1),
    ]),
  );
  open.push(editor);
  return editor;
}

const before = (editor: Editor, index: number) => {
  let pos = 0;
  for (let i = 0; i < index; i += 1) pos += editor.state.doc.child(i).nodeSize;
  return pos;
};

function selectBlock(editor: Editor, index: number) {
  const selection = NodeSelection.create(editor.state.doc, before(editor, index));
  editor.view.dispatch(editor.state.tr.setSelection(selection));
  return selection;
}

const key = (editor: Editor) =>
  editor.view.dom.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Shift", shiftKey: true, bubbles: true }),
  );
const click = (editor: Editor) =>
  editor.view.dom.dispatchEvent(new Event("pointerdown", { bubbles: true }));

/** What ProseMirror asks when it reads the browser's selection at `pos`. */
const readAt = (editor: Editor, pos: number) => {
  const $pos = editor.state.doc.resolve(pos);
  return editor.view.someProp("createSelectionBetween", (f) => f(editor.view, $pos, $pos));
};

describe("a selected block the browser cannot hold (BUG-001)", () => {
  it("knows which selections the browser cannot hold", () => {
    const editor = make();
    // The middle passage: a passage on each side.
    expect(unholdable(editor.view, selectBlock(editor, 3))).toBe(true);
    // The first passage has a paragraph before it, the last one after it.
    expect(unholdable(editor.view, selectBlock(editor, 2))).toBe(false);
    expect(unholdable(editor.view, selectBlock(editor, 4))).toBe(false);
    // A gap cursor between two passages, and one beside a paragraph.
    const gap = (pos: number) => new GapCursor(editor.state.doc.resolve(pos));
    expect(unholdable(editor.view, gap(before(editor, 3)))).toBe(true);
    expect(unholdable(editor.view, gap(before(editor, 2)))).toBe(false);
    // A text selection is always the browser's to show.
    expect(unholdable(editor.view, TextSelection.create(editor.state.doc, 2))).toBe(false);
  });

  it("keeps the selected passage when the browser moves the selection after a key", () => {
    const editor = make();
    const selected = selectBlock(editor, 3);
    key(editor);
    // Chrome moved the selection to the document's start: the reading is refused.
    expect(readAt(editor, 1)).toBe(editor.state.selection);
    expect(keepSelection(editor.view)?.eq(selected)).toBe(true);
  });

  it("takes the browser's reading after a click or a touch", () => {
    const editor = make();
    selectBlock(editor, 3);
    key(editor);
    click(editor);
    expect(keepSelection(editor.view)).toBeNull();
    key(editor);
    editor.view.dom.dispatchEvent(new Event("touchstart", { bubbles: true }));
    expect(keepSelection(editor.view)).toBeNull();
  });

  it("takes the browser's reading wherever the browser can hold the selection", () => {
    const editor = make();
    selectBlock(editor, 2);
    key(editor);
    expect(keepSelection(editor.view)).toBeNull();
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 2)));
    key(editor);
    expect(keepSelection(editor.view)).toBeNull();
  });

  it("answers nothing about a document the browser has just changed", () => {
    const editor = make();
    selectBlock(editor, 3);
    key(editor);
    // What ProseMirror asks after reading a change the browser made itself.
    const changed = editor.state.tr.insertText("x", 2).doc;
    const $pos = changed.resolve(2);
    expect(
      editor.view.someProp("createSelectionBetween", (f) => f(editor.view, $pos, $pos)),
    ).not.toBe(editor.state.selection);
  });

  it("still types a letter over the selected passage", () => {
    const editor = make();
    selectBlock(editor, 3);
    const before = editor.state.doc;
    editor.view.dom.dispatchEvent(
      new KeyboardEvent("keypress", { key: "x", charCode: 120, bubbles: true, cancelable: true }),
    );
    expect(editor.state.doc.eq(before)).toBe(false);
    // The text went where the passage was; the first point is untouched.
    expect(editor.state.doc.child(0).eq(before.child(0))).toBe(true);
    expect(editor.state.doc.child(3).textContent).toBe("x");
  });

  it("changes nothing in the document", () => {
    const editor = make();
    const doc = editor.state.doc;
    selectBlock(editor, 3);
    key(editor);
    readAt(editor, 1);
    expect(editor.state.doc).toBe(doc);
  });
});
