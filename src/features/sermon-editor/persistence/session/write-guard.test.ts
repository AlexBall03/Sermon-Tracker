import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { afterEach, describe, expect, it } from "vitest";

import { labV4Extensions, loadV4 } from "@/features/editor-lab/v4/extensions";
import { documentV4, pointV4, proseV4 } from "@/features/editor-lab/v4/fixtures";
import { foldingOf } from "@/features/editor-lab/v4/folding";
import { caret, press } from "@/features/editor-lab/v4/testing";
import type { JsonValue } from "../json";
import { jsonEqual } from "../autosave/model";
import { sessionWriteGuard, writeGuardKey } from "./write-guard";

/*
 * The write guard (A2.3B.3) on a real v4 editor: while the session may not
 * edit, no route changes the document, and nothing in a transaction lets one
 * through.
 */

const sermon = () =>
  documentV4([pointV4("p-1", "Grace", 1), proseV4("Mercy endures", 1), pointV4("p-2", "Hope", 1)]);

// jsdom has no ClipboardEvent; ProseMirror's paste makes one to carry the text (as structure.test.ts does).
if (typeof globalThis.ClipboardEvent === "undefined") {
  (globalThis as { ClipboardEvent?: unknown }).ClipboardEvent = class extends Event {
    clipboardData = null;
  };
}

let editors: Editor[] = [];
function guarded(initial = sermon()) {
  const gate = { open: false };
  let next = 0;
  const editor = new Editor({
    element: document.createElement("div"),
    extensions: [
      ...labV4Extensions({ newId: () => `new-${(next += 1)}` }),
      sessionWriteGuard(() => gate.open),
    ],
  });
  const loaded = loadV4(editor, initial, "doc-a");
  if (!loaded.ok) throw new Error("refused");
  editors.push(editor);
  return { editor, gate, before: editor.getJSON() };
}

const same = (editor: Editor, json: unknown) =>
  jsonEqual(editor.getJSON() as JsonValue, json as JsonValue);

afterEach(() => {
  for (const editor of editors) if (!editor.isDestroyed) editor.destroy();
  editors = [];
});

describe("sessionWriteGuard", () => {
  it("loads a document into a read-only editor (loading is not a transaction)", () => {
    const { editor } = guarded();
    expect(editor.state.doc.textContent).toContain("Grace");
    const replaced = loadV4(editor, documentV4([pointV4("p-9", "Faith", 1)]));
    expect(replaced.ok).toBe(true);
    expect(editor.state.doc.textContent).toContain("Faith");
  });

  it("refuses typing, commands, paste, keys, and document attributes while read-only", () => {
    const { editor, before } = guarded();
    caret(editor, "p-1", 0);
    editor.view.dispatch(editor.state.tr.insertText("X"));
    editor.commands.insertContent("Y");
    editor.chain().focus().deleteSelection().insertContent("Z").run();
    editor.view.pasteText("pasted");
    editor.view.pasteHTML("<p>pasted</p>");
    press(editor, "Enter");
    press(editor, "Backspace");
    press(editor, "Alt-Shift-ArrowDown");
    editor.view.dispatch(editor.state.tr.setDocAttribute("subtitle", "Changed"));
    expect(same(editor, before)).toBe(true);
  });

  it("refuses Undo and Redo while read-only", () => {
    const { editor, gate } = guarded();
    gate.open = true;
    caret(editor, "p-1", 0);
    editor.view.dispatch(editor.state.tr.insertText("Edited "));
    const edited = editor.getJSON();
    gate.open = false;
    editor.commands.undo();
    expect(same(editor, edited)).toBe(true);
    gate.open = true;
    editor.commands.undo();
    const undone = editor.getJSON();
    gate.open = false;
    editor.commands.redo();
    expect(same(editor, undone)).toBe(true);
  });

  it("lets no metadata through", () => {
    const { editor, before } = guarded();
    caret(editor, "p-1", 0);
    for (const meta of ["addToHistory", "preventUpdate", "trusted", "load", "sermonWriteGuard"]) {
      editor.view.dispatch(editor.state.tr.insertText("M").setMeta(meta, true));
    }
    editor.view.dispatch(editor.state.tr.insertText("K").setMeta(writeGuardKey, true));
    expect(same(editor, before)).toBe(true);
  });

  it("lets selection and view state through", () => {
    const { editor } = guarded();
    const at = editor.state.doc.content.size - 2;
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, at)));
    expect(editor.state.selection.from).toBe(at);
    // A3.1: folding points and collapsing Scripture are view state, so they pass a guard that refuses edits.
    const json = editor.getJSON();
    expect(foldingOf(editor.state).foldable).toBeGreaterThan(0);
    editor.commands.setAllPointsFolded(true);
    expect(foldingOf(editor.state).folded).toBe(foldingOf(editor.state).foldable);
    editor.commands.setPassagesCollapsedInPrint(true);
    expect(editor.getJSON()).toEqual(json);
  });

  it("asks at the moment of each transaction, and refuses when the question throws", () => {
    const thrown = { open: true };
    const editor = new Editor({
      element: document.createElement("div"),
      extensions: [
        ...labV4Extensions({ newId: () => "n" }),
        sessionWriteGuard(() => {
          if (thrown.open) throw new Error("no session");
          return true;
        }),
      ],
    });
    editors.push(editor);
    loadV4(editor, sermon());
    const before = editor.getJSON();
    caret(editor, "p-1", 0);
    editor.view.dispatch(editor.state.tr.insertText("X"));
    expect(same(editor, before)).toBe(true);
    thrown.open = false;
    editor.view.dispatch(editor.state.tr.insertText("X"));
    expect(editor.state.doc.textContent).toContain("XGrace");
  });

  it("edits normally while the session may edit", () => {
    const { editor, gate } = guarded();
    gate.open = true;
    caret(editor, "p-1", 0);
    editor.view.dispatch(editor.state.tr.insertText("Amazing "));
    editor.view.pasteText("pasted ");
    expect(editor.state.doc.textContent).toContain("Amazing pasted Grace");
  });
});
