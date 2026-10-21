import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

/*
 * The selection brought up to the caret the browser shows, before any key
 * acts on it (A1-UI.2B.1).
 *
 * ProseMirror learns where a click put the caret from `selectionchange`,
 * which Chrome delivered 69ms after `mouseup` in the lab (measured), while a
 * key pressed at once arrived after 4ms. In that gap every key handler saw
 * the old selection. Backspace just after a click at a heading's end
 * converted the heading as if the caret were at its start, and a click at
 * its start was refused by the guard as if mid-heading. ProseMirror's own
 * `keypress` and the guard's `handleTextInput` also replace a selection that
 * spans blocks, so typing at once after clicking away from one could have
 * replaced text that was no longer selected.
 *
 * Only public API is used: the browser's selection, read through
 * `posAtDOM`, and an ordinary transaction. It does nothing, and the key goes
 * on as before, whenever the reading is uncertain:
 *
 *   - the editor has no focus, or a composition is under way;
 *   - the browser's selection is not inside the editor's own text;
 *   - ProseMirror's selection is not a text selection (a gap cursor or a
 *     selected node is not drawn as a browser selection, so the two cannot
 *     be compared);
 *   - either end does not land in a block of text.
 *
 * It never consumes a key and changes nothing but the selection, so the
 * guard (`plugins.ts`) and every command still decide what the key does.
 */

const syncKey = new PluginKey("labV4CaretSync");

/** Whether `node` is inside the editor's own content, not a widget or a node view's chrome. */
function editable(view: EditorView, node: Node | null): node is Node {
  if (!node || !view.dom.contains(node)) return false;
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  return !element?.closest('[contenteditable="false"]');
}

/** Brings the selection up to the browser's caret; true when it had to. Exported for the tests. */
export function catchUp(view: EditorView): boolean {
  if (view.composing || !view.hasFocus()) return false;
  const current = view.state.selection;
  if (!(current instanceof TextSelection)) return false;
  const shown = view.dom.ownerDocument.getSelection();
  if (!shown || !editable(view, shown.anchorNode) || !editable(view, shown.focusNode)) return false;
  let anchor: number;
  let head: number;
  try {
    anchor = view.posAtDOM(shown.anchorNode, shown.anchorOffset);
    head = view.posAtDOM(shown.focusNode!, shown.focusOffset);
  } catch {
    return false;
  }
  if (anchor === current.anchor && head === current.head) return false;
  const { doc } = view.state;
  if (anchor < 0 || head < 0 || anchor > doc.content.size || head > doc.content.size) return false;
  const $anchor = doc.resolve(anchor);
  const $head = doc.resolve(head);
  if (!$anchor.parent.inlineContent || !$head.parent.inlineContent) return false;
  view.dispatch(
    view.state.tr.setSelection(TextSelection.between($anchor, $head)).setMeta("pointer", true),
  );
  return true;
}

export const CaretSync = Extension.create({
  name: "v4CaretSync",
  // Before every keymap and key handler, including the v4 keys (200) and StarterKit's.
  priority: 1000,
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: syncKey,
        props: {
          handleKeyDown(view) {
            catchUp(view);
            return false;
          },
        },
      }),
    ];
  },
});
