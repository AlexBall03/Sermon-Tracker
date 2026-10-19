import { Editor, type JSONContent } from "@tiptap/core";

import type { ClipboardNotice } from "./clipboard";
import { loadDocument } from "./load";
import { labExtensions } from "./schema/extensions";

/**
 * A lab editor for tests, mounted on a detached element (jsdom), holding
 * `content` after it has passed the validator (and migration). New IDs are
 * `<prefix>1`, `<prefix>2`, … so tests can name them. `documentKey` names the
 * document for copy and paste.
 */
export function testEditor(
  content: JSONContent,
  { documentKey = "doc-a", prefix = "new-", notices }: TestEditorOptions = {},
) {
  let next = 0;
  const editor = new Editor({
    element: document.createElement("div"),
    extensions: labExtensions({
      newId: () => `${prefix}${(next += 1)}`,
      onNotice: notices ? (notice) => notices.push(notice) : undefined,
    }),
  });
  const loaded = loadDocument(editor, content, documentKey);
  if (!loaded.ok) {
    editor.destroy();
    throw new Error(`test document refused: ${JSON.stringify(loaded.problems)}`);
  }
  return editor;
}

export type TestEditorOptions = {
  documentKey?: string;
  prefix?: string;
  notices?: ClipboardNotice[];
};

const titleTypes = new Set(["pointTitle", "sectionTitle"]);

/** The position just inside the title of the point or section with `id`. */
export function titleStart(editor: Editor, id: string): number {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (found >= 0) return false;
    if (node.attrs.id === id && node.firstChild && titleTypes.has(node.firstChild.type.name)) {
      found = pos + 2;
    }
    return true;
  });
  if (found < 0) throw new Error(`no node ${id}`);
  return found;
}

/** Where the node with `id` starts. */
export function nodePos(editor: Editor, id: string): number {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (found >= 0) return false;
    if (node.attrs.id === id) found = pos;
    return true;
  });
  if (found < 0) throw new Error(`no node ${id}`);
  return found;
}

/** The JSON of the node with `id`. */
export const nodeJSON = (editor: Editor, id: string) =>
  editor.state.doc.nodeAt(nodePos(editor, id))!.toJSON() as JSONContent;

/** Every identified node's ID, in document order. */
export function ids(editor: Editor): string[] {
  const list: string[] = [];
  editor.state.doc.descendants((node) => {
    if (typeof node.attrs.id === "string") list.push(node.attrs.id);
    return true;
  });
  return list;
}

/** The title of each point and section, indented two spaces a level; a section is marked §. */
export function shape(editor: Editor): string[] {
  const lines: string[] = [];
  editor.state.doc.descendants((node, pos, parent) => {
    if (!titleTypes.has(node.type.name)) return true;
    let depth = 0;
    const $pos = editor.state.doc.resolve(pos);
    for (let level = $pos.depth; level > 0; level -= 1) {
      if ($pos.node(level).type.name === "outlinePoint") depth += 1;
    }
    lines.push(
      `${"  ".repeat(Math.max(depth - 1, 0))}${parent?.type.name === "outlinePoint" ? "" : "§"}${node.textContent}`,
    );
    return false;
  });
  return lines;
}

/** The top-level blocks: each node's ID, or its type when it has none. */
export const topLevel = (editor: Editor) =>
  editor.getJSON().content!.map((node) => (node.attrs?.id as string | undefined) ?? node.type);
