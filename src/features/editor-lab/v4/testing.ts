import { Editor, type JSONContent } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";

import { labV4Extensions, loadV4 } from "./extensions";
import type { V4Notice } from "./model";
import { analyze } from "./ownership";

/*
 * The v4 prototype's test harness, as `testing.ts` is v3's: an editor on a
 * detached element (jsdom), holding `content` once the v4 validator has
 * accepted it (migrated from v3 when older). New IDs are `new-1`, `new-2`, …
 */
export function testEditorV4(
  content: JSONContent,
  { notices, documentKey = "doc-a" }: { notices?: V4Notice[]; documentKey?: string } = {},
) {
  let next = 0;
  const editor = new Editor({
    element: document.createElement("div"),
    extensions: labV4Extensions({
      newId: () => `new-${(next += 1)}`,
      onNotice: notices ? (notice) => notices.push(notice) : undefined,
    }),
  });
  const loaded = loadV4(editor, content, documentKey);
  if (!loaded.ok) {
    editor.destroy();
    throw new Error(`test document refused: ${JSON.stringify(loaded.problems)}`);
  }
  return editor;
}

/** A top-level block's name for the tests: a point's ID, or its text. */
export function nameOf(node: {
  type: { name: string };
  attrs: Record<string, unknown>;
  textContent: string;
}) {
  return node.type.name === "point" ? String(node.attrs.id) : node.textContent;
}

/**
 * The document as rows the tests can read: each top-level block's name,
 * whether it is a point, its depth, and who owns it (a point's ID, or null for the document).
 */
export function ownership(editor: Editor) {
  const structure = analyze(editor.state.doc);
  return structure.blocks.map((block, index) => {
    const owner = structure.owner[index];
    return {
      name: nameOf(block.node),
      point: block.isPoint,
      depth: block.depth,
      owner: owner === null ? null : nameOf(structure.blocks[owner].node),
      irregular: structure.irregular[index],
    };
  });
}

/** Who owns each block, by name: the shortest way to compare ownership in a test. */
export const owners = (editor: Editor) =>
  Object.fromEntries(ownership(editor).map((row) => [row.name, row.owner]));

/** Where a top-level block (by name) starts its text. */
export function textStart(editor: Editor, name: string): number {
  let found: number | null = null;
  editor.state.doc.forEach((node, pos) => {
    if (found === null && nameOf(node) === name) found = pos + 1;
  });
  if (found === null) throw new Error(`no block ${name}`);
  return found;
}

/** Puts the caret in a block (by name), `offset` characters in. */
export function caret(editor: Editor, name: string, offset = 0) {
  const pos = textStart(editor, name) + offset;
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, pos)));
}

/** The IDs of every identified node, in order. */
export function allIds(editor: Editor): string[] {
  const ids: string[] = [];
  editor.state.doc.descendants((node) => {
    if (typeof node.attrs.id === "string") ids.push(node.attrs.id);
    return true;
  });
  return ids;
}

/**
 * Presses a key as the browser would deliver it to ProseMirror's key handlers
 * (`Shift-Enter`, `Mod-Enter`, `Alt-Shift-ArrowUp`, …). Unlike Tiptap's
 * `keyboardShortcut` command, which replays only the steps a key made, this
 * keeps the transaction whole: its selection and its meta. True when a
 * handler took the key; a key no handler takes is the browser's own (in a
 * browser, Backspace in the middle of text deletes a character natively).
 */
export function press(editor: Editor, combo: string): boolean {
  const parts = combo.split("-");
  const key = parts.pop()!;
  const event = new KeyboardEvent("keydown", {
    key,
    shiftKey: parts.includes("Shift"),
    altKey: parts.includes("Alt"),
    ctrlKey: parts.includes("Mod") || parts.includes("Ctrl"),
    metaKey: false,
    bubbles: true,
    cancelable: true,
  });
  const view = editor.view;
  return view.someProp("handleKeyDown", (handler) => handler(view, event)) ?? false;
}
