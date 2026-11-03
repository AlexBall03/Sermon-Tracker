import { Extension } from "@tiptap/core";
import { GapCursor } from "@tiptap/pm/gapcursor";
import { NodeSelection, Plugin, PluginKey, type Selection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

/*
 * A selected block the browser cannot hold is kept (A4.1, BUG-001).
 *
 * When the arrow keys select a block that has no text of its own (a passage,
 * a page break) and the blocks on both sides of it have none either,
 * ProseMirror puts the browser's selection between two uneditable elements.
 * Chrome does not keep such a selection: on the next key it moves it to a
 * place it can show, often the document's first heading or the end of an
 * earlier paragraph (measured in the lab, `tests/lab/navigation.spec.ts`).
 * ProseMirror then reads that move as the person's choice, so walking down a
 * document with three passages in a row sent the caret back to the top, again
 * and again. ProseMirror's own workaround for this (`temporarilyEditableNear`)
 * is applied only to Safari and to Chrome before version 63.
 *
 * The fix uses ProseMirror's public `createSelectionBetween`, which is asked
 * whenever a selection is read from the browser. It keeps the editor's own
 * selection only when all of these hold, and otherwise leaves the reading to
 * ProseMirror:
 *
 *   - the editor's selection is a selected block node or a gap cursor (neither
 *     is drawn as a browser selection, so the browser's place carries nothing);
 *   - no end of it can be held: each has an uneditable element, or nothing,
 *     on both sides;
 *   - the last thing the person did in the editor was a key, not a click or a
 *     touch (a click anywhere is always taken as it is);
 *   - the reading is of the current document: when the browser has changed the
 *     text itself (IME composition), ProseMirror asks about the new document, and
 *     that reading is always ProseMirror's.
 *
 * It changes only which selection is read; it never changes the document and
 * dispatches nothing.
 */

const heldKey = new PluginKey("labV4HeldSelection");

/** The last kind of input each editor saw. */
const lastInput = new WeakMap<EditorView, "key" | "pointer">();

/** Whether the browser can place its selection at `pos`: something editable is beside it. */
export function holdable(view: EditorView, pos: number): boolean {
  let place: { node: Node; offset: number };
  try {
    place = view.domAtPos(pos);
  } catch {
    return true;
  }
  const { node, offset } = place;
  // Inside text, or inside an element with no children: the browser keeps it.
  if (node.nodeType !== Node.ELEMENT_NODE || node.childNodes.length === 0) return true;
  const editable = (sibling: Node | null) =>
    !!sibling &&
    (sibling.nodeType === Node.TEXT_NODE ||
      (sibling.nodeType === Node.ELEMENT_NODE &&
        (sibling as HTMLElement).contentEditable !== "false"));
  return editable(node.childNodes[offset - 1] ?? null) || editable(node.childNodes[offset] ?? null);
}

/** Whether the browser cannot hold the DOM selection ProseMirror draws for `selection`. */
export function unholdable(view: EditorView, selection: Selection): boolean {
  if (selection instanceof GapCursor) return !holdable(view, selection.from);
  if (selection instanceof NodeSelection && selection.node.isBlock)
    return !holdable(view, selection.from) && !holdable(view, selection.to);
  return false;
}

/** The selection to keep in place of the browser's reading, or null to take the reading. Exported for the tests. */
export function keepSelection(view: EditorView): Selection | null {
  if (lastInput.get(view) !== "key") return null;
  const current = view.state.selection;
  return unholdable(view, current) ? current : null;
}

const pointer = (view: EditorView) => {
  lastInput.set(view, "pointer");
  return false;
};

export const HeldSelection = Extension.create({
  name: "v4HeldSelection",
  // Sees every key before any handler that might take it (CaretSync is 1000).
  priority: 1001,
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: heldKey,
        props: {
          handleDOMEvents: {
            keydown(view) {
              lastInput.set(view, "key");
              return false;
            },
            mousedown: pointer,
            pointerdown: pointer,
            touchstart: pointer,
          },
          createSelectionBetween(view, $anchor) {
            // Asked about a document the browser has just changed (typing it
            // reads natively, IME composition): that is not a move to keep
            // out, and the current selection would not belong to it.
            if ($anchor.doc !== view.state.doc) return null;
            return keepSelection(view);
          },
        },
      }),
    ];
  },
});
