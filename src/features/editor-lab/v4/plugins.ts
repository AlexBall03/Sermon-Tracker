import { Extension } from "@tiptap/core";
import { Fragment, type Node as ProseMirrorNode, Slice } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Mapping, ReplaceAroundStep } from "@tiptap/pm/transform";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

import { isTextOnly } from "../changes";
import { protectedDeletion } from "./commands";
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
 *   (`rebase`);
 * - notices, the presentation, and the group around the caret (view only).
 */

const historyMeta = "history$";
const isUndoRedo = (tr: Transaction) => tr.getMeta(historyMeta) !== undefined;

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
  for (const { node, pos } of pointsIn(state.doc)) {
    if (typeof node.attrs.id !== "string" || survivors.has(node.attrs.id)) continue;
    const end = pos + node.nodeSize;
    const whole =
      tr.mapping.mapResult(pos, 1).deleted &&
      tr.mapping.mapResult(end, -1).deleted &&
      (node.content.size === 0 ||
        (tr.mapping.mapResult(pos + 1, 1).deleted && tr.mapping.mapResult(end - 1, -1).deleted));
    if (!whole) return true;
  }
  return false;
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

/** Moves a pasted slice's top-level blocks to the level where it lands, keeping its own shape. */
export function rebase(
  slice: Slice,
  state: EditorState,
  notify?: (notice: V4Notice) => void,
): Slice {
  const nodes: ProseMirrorNode[] = [];
  slice.content.forEach((node) => nodes.push(node));
  const carrier = nodes.find((node) => typeof node.attrs.depth === "number");
  if (!carrier) return slice;
  const { $from } = state.selection;
  const target = $from.depth === 0 ? null : state.doc.child($from.index(0));
  const context = typeof target?.attrs.depth === "number" ? target.attrs.depth : 0;
  // A pasted point goes under whatever holds the caret, so it takes over nothing that follows;
  // pasted writing joins it.
  const delta =
    carrier.type.name === "point"
      ? context + 1 - carrier.attrs.depth
      : context - carrier.attrs.depth;
  const taken = new Set<string>();
  roleCounts(state.doc).forEach((_count, role) => taken.add(role));
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
          if (endsPointUnsafely(tr, state)) return false;
          const before = roleCounts(state.doc);
          for (const [role, count] of roleCounts(tr.doc)) {
            if (count > Math.max(1, before.get(role) ?? 0)) return false;
          }
          return true;
        },
        appendTransaction(transactions, oldState, newState) {
          for (const tr of transactions) {
            const notice = tr.getMeta(noticeMeta) as V4Notice | undefined;
            if (notice) tell(notice);
          }
          return carryDepth(transactions, oldState, newState);
        },
        props: {
          transformPasted: (slice, view) => rebase(slice, view.state, tell),
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
