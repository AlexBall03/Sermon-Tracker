import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode, ResolvedPos } from "@tiptap/pm/model";
import { Plugin, Selection, TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

/*
 * Where a press in the white space between blocks puts the caret
 * (PS-1B.2B.2B). On a line of text the browser already places it. In the
 * space between blocks (a section's margin, the space below a paragraph) the
 * browser picks a place of its own, often in the block below, so the caret
 * jumped there while the button was held. A word processor puts it on the
 * nearest line, and so does this: on the line above or below, whichever is
 * closer to the press, at the press's horizontal place.
 *
 * Where the space is between two boxes with no line of text beside it (a
 * section and a point), the place between them is a gap cursor's, and the
 * press is left to ProseMirror's gap cursor, as before. A press on a
 * passage, a page break, or anything else not editable is never handled
 * here, nor one with a modifier (Shift extends a selection as the browser
 * does).
 */

/*
 * Whether a gap cursor may stand at a position: nothing that takes text on
 * either side, only box edges (an isolating node, an atom, or the end of a
 * container). The rule of `prosemirror-gapcursor`, whose own check is not
 * part of its public interface.
 */
function closed($pos: ResolvedPos, side: -1 | 1): boolean {
  for (let depth = $pos.depth; depth >= 0; depth -= 1) {
    const parent = $pos.node(depth);
    const index = side < 0 ? $pos.index(depth) : $pos.indexAfter(depth);
    const edge = side < 0 ? index === 0 : index === parent.childCount;
    if (edge) {
      if (parent.type.spec.isolating) return true;
      continue;
    }
    for (let node: ProseMirrorNode | null = parent.child(side < 0 ? index - 1 : index); node;) {
      if (
        (node.childCount === 0 && !node.inlineContent) ||
        node.isAtom ||
        node.type.spec.isolating
      ) {
        return true;
      }
      if (node.inlineContent) return false;
      node = side < 0 ? node.lastChild : node.firstChild;
    }
  }
  return true;
}

const gapAllowed = ($pos: ResolvedPos) =>
  !$pos.parent.inlineContent && closed($pos, -1) && closed($pos, 1);

/** The elements that are only containers: a press on them is in the space between their blocks. */
const containers =
  ".lab-editor, .lab-section, .lab-point, .lab-note, .lab-script, ul, ol, li, blockquote";

function contentBox(element: HTMLElement) {
  const box = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  const scale = box.width / (element.offsetWidth || 1) || 1;
  return {
    top: box.top + Number.parseFloat(style.paddingTop) * scale,
    bottom: box.bottom - Number.parseFloat(style.paddingBottom) * scale,
  };
}

function place(view: EditorView, event: MouseEvent): boolean {
  if (event.button !== 0 || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) {
    return false;
  }
  const target = event.target as HTMLElement | null;
  if (!target || !(target instanceof HTMLElement) || !target.matches(containers)) return false;
  if (target.closest('[contenteditable="false"]')) return false;
  const found = view.posAtCoords({ left: event.clientX, top: event.clientY });
  if (!found) return false;
  const { doc } = view.state;
  const $at = doc.resolve(found.pos);
  // The lines of text before and after the press, in the document's order.
  const before = Selection.findFrom($at, -1, true);
  const after = Selection.findFrom($at, 1, true);
  const lines = [before, after].filter(
    (selection): selection is TextSelection => selection instanceof TextSelection,
  );
  if (lines.length === 0) return false;
  // A place between them that belongs to a gap cursor (two boxes, no line beside it): ProseMirror's.
  if (before && after) {
    for (let pos = before.head; pos <= after.head; pos += 1) {
      const $pos = doc.resolve(pos);
      if (gapAllowed($pos)) return false;
    }
  }
  // The nearer line, measured from the press to the block's lines (its padding is space, not text).
  let best: { selection: TextSelection; distance: number; top: number; bottom: number } | null =
    null;
  for (const selection of lines) {
    const element = view.nodeDOM(selection.$head.before());
    if (!(element instanceof HTMLElement)) continue;
    const { top, bottom } = contentBox(element);
    const distance =
      event.clientY < top
        ? top - event.clientY
        : event.clientY > bottom
          ? event.clientY - bottom
          : 0;
    if (!best || distance < best.distance) best = { selection, distance, top, bottom };
  }
  if (!best) return false;
  // On that line, at the press's horizontal place.
  const y = Math.min(Math.max(event.clientY, best.top + 1), best.bottom - 1);
  const onLine = view.posAtCoords({ left: event.clientX, top: y });
  const block = best.selection.$head;
  const start = block.start();
  const end = block.end();
  const pos = onLine && onLine.pos >= start && onLine.pos <= end ? onLine.pos : best.selection.head;
  event.preventDefault();
  view.dispatch(view.state.tr.setSelection(TextSelection.create(doc, pos)).scrollIntoView());
  view.focus();
  return true;
}

export const ClickPlacement = Extension.create({
  name: "clickPlacement",
  addProseMirrorPlugins() {
    return [new Plugin({ props: { handleDOMEvents: { mousedown: place } } })];
  },
});
