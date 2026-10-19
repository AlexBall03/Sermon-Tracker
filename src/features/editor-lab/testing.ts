import { Editor, type JSONContent } from "@tiptap/core";

import { labExtensions } from "./schema/extensions";

/**
 * A lab editor for tests, mounted on a detached element (jsdom). New IDs are
 * `new-1`, `new-2`, … so tests can name them.
 */
export function testEditor(content: JSONContent) {
  let next = 0;
  return new Editor({
    element: document.createElement("div"),
    extensions: labExtensions({ newId: () => `new-${(next += 1)}` }),
    content,
  });
}

/** The position just inside the title of the node with `id`. */
export function titleStart(editor: Editor, id: string): number {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (found >= 0) return false;
    if (node.attrs.id === id && node.firstChild?.type.name === "entryTitle") found = pos + 2;
    return true;
  });
  if (found < 0) throw new Error(`no node ${id}`);
  return found;
}

/** Every identified node's ID, in document order. */
export function ids(editor: Editor): string[] {
  const list: string[] = [];
  editor.state.doc.descendants((node) => {
    if (typeof node.attrs.id === "string") list.push(node.attrs.id);
    return true;
  });
  return list;
}

/** The title of each point and section, indented two spaces a level. */
export function shape(editor: Editor): string[] {
  const lines: string[] = [];
  editor.state.doc.descendants((node, _pos, parent) => {
    if (node.type.name !== "entryTitle") return true;
    let depth = 0;
    const $pos = editor.state.doc.resolve(_pos);
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
