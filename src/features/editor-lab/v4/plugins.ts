import { Extension } from "@tiptap/core";
import { Fragment, type Node as ProseMirrorNode, type ResolvedPos, Slice } from "@tiptap/pm/model";
import {
  type NodeSelection,
  Plugin,
  PluginKey,
  TextSelection,
  type EditorState,
  type Transaction,
} from "@tiptap/pm/state";
import { dropPoint, Mapping, ReplaceAroundStep } from "@tiptap/pm/transform";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

import { isTextOnly } from "../changes";
import {
  backspaceInPoint,
  deleteBeforePoint,
  deleteSelection,
  deletionNotice,
  firstOf,
  protectedDeletion,
} from "./commands";
import { maxDepth, noticeMeta, structuralMeta, type PointRole, type V4Notice } from "./model";
import { analyze, groupRange, nearestPoint } from "./ownership";

/*
 * What keeps a v4 document's meaning safe while it is edited as ordinary text (prototype):
 *
 * - the integrity guard: no change outside a v4 command may end a point
 *   while any of its heading survives (a join, a type change by a built-in
 *   command, a deletion that stops inside a heading). A point ends only when
 *   all of it is deleted, or by a command that means to (`structuralMeta`);
 *   undo and redo always pass. Typing, pasting, and cutting over a selection
 *   that stops inside a heading use the protected deletion instead
 *   (`commands.ts`), so they are never refused;
 * - at most one introduction and one conclusion;
 * - depth stays on top-level blocks: a block that becomes top-level by a
 *   built-in change (lifted out of a list, wrapped in one, restyled as a
 *   heading) keeps the depth of the block it came from; blocks inside a
 *   container keep none. This carries a value; it never decides one;
 * - a paste lands at the level where it is put, keeping its own shape
 *   (`rebase`); so does a drop, and dragging within the document moves the
 *   same nodes, keeping their IDs (`dropInternal`);
 * - no depth outside its range;
 * - notices, the presentation, and the group around the caret (view only).
 *
 * The guard is the last line, not the editing experience: every ordinary
 * edit that would meet it is made safely by a command first. When it does
 * refuse something a person did, it says so (`change_refused`), never during
 * a composition, and never for the editor's own follow-up changes.
 */

const historyMeta = "history$";
const isUndoRedo = (tr: Transaction) => tr.getMeta(historyMeta) !== undefined;
const isComposing = (tr: Transaction) => Boolean(tr.getMeta("composition"));

type PointAt = { node: ProseMirrorNode; pos: number };

function pointsIn(doc: ProseMirrorNode): PointAt[] {
  const points: PointAt[] = [];
  doc.forEach((node, pos) => {
    if (node.type.name === "point") points.push({ node, pos });
  });
  return points;
}

/** Whether a change ends a point while some of it survives elsewhere. */
export function endsPointUnsafely(tr: Transaction, state: EditorState): boolean {
  // A built-in change of a point's type (a list, a heading, "Normal text").
  for (let index = 0; index < tr.steps.length; index += 1) {
    const step = tr.steps[index];
    if (!(step instanceof ReplaceAroundStep)) continue;
    const before = tr.docs[index].nodeAt(step.from);
    if (before?.type.name !== "point") continue;
    const after = (tr.docs[index + 1] ?? tr.doc).nodeAt(step.from);
    if (after?.type.name !== "point") return true;
  }
  const survivors = new Set<unknown>();
  tr.doc.forEach((node) => {
    if (node.type.name === "point") survivors.add(node.attrs.id);
  });
  let words: TextChange | null | undefined;
  for (const { node, pos } of pointsIn(state.doc)) {
    if (typeof node.attrs.id !== "string" || survivors.has(node.attrs.id)) continue;
    const end = pos + node.nodeSize;
    const whole =
      tr.mapping.mapResult(pos, 1).deleted &&
      tr.mapping.mapResult(end, -1).deleted &&
      (node.content.size === 0 ||
        (tr.mapping.mapResult(pos + 1, 1).deleted && tr.mapping.mapResult(end - 1, -1).deleted));
    if (!whole) return true;
    // The mapping can call a point deleted when its words were only rewritten in place: an edit
    // the browser made itself is read back as one replacement of the whole range.
    if (node.content.size === 0) continue;
    if (words === undefined) words = deletedText(state.doc, tr.doc);
    if (words && !coverable(words, textSpan(state.doc, pos, node))) return true;
  }
  return false;
}

/* Whether a point's words survive a deletion, by the text alone (the backstop above). */

const leaf = "￼";
const allText = (doc: ProseMirrorNode) => doc.textBetween(0, doc.content.size, "\n", leaf);

/** A change that only removed text: the old text's length, the new one's, and what both share at each end. */
type TextChange = { before: number; after: number; prefix: number; suffix: number };

/** How the document's text changed, when the change only deleted text; null when it also added some. */
function deletedText(before: ProseMirrorNode, after: ProseMirrorNode): TextChange | null {
  const old = allText(before);
  const now = allText(after);
  if (now.length >= old.length) return null;
  // Each end measured on its own, so every place the removed stretch could have been is allowed for.
  let prefix = 0;
  while (prefix < now.length && old[prefix] === now[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < now.length && old[old.length - 1 - suffix] === now[now.length - 1 - suffix]) {
    suffix += 1;
  }
  // Something was put in as well as taken out: not a pure deletion.
  if (prefix + suffix < now.length) return null;
  return { before: old.length, after: now.length, prefix, suffix };
}

/** Where a point's words are in the document's text: [start, end). */
function textSpan(doc: ProseMirrorNode, pos: number, node: ProseMirrorNode): [number, number] {
  const start = doc.textBetween(0, pos + 1, "\n", leaf).length;
  return [start, start + node.textBetween(0, node.content.size, "\n", leaf).length];
}

/**
 * Whether some stretch the deletion could have removed covers [start, end).
 * The removed stretch is `before - after` long and may start anywhere the
 * shared ends allow; the point's words are gone only if one such stretch
 * holds all of them.
 */
function coverable(change: TextChange, [start, end]: [number, number]): boolean {
  const removed = change.before - change.after;
  const lowest = Math.max(0, change.after - change.suffix, end - removed);
  const highest = Math.min(change.prefix, start);
  return lowest <= highest;
}

function roleCounts(doc: ProseMirrorNode) {
  const counts = new Map<string, number>();
  doc.forEach((node) => {
    if (node.type.name === "point" && node.attrs.role) {
      counts.set(node.attrs.role, (counts.get(node.attrs.role) ?? 0) + 1);
    }
  });
  return counts;
}

/** Whether a document holds more of a role than it had before (at most one of each). */
function rolesExceeded(before: ProseMirrorNode, after: ProseMirrorNode): boolean {
  const had = roleCounts(before);
  for (const [role, count] of roleCounts(after)) {
    if (count > Math.max(1, had.get(role) ?? 0)) return true;
  }
  return false;
}

/** Whether a top-level depth is out of range (a point's from 1, any other block's from 0, at most `maxDepth`). */
function depthOutOfRange(doc: ProseMirrorNode): boolean {
  let bad = false;
  doc.forEach((node) => {
    const { depth } = node.attrs;
    if (typeof depth !== "number") return;
    if (depth > maxDepth || depth < (node.type.name === "point" ? 1 : 0)) bad = true;
  });
  return bad;
}

/** Why the guard refuses a change that is not a v4 command, undo, or redo; false when it does not. */
export function unsafe(tr: Transaction, state: EditorState): boolean {
  return (
    endsPointUnsafely(tr, state) || rolesExceeded(state.doc, tr.doc) || depthOutOfRange(tr.doc)
  );
}

/**
 * Moves a pasted or dropped slice's top-level blocks to the level where it
 * lands (`$at`, in `doc`), keeping its own shape. A role the document
 * already has is dropped.
 */
export function rebase(
  slice: Slice,
  doc: ProseMirrorNode,
  $at: ResolvedPos,
  notify?: (notice: V4Notice) => void,
): Slice {
  const nodes: ProseMirrorNode[] = [];
  slice.content.forEach((node) => nodes.push(node));
  const carrier = nodes.find((node) => typeof node.attrs.depth === "number");
  if (!carrier) return slice;
  const target = $at.depth === 0 ? null : doc.child($at.index(0));
  const context = typeof target?.attrs.depth === "number" ? target.attrs.depth : 0;
  // A pasted point goes under whatever holds the caret, so it takes over nothing that follows;
  // pasted writing joins it.
  const delta =
    carrier.type.name === "point"
      ? context + 1 - carrier.attrs.depth
      : context - carrier.attrs.depth;
  const taken = new Set<string>();
  roleCounts(doc).forEach((_count, role) => taken.add(role));
  const moved = nodes.map((node) => {
    if (typeof node.attrs.depth !== "number") return node;
    const isPoint = node.type.name === "point";
    const depth = Math.min(maxDepth, Math.max(isPoint ? 1 : 0, node.attrs.depth + delta));
    let role = node.attrs.role as PointRole | null | undefined;
    if (isPoint && role) {
      if (taken.has(role) || depth !== 1) {
        notify?.({ code: "role_dropped", role });
        role = null;
      } else {
        taken.add(role);
      }
    }
    const attrs = isPoint ? { ...node.attrs, depth, role } : { ...node.attrs, depth };
    return node.type.create(attrs, node.content, node.marks);
  });
  return new Slice(Fragment.fromArray(moved), slice.openStart, slice.openEnd);
}

/** The depth carried to blocks that a built-in change made top-level, and none for nested blocks. */
function carryDepth(
  transactions: readonly Transaction[],
  oldState: EditorState,
  newState: EditorState,
): Transaction | null {
  if (!transactions.some((tr) => tr.docChanged) || isTextOnly(transactions)) return null;
  const carry = !transactions.some(
    (tr) =>
      tr.getMeta(structuralMeta) ||
      isUndoRedo(tr) ||
      tr.getMeta("uiEvent") === "paste" ||
      tr.getMeta("uiEvent") === "drop",
  );
  const mapping = new Mapping();
  for (const tr of transactions) mapping.appendMapping(tr.mapping);
  const back = mapping.invert();
  const tr = newState.tr;
  newState.doc.forEach((node, pos) => {
    node.descendants((child, offset) => {
      if (typeof child.attrs.depth === "number" && child.attrs.depth !== 0) {
        tr.setNodeAttribute(pos + 1 + offset, "depth", 0);
      }
      return true;
    });
    if (!carry || node.type.name === "point" || node.attrs.depth !== 0) return;
    if (typeof node.attrs.depth !== "number") return;
    // Its first text, mapped back: inside what it was made from (a wrapper's own edge maps to nothing).
    let inner = pos + 1;
    let found = false;
    node.descendants((child, offset) => {
      if (found) return false;
      if (child.isTextblock) {
        inner = pos + 1 + offset + 1;
        found = true;
        return false;
      }
      return true;
    });
    const old = Math.min(Math.max(back.map(inner, -1), 0), oldState.doc.content.size);
    const $old = oldState.doc.resolve(old);
    if ($old.depth < 1) return;
    const was = $old.node(1);
    if (was.type.name === "point") return;
    const depth = was.attrs.depth;
    if (typeof depth === "number" && depth > 0) tr.setNodeAttribute(pos, "depth", depth);
  });
  return tr.docChanged ? tr : null;
}

/**
 * The notice for an ordinary change that deleted points or left blocks with
 * another owner (a selection deleted, typed over, or pasted over), which
 * ProseMirror made itself. v4 commands report their own; undo, redo, a
 * composition, and the editor's own follow-up changes report nothing.
 */
function nativeNotice(
  transactions: readonly Transaction[],
  oldState: EditorState,
  after: ProseMirrorNode,
): V4Notice | null {
  const made = transactions.filter((tr) => !tr.getMeta("appendedTransaction"));
  if (!made.some((tr) => tr.docChanged) || isTextOnly(made)) return null;
  if (made.some((tr) => tr.getMeta(structuralMeta) || isUndoRedo(tr) || isComposing(tr))) {
    return null;
  }
  // Setting a depth moves nothing, so the carry needs no mapping of its own.
  const mapping = new Mapping();
  for (const tr of transactions) mapping.appendMapping(tr.mapping);
  return deletionNotice(oldState.doc, after, mapping);
}

/* Dragging within the document */

/** `view.dragging` as ProseMirror keeps it (its type leaves out `node`, set when a node is dragged). */
export type Dragging = { slice: Slice; move: boolean; node?: NodeSelection };

/**
 * A drop of content dragged from this editor. ProseMirror would pass the
 * slice through the paste rules, where content without a document stamp is
 * foreign (`clipboard.ts`) and gets new IDs: a moved point would lose its
 * identity. Here the dragged slice itself is placed, at the level where it
 * lands (`rebase`), so a move keeps every ID (the originals are gone) and a
 * copy is told apart by the identity step. A moved selection that ends in a
 * heading is removed by the protected deletion. One transaction, one undo
 * step. Content dragged from elsewhere is left to ProseMirror.
 */
function dropInternal(
  view: EditorView,
  event: DragEvent,
  moved: boolean,
  tell: (notice: V4Notice) => void,
): boolean {
  const dragging = view.dragging as Dragging | null;
  if (!dragging) return false;
  const found = view.posAtCoords({ left: event.clientX, top: event.clientY });
  if (!found) return false;
  const result = dropTransaction(view.state, dragging, found.pos, moved, tell);
  if (result === null) return false;
  if (result === "refused") {
    tell({ code: "change_refused" });
    return true;
  }
  view.focus();
  view.dispatch(result);
  return true;
}

/**
 * The top-level blocks a text selection covers whole (from the start of
 * its first block's words to the end of its last's), or null. Moving them
 * takes the blocks themselves, so no empty heading is left behind holding
 * the identity of the point that moved.
 */
function wholeBlocks(state: EditorState) {
  const { selection } = state;
  if (!(selection instanceof TextSelection) || selection.empty) return null;
  const { $from, $to } = selection;
  if ($from.depth !== 1 || $to.depth !== 1) return null;
  if ($from.parentOffset !== 0 || $to.parentOffset !== $to.parent.content.size) return null;
  const from = $from.before(1);
  const to = $to.after(1);
  // A document always keeps a block: moving all of it is left to the ordinary deletion.
  if (from === 0 && to === state.doc.content.size) return null;
  return { from, to };
}

/**
 * The transaction that drops `dragging` (from this document) at `pos`,
 * removing the original when it is a move; "refused" when the result would
 * break a point (nothing is changed); null when there is nothing to drop.
 */
export function dropTransaction(
  state: EditorState,
  dragging: Dragging,
  pos: number,
  moved: boolean,
  tell?: (notice: V4Notice) => void,
): Transaction | "refused" | null {
  let tr = state.tr;
  if (moved && dragging.node) dragging.node.replace(tr);
  else if (moved) {
    const whole = wholeBlocks(state);
    tr = whole
      ? state.tr.delete(whole.from, whole.to)
      : (protectedDeletion(state) ?? state.tr.deleteSelection());
  }
  const target = dropPoint(state.doc, pos, dragging.slice) ?? pos;
  const at = tr.mapping.map(target);
  // Between two blocks, the slice lands at the level of the block before it.
  const $context = tr.doc.resolve(at > 0 && tr.doc.resolve(at).depth === 0 ? at - 1 : at);
  const slice = rebase(dragging.slice, tr.doc, $context, tell);
  const before = tr.doc;
  const single = slice.openStart === 0 && slice.openEnd === 0 && slice.content.childCount === 1;
  if (single) tr.replaceRangeWith(at, at, slice.content.firstChild!);
  else tr.replaceRange(at, at, slice);
  if (tr.doc.eq(before)) return null;
  if (unsafe(tr, state)) return "refused";
  let end = at;
  tr.mapping.maps[tr.mapping.maps.length - 1].forEach((_from, _to, _newFrom, newTo) => {
    end = newTo;
  });
  tr.setSelection(TextSelection.between(tr.doc.resolve(at), tr.doc.resolve(end)));
  // The whole drop is one change: what it deleted is counted against what it put back.
  tr.setMeta(noticeMeta, deletionNotice(state.doc, tr.doc, tr.mapping) ?? undefined);
  return tr.setMeta(structuralMeta, true).setMeta("uiEvent", "drop").scrollIntoView();
}

/* Presentation: view state only, never the document's. */

export const presentations = ["outline", "manuscript"] as const;
export type Presentation = (typeof presentations)[number];

export const presentationKey = new PluginKey<Presentation>("labV4Presentation");

/** Shows the document as an indented outline or as a manuscript. Changes nothing in it, and is not undone. */
export function setPresentation(view: EditorView, presentation: Presentation) {
  view.dispatch(
    view.state.tr.setMeta(presentationKey, presentation).setMeta("addToHistory", false),
  );
}

export const presentationOf = (state: EditorState) => presentationKey.getState(state) ?? "outline";

/* The group around the caret: drawn beside the page, never printed. */

const groupKey = new PluginKey<DecorationSet>("labV4Group");

function groupDecorations(state: EditorState): DecorationSet {
  const { $from } = state.selection;
  if ($from.depth === 0) return DecorationSet.empty;
  const structure = analyze(state.doc);
  const point = nearestPoint(structure, $from.index(0));
  if (point === null) return DecorationSet.empty;
  const { end } = groupRange(structure, point);
  const decorations: Decoration[] = [];
  for (let index = point; index < end; index += 1) {
    const block = structure.blocks[index];
    decorations.push(
      Decoration.node(block.pos, block.pos + block.node.nodeSize, {
        class: index === point ? "lab-v4-group lab-v4-group-head" : "lab-v4-group",
      }),
    );
  }
  return DecorationSet.create(state.doc, decorations);
}

export type V4PluginOptions = { onNotice?: (notice: V4Notice) => void };

export const V4Plugins = Extension.create<V4PluginOptions>({
  name: "v4Plugins",
  addOptions() {
    return { onNotice: undefined };
  },
  addProseMirrorPlugins() {
    const options = this.options;
    const tell = (notice: V4Notice) => options.onNotice?.(notice);
    return [
      new Plugin({
        key: new PluginKey("labV4Guard"),
        filterTransaction(tr, state) {
          if (!tr.docChanged || tr.getMeta(structuralMeta) || isUndoRedo(tr)) return true;
          if (isTextOnly([tr])) return true;
          if (!unsafe(tr, state)) return true;
          // ProseMirror's own deletion on a cut is refused on purpose: the protected one follows (`cut` below).
          const expected = tr.getMeta("uiEvent") === "cut" && protectedDeletion(state) !== null;
          if (!expected && !isComposing(tr) && !tr.getMeta("appendedTransaction")) {
            tell({ code: "change_refused" });
          }
          return false;
        },
        appendTransaction(transactions, oldState, newState) {
          for (const tr of transactions) {
            const notice = tr.getMeta(noticeMeta) as V4Notice | undefined;
            if (notice) tell(notice);
          }
          const carry = carryDepth(transactions, oldState, newState);
          // Counted once the depth is carried, so a block made top-level is judged where it ends up.
          const native = nativeNotice(transactions, oldState, carry?.doc ?? newState.doc);
          if (native) tell(native);
          return carry;
        },
        props: {
          transformPasted: (slice, view) =>
            rebase(slice, view.state.doc, view.state.selection.$from, tell),
          handleDrop: (view, event, _slice, moved) => dropInternal(view, event, moved, tell),
          handleTextInput(view, _from, _to, text) {
            const tr = protectedDeletion(view.state);
            if (!tr) return false;
            view.dispatch(tr.insertText(text, tr.selection.from).scrollIntoView());
            return true;
          },
          handlePaste(view, _event, slice) {
            const tr = protectedDeletion(view.state);
            if (!tr) return false;
            view.dispatch(tr.replaceSelection(slice).setMeta("uiEvent", "paste").scrollIntoView());
            return true;
          },
          handleDOMEvents: {
            /*
             * A deletion the browser is about to make itself, with no key the
             * editor took (a context menu's Delete, a virtual keyboard,
             * assistive software): at a point's edge or over a selection into
             * a heading it is made the way the key makes it. Anywhere else,
             * and during a composition, it is left to the browser.
             */
            beforeinput(view, event) {
              const input = event as InputEvent;
              if (!input.cancelable || view.composing) return false;
              const backward = /^delete(Content|Word|SoftLine|HardLine)Backward$/.test(
                input.inputType,
              );
              const forward =
                /^delete(Content|Word|SoftLine|HardLine)Forward$/.test(input.inputType) ||
                input.inputType === "deleteContent";
              if (!backward && !forward) return false;
              const command = backward
                ? firstOf(deleteSelection, backspaceInPoint)
                : firstOf(deleteSelection, deleteBeforePoint);
              if (!command(view.state, view.dispatch)) return false;
              input.preventDefault();
              return true;
            },
            /*
             * A composition (an IME, a dead key, a virtual keyboard's word)
             * begun over a selection that ends in a heading: the browser would
             * replace the selection itself, merging what is left of the heading
             * into the writing (checked in a browser, PS-ER1). The selection is
             * deleted the protected way first, so the composition starts at a
             * caret; ProseMirror and the browser go on from there.
             */
            compositionstart(view) {
              const tr = protectedDeletion(view.state);
              if (tr) view.dispatch(tr);
              return false;
            },
            // ProseMirror copies, then its own deletion is refused by the guard; this one follows.
            cut(view) {
              if (!protectedDeletion(view.state)) return false;
              const before = view.state;
              queueMicrotask(() => {
                if (view.isDestroyed || view.state.doc !== before.doc) return;
                const tr = protectedDeletion(view.state);
                if (tr) view.dispatch(tr.setMeta("uiEvent", "cut").scrollIntoView());
              });
              return false;
            },
          },
        },
      }),
      new Plugin<Presentation>({
        key: presentationKey,
        state: {
          init: () => "outline",
          apply: (tr, previous) => (tr.getMeta(presentationKey) as Presentation) ?? previous,
        },
        props: {
          attributes: (state): Record<string, string> => ({
            "data-presentation": presentationKey.getState(state) ?? "outline",
          }),
        },
      }),
      new Plugin<DecorationSet>({
        key: groupKey,
        state: {
          init: (_, state) => groupDecorations(state),
          apply: (tr, previous, _old, state) =>
            tr.docChanged || tr.selectionSet ? groupDecorations(state) : previous,
        },
        props: { decorations: (state) => groupKey.getState(state) },
      }),
    ];
  },
});
