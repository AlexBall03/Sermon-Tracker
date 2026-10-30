import { Extension } from "@tiptap/core";
import {
  NodeSelection,
  Plugin,
  PluginKey,
  Selection,
  TextSelection,
  type EditorState,
} from "@tiptap/pm/state";
import type { Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

import { isTextOnly } from "../changes";
import { isPrinting, viewOnly } from "../pagination/printing";
import { analyze, type Structure } from "./ownership";

/*
 * Folding points (A3.1): editor view state, never the document.
 *
 * A folded point keeps its heading on screen and hides everything it owns,
 * by the ownership analysis (`ownership.ts`): the document is a flat run of
 * top-level blocks with depths, so what a point owns is its group, from the
 * block after its heading to `groupEnd`, never ProseMirror children. Its
 * writing, passages, notes, scripts, and subpoints go; a sibling, or its
 * parent's writing after it, stays. A fold inside a folded point is kept, so
 * unfolding the parent shows the child as it was left.
 *
 * Only what is drawn changes: hidden blocks carry `data-folded` (a node
 * decoration; CSS hides them on screen only), and each point that owns
 * something gets a chevron before its heading. Folding is a metadata
 * transaction with no steps and no history (`viewOnly`), so it is never a
 * document change, a revision, a save, or an undo step; copying,
 * serializing, and printing see the whole document, and while the browser
 * prints nothing is folded at all (`printing.ts`).
 *
 * The selection is never left where it cannot be seen, and moved only then:
 * - folding a point around the caret puts it at the end of that point's heading;
 * - a selection moved into hidden content (keys, a node selected) goes past
 *   it in the direction it was going, or to the heading that hides it;
 * - an edit that leaves the caret in hidden content (Enter at the end of a
 *   folded heading, an undo) unfolds the points hiding it, and only those.
 * Any other selection, and every other point, is left as it is.
 */

export type FoldingLabels = { collapse: string; expand: string };

export type FoldingOptions = {
  /** The points folded when a document is opened (IDs; ones that are not there are ignored). */
  initial: () => readonly string[];
  /** Told the folded points whenever they change, to remember them on this device. */
  onChange: ((ids: readonly string[]) => void) | null;
  /** The chevron's words; without them no chevron is drawn (read-only previews). */
  labels: FoldingLabels | null;
};

type FoldingState = {
  /** Folded points that own something, by ID. */
  folded: ReadonlySet<string>;
  /** Top-level indices hidden by a fold, with the index of the outermost folded point hiding each. */
  hidden: ReadonlyMap<number, number>;
  decorations: DecorationSet;
};

type FoldingMeta = { fold: readonly string[] } | { unfold: readonly string[] } | { all: boolean };

export const foldingKey = new PluginKey<FoldingState>("labV4Folding");

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    pointFolding: {
      /** Folds (or unfolds) the point with this ID. View state: no document change, no history. */
      setPointFolded: (id: string, folded: boolean) => ReturnType;
      /** Folds (or unfolds) every point that owns something. */
      setAllPointsFolded: (folded: boolean) => ReturnType;
    };
  }
}

/** Points that own something: the only ones that can fold. */
function foldable(structure: Structure): Map<string, number> {
  const found = new Map<string, number>();
  structure.blocks.forEach((block, index) => {
    const id = block.node.attrs.id;
    if (block.isPoint && typeof id === "string" && structure.groupEnd[index] > index + 1) {
      found.set(id, index);
    }
  });
  return found;
}

/** Which blocks the folded points hide, each with the outermost fold hiding it. */
function hiddenBy(structure: Structure, folded: ReadonlySet<string>): Map<number, number> {
  const hidden = new Map<number, number>();
  structure.blocks.forEach((block, index) => {
    if (hidden.has(index) || !block.isPoint || !folded.has(block.node.attrs.id)) return;
    for (let member = index + 1; member < structure.groupEnd[index]; member += 1) {
      if (!hidden.has(member)) hidden.set(member, index);
    }
  });
  return hidden;
}

function chevron(view: EditorView, id: string, folded: boolean, labels: FoldingLabels) {
  const button = view.dom.ownerDocument.createElement("button");
  button.type = "button";
  button.className = "lab-fold-toggle";
  button.setAttribute("contenteditable", "false");
  button.tabIndex = -1;
  button.dataset.fold = folded ? "closed" : "open";
  button.setAttribute("aria-expanded", String(!folded));
  button.setAttribute("aria-label", folded ? labels.expand : labels.collapse);
  button.title = folded ? labels.expand : labels.collapse;
  // Never take the caret or the focus from the writing.
  button.addEventListener("mousedown", (event) => event.preventDefault());
  button.addEventListener("click", (event) => {
    event.preventDefault();
    if (!view.isDestroyed) setFolded(view.state, view.dispatch, [id], !folded);
  });
  return button;
}

function build(
  state: EditorState,
  folded: ReadonlySet<string>,
  labels: FoldingLabels | null,
): FoldingState {
  const structure = analyze(state.doc);
  const points = foldable(structure);
  const kept = new Set([...folded].filter((id) => points.has(id)));
  const hidden = hiddenBy(structure, kept);
  const decorations: Decoration[] = [];
  for (const [id, index] of points) {
    const block = structure.blocks[index];
    const closed = kept.has(id);
    decorations.push(
      Decoration.node(block.pos, block.pos + block.node.nodeSize, {
        "data-fold": closed ? "closed" : "open",
      }),
    );
    if (labels) {
      decorations.push(
        Decoration.widget(block.pos + 1, (view) => chevron(view, id, closed, labels), {
          side: -1,
          key: `fold:${id}:${closed ? "closed" : "open"}`,
          ignoreSelection: true,
          stopEvent: () => true,
        }),
      );
    }
  }
  for (const index of hidden.keys()) {
    const block = structure.blocks[index];
    decorations.push(
      Decoration.node(block.pos, block.pos + block.node.nodeSize, { "data-folded": "true" }),
    );
  }
  return {
    folded: sameSet(kept, folded) ? folded : kept,
    hidden,
    decorations: DecorationSet.create(state.doc, decorations),
  };
}

const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>) =>
  a.size === b.size && [...a].every((value) => b.has(value));

/** The top-level block index of a position, or null at the top level. */
function blockAt(state: EditorState, pos: number): number | null {
  const $pos = state.doc.resolve(pos);
  return $pos.depth === 0 ? null : $pos.index(0);
}

/** The top-level blocks the selection starts and ends in (a selected top-level node: that block). */
function selectionBlocks(state: EditorState, selection: Selection = state.selection): number[] {
  if (selection instanceof NodeSelection && selection.$from.depth === 0) {
    return [selection.$from.index(0)];
  }
  return [blockAt(state, selection.from), blockAt(state, selection.to)].filter(
    (index): index is number => index !== null,
  );
}

/** The folded point hiding the selection's start or end, or null when both can be seen. */
function hidingSelection(
  state: EditorState,
  hidden: ReadonlyMap<number, number>,
  selection: Selection = state.selection,
) {
  for (const index of selectionBlocks(state, selection)) {
    if (hidden.has(index)) return hidden.get(index)!;
  }
  return null;
}

/** The end of a point heading's words, where the caret goes when what it was in is folded away. */
function headingEnd(state: EditorState, index: number) {
  const block = analyze(state.doc).blocks[index];
  return TextSelection.create(state.doc, block.pos + block.node.nodeSize - 1);
}

/**
 * Folds or unfolds points (by ID), as one view-only transaction. When the
 * selection would be hidden by it, it goes to the end of the heading of the
 * outermost point hiding it, and nowhere else.
 */
function setFolded(
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined,
  ids: readonly string[],
  fold: boolean,
): boolean {
  const current = foldingKey.getState(state);
  if (!current) return false;
  const points = foldable(analyze(state.doc));
  const targets = ids.filter((id) => points.has(id) && current.folded.has(id) !== fold);
  if (targets.length === 0) return false;
  if (dispatch) dispatch(withMeta(state, current, fold ? { fold: targets } : { unfold: targets }));
  return true;
}

function nextFolded(previous: ReadonlySet<string>, meta: FoldingMeta, state: EditorState) {
  if ("all" in meta) return new Set(meta.all ? foldable(analyze(state.doc)).keys() : []);
  const next = new Set(previous);
  if ("fold" in meta) for (const id of meta.fold) next.add(id);
  else for (const id of meta.unfold) next.delete(id);
  return next;
}

/** A view-only transaction carrying a folding change, with the selection moved only if it would be hidden. */
function withMeta(state: EditorState, current: FoldingState, meta: FoldingMeta): Transaction {
  const tr = viewOnly(state.tr.setMeta(foldingKey, meta));
  const after = hiddenBy(analyze(state.doc), nextFolded(current.folded, meta, state));
  const hider = hidingSelection(state, after);
  if (hider !== null) tr.setSelection(headingEnd(state, hider));
  return tr;
}

/** Whether the points of a document can fold, and how many are folded: for a view's controls. */
export function foldingOf(state: EditorState) {
  const current = foldingKey.getState(state);
  const points = foldable(analyze(state.doc));
  let folded = 0;
  for (const id of points.keys()) if (current?.folded.has(id)) folded += 1;
  return { foldable: points.size, folded };
}

/**
 * The point a "collapse/expand this point" control acts on: the point the
 * caret is in or under that owns something, the nearest first. Its ID, and
 * whether it is folded.
 */
export function foldTargetAtCaret(state: EditorState): { id: string; folded: boolean } | null {
  const index = blockAt(state, state.selection.from);
  if (index === null) return null;
  const structure = analyze(state.doc);
  const points = foldable(structure);
  const current = foldingKey.getState(state);
  let at: number | null = structure.blocks[index].isPoint ? index : structure.owner[index];
  while (at !== null) {
    const id = structure.blocks[at].node.attrs.id;
    if (typeof id === "string" && points.has(id)) {
      return { id, folded: current?.folded.has(id) ?? false };
    }
    at = structure.owner[at];
  }
  return null;
}

export const PointFolding = Extension.create<FoldingOptions>({
  name: "pointFolding",

  addOptions() {
    return { initial: () => [], onChange: null, labels: null };
  },

  addCommands() {
    return {
      setPointFolded:
        (id, folded) =>
        ({ state, dispatch }) =>
          setFolded(state, dispatch, [id], folded),
      setAllPointsFolded:
        (folded) =>
        ({ state, dispatch }) => {
          const current = foldingKey.getState(state);
          if (!current) return false;
          const { foldable: count, folded: already } = foldingOf(state);
          if (count === 0 || (folded ? already === count : already === 0)) return false;
          if (dispatch) dispatch(withMeta(state, current, { all: folded }));
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const { labels, onChange } = this.options;
    const initial = this.options.initial;
    return [
      new Plugin<FoldingState>({
        key: foldingKey,
        state: {
          init: (_, state) => {
            let ids: readonly string[] = [];
            try {
              ids = initial();
            } catch {
              ids = [];
            }
            return build(state, new Set(ids.filter((id) => typeof id === "string")), labels);
          },
          apply(tr, previous, _old, state) {
            const meta = tr.getMeta(foldingKey) as FoldingMeta | undefined;
            if (meta) return build(state, nextFolded(previous.folded, meta, state), labels);
            if (!tr.docChanged) return previous;
            // Typing in a block moves nothing between groups: the decorations follow the text.
            if (isTextOnly([tr])) {
              return { ...previous, decorations: previous.decorations.map(tr.mapping, tr.doc) };
            }
            return build(state, previous.folded, labels);
          },
        },
        props: {
          // While the browser prints, nothing is folded.
          decorations: (state) =>
            isPrinting(state) ? null : foldingKey.getState(state)?.decorations,
        },
        appendTransaction(transactions, oldState, newState) {
          const current = foldingKey.getState(newState);
          if (!current || current.hidden.size === 0) return null;
          if (!transactions.some((tr) => tr.docChanged || tr.selectionSet)) return null;
          const hider = hidingSelection(newState, current.hidden);
          if (hider === null) return null;
          if (transactions.some((tr) => tr.docChanged)) {
            // An edit put the caret in folded content: show it, by unfolding only the points hiding it.
            const structure = analyze(newState.doc);
            const unfold = new Set<string>();
            for (const index of selectionBlocks(newState)) {
              if (!current.hidden.has(index)) continue;
              for (let at = structure.owner[index]; at !== null; at = structure.owner[at]) {
                const id = structure.blocks[at].node.attrs.id;
                if (typeof id === "string" && current.folded.has(id)) unfold.add(id);
              }
            }
            return unfold.size > 0
              ? viewOnly(newState.tr.setMeta(foldingKey, { unfold: [...unfold] }))
              : null;
          }
          // The selection alone moved into folded content: past it, the way it was going, or to its heading.
          const forward = newState.selection.from >= oldState.selection.from;
          const structure = analyze(newState.doc);
          const end = structure.groupEnd[hider];
          if (forward && end < structure.blocks.length) {
            const after = Selection.findFrom(
              newState.doc.resolve(structure.blocks[end].pos),
              1,
              true,
            );
            if (after) return newState.tr.setSelection(after).setMeta("addToHistory", false);
          }
          return newState.tr
            .setSelection(headingEnd(newState, hider))
            .setMeta("addToHistory", false);
        },
        view: () => ({
          update(view, previous) {
            const now = foldingKey.getState(view.state);
            const before = foldingKey.getState(previous);
            if (!onChange || !now || now.folded === before?.folded) return;
            try {
              onChange([...now.folded]);
            } catch {
              // Remembering folds is a convenience; it never stops the editor.
            }
          },
        }),
      }),
    ];
  },
});
