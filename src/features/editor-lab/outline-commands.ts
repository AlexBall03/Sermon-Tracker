import { Extension, type Editor } from "@tiptap/core";
import { Fragment, type Node as ProseMirrorNode, type ResolvedPos } from "@tiptap/pm/model";
import { liftListItem, sinkListItem } from "@tiptap/pm/schema-list";
import { TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";

import { moveTarget, type MoveDirection } from "@/features/outlines/editor/moves";
import { outlineLimits } from "@/features/outlines/model";
import { planMove } from "@/features/outlines/tree";
import type { ScriptureReference } from "@/features/scripture/reference";
import { documentRows } from "./numbering";

/*
 * Changing the outline's shape inside the document. Each command reads the
 * points back as tree rows, asks the legacy editor's `moveTarget`
 * (`outlines/editor/moves.ts`) where a move goes, checks it with `planMove`
 * (`tree.ts`), and then takes the point out and puts the same node back in
 * one transaction, so it keeps its ID and carries everything under it. The
 * Tab key is never taken: indent and outdent are Alt+Shift+→/←, as in the
 * outline editor.
 */

export type Command = (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean;

type Found = { node: ProseMirrorNode; pos: number; depth: number };

/** The innermost node of `type` around a position. */
function around($pos: ResolvedPos, type: string): Found | null {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (node.type.name === type) return { node, pos: $pos.before(depth), depth };
  }
  return null;
}

export const pointAround = ($pos: ResolvedPos) => around($pos, "outlinePoint");

/** Where a point goes to be the `index`th among the points under `parentId`. */
export function insertionPoint(doc: ProseMirrorNode, parentId: string | null, index: number) {
  const rows = documentRows(doc);
  const siblings = rows.filter((row) => row.type === "point" && row.parentId === parentId);
  if (index < siblings.length) return siblings[index].pos;
  const last = siblings.at(-1);
  if (last) return last.pos + doc.nodeAt(last.pos)!.nodeSize;
  if (parentId === null) {
    const conclusion = rows.find((row) => row.type === "conclusion");
    return conclusion ? conclusion.pos : doc.content.size;
  }
  const parent = rows.find((row) => row.id === parentId);
  if (!parent) return null;
  // The end of the parent's content.
  return parent.pos + doc.nodeAt(parent.pos)!.nodeSize - 1;
}

const pointCount = (doc: ProseMirrorNode) => documentRows(doc).length;

/** Moves the point holding the cursor: up, down, indent, outdent, or out to the main points. */
export function movePoint(direction: MoveDirection): Command {
  return (state, dispatch) => {
    const point = pointAround(state.selection.$from);
    const id = point?.node.attrs.id;
    if (!point || typeof id !== "string") return false;
    const rows = documentRows(state.doc);
    const target = moveTarget(rows, id, direction);
    if (!target) return false;
    const plan = planMove(rows, id, target.parentId, target.index);
    if (!plan.ok || plan.placements.length === 0) return false;
    if (!dispatch) return true;

    const { from, to } = state.selection;
    const end = point.pos + point.node.nodeSize;
    const tr = state.tr.delete(point.pos, end);
    const at = insertionPoint(tr.doc, target.parentId, plan.position);
    if (at === null) return false;
    tr.insert(at, point.node);
    // The cursor goes with the point, where it was in it.
    const inside = (position: number) =>
      Math.min(Math.max(position - point.pos, 1), point.node.nodeSize - 1);
    tr.setSelection(
      TextSelection.between(tr.doc.resolve(at + inside(from)), tr.doc.resolve(at + inside(to))),
    );
    dispatch(tr.scrollIntoView());
    return true;
  };
}

/** Indent: a list item sinks into the list; otherwise the point moves in under the one before it. */
export const indent: Command = (state, dispatch) => {
  const item = state.schema.nodes.listItem;
  if (item && around(state.selection.$from, "listItem")) return sinkListItem(item)(state, dispatch);
  return movePoint("indent")(state, dispatch);
};

export const outdent: Command = (state, dispatch) => {
  const item = state.schema.nodes.listItem;
  if (item && around(state.selection.$from, "listItem")) return liftListItem(item)(state, dispatch);
  return movePoint("outdent")(state, dispatch);
};

/** What a new point holds: a title, notes as paragraphs, passages, and where it came from. */
export type PointSeed = {
  title?: string;
  notes?: string | null;
  references?: readonly ScriptureReference[];
  sourcePointId?: string | null;
};

/** One paragraph per line of notes. */
export function notesToParagraphs(state: EditorState, notes: string): ProseMirrorNode[] {
  const { paragraph } = state.schema.nodes;
  return notes
    .split("\n")
    .map((line) => paragraph.create(null, line ? state.schema.text(line) : null));
}

function newPoint(state: EditorState, seed: PointSeed = {}) {
  const { outlinePoint, entryTitle, entryPassages, scriptureReference } = state.schema.nodes;
  const children: ProseMirrorNode[] = [
    entryTitle.create(null, seed.title ? state.schema.text(seed.title) : null),
  ];
  if (seed.references && seed.references.length > 0) {
    children.push(
      entryPassages.create(
        null,
        seed.references.map((reference) => scriptureReference.create({ ...reference })),
      ),
    );
  }
  if (seed.notes) children.push(...notesToParagraphs(state, seed.notes));
  // No ID: the identity step gives it a new one.
  return outlinePoint.create({ sourcePointId: seed.sourcePointId ?? null }, children);
}

/** Where a new main point goes when the cursor is not in a point. */
function topLevelInsertion(state: EditorState) {
  const { $from } = state.selection;
  if ($from.depth === 0) return state.doc.content.size;
  const top = $from.node(1);
  // Never after the conclusion: before it.
  if (top.type.name === "sermonConclusion") return $from.before(1);
  return $from.after(1);
}

/**
 * A new point: beside the one holding the cursor (`sibling`), or as its last
 * subpoint (`child`). Outside a point it becomes a main point after the
 * block the cursor is in. A seed fills it, as inserting a saved point does.
 */
export function addPoint(kind: "sibling" | "child", seed?: PointSeed): Command {
  return (state, dispatch) => {
    if (pointCount(state.doc) >= outlineLimits.entries) return false;
    const point = pointAround(state.selection.$from);
    if (kind === "child" && !point) return false;
    const at = !point
      ? topLevelInsertion(state)
      : kind === "child"
        ? point.pos + point.node.nodeSize - 1
        : point.pos + point.node.nodeSize;
    if (!dispatch) return true;
    const tr = state.tr.insert(at, newPoint(state, seed));
    // Into the new point's title.
    tr.setSelection(TextSelection.create(tr.doc, at + 2 + (seed?.title?.length ?? 0)));
    dispatch(tr.scrollIntoView());
    return true;
  };
}

/** Where a point's body begins: after its title and its passages. */
function bodyStart(point: Found) {
  let pos = point.pos + 1;
  let index = 0;
  for (; index < point.node.childCount; index += 1) {
    const child = point.node.child(index);
    if (child.type.name !== "entryTitle" && child.type.name !== "entryPassages") break;
    pos += child.nodeSize;
  }
  return pos;
}

/**
 * Enter in a point's title. At its end it opens a paragraph of notes under
 * the title. Inside it, it splits the point: the words after the cursor
 * become a new point after this one, which gets a new ID and remembers this
 * one in `derivedFrom`; the body and the subpoints stay with the first part.
 */
export const titleEnter: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parent.type.name !== "entryTitle") return false;
  const holder =
    around($from, "outlinePoint") ??
    around($from, "sermonIntroduction") ??
    around($from, "sermonConclusion");
  if (!holder) return false;
  if (!dispatch) return true;

  if (
    $from.parentOffset === $from.parent.content.size ||
    holder.node.type.name !== "outlinePoint"
  ) {
    const at = bodyStart(holder);
    const tr = state.tr.insert(at, state.schema.nodes.paragraph.create());
    tr.setSelection(TextSelection.create(tr.doc, at + 1));
    dispatch(tr.scrollIntoView());
    return true;
  }

  if (pointCount(state.doc) >= outlineLimits.entries) return false;
  const titleEnd = $from.end();
  const rest = $from.parent.content.cut($from.parentOffset);
  const tr = state.tr.delete($from.pos, titleEnd);
  const after = tr.mapping.map(holder.pos + holder.node.nodeSize);
  const { outlinePoint, entryTitle } = state.schema.nodes;
  tr.insert(
    after,
    outlinePoint.create(
      { derivedFrom: holder.node.attrs.id ?? null, sourcePointId: null },
      entryTitle.create(null, rest),
    ),
  );
  tr.setSelection(TextSelection.create(tr.doc, after + 2));
  dispatch(tr.scrollIntoView());
  return true;
};

/**
 * Backspace at the very start of a point's title, when the node before it is
 * a point beside it: the two become one. The first keeps its node and ID; the
 * second's title is added to the first's, its passages after the first's, and
 * its body and subpoints after the first's. The second ID is retired.
 */
export const mergeWithPrevious: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parent.type.name !== "entryTitle" || $from.parentOffset !== 0) return false;
  const current = pointAround($from);
  if (!current) return false;
  const $point = state.doc.resolve(current.pos);
  const previous = $point.nodeBefore;
  if (!previous || previous.type.name !== "outlinePoint") return false;
  if (!dispatch) return true;

  const parts = (node: ProseMirrorNode) => {
    let title: ProseMirrorNode | null = null;
    let passages: ProseMirrorNode | null = null;
    const rest: ProseMirrorNode[] = [];
    node.forEach((child) => {
      if (child.type.name === "entryTitle") title = child;
      else if (child.type.name === "entryPassages") passages = child;
      else rest.push(child);
    });
    return {
      title: title as ProseMirrorNode | null,
      passages: passages as ProseMirrorNode | null,
      rest,
    };
  };
  const first = parts(previous);
  const second = parts(current.node);
  const { entryTitle, entryPassages } = state.schema.nodes;
  const join = first.title?.content.size ?? 0;
  const title = entryTitle.create(
    null,
    (first.title?.content ?? Fragment.empty).append(second.title?.content ?? Fragment.empty),
  );
  const references = [
    ...(first.passages ? first.passages.content.content : []),
    ...(second.passages ? second.passages.content.content : []),
  ];
  const children = [title];
  if (references.length > 0) children.push(entryPassages.create(null, references));
  const merged = previous.type.create(previous.attrs, [...children, ...first.rest, ...second.rest]);

  const start = current.pos - previous.nodeSize;
  const tr = state.tr.replaceWith(start, current.pos + current.node.nodeSize, merged);
  tr.setSelection(TextSelection.create(tr.doc, start + 2 + join));
  dispatch(tr.scrollIntoView());
  return true;
};

/** A passage at the cursor: in an entry's passages when the cursor is in its title, otherwise inline. */
export function insertReference(reference: ScriptureReference): Command {
  return (state, dispatch) => {
    const { scriptureReference, entryPassages } = state.schema.nodes;
    const node = scriptureReference.create({ ...reference });
    const { $from } = state.selection;
    if ($from.parent.type.name === "entryTitle" || $from.parent.type.name === "entryPassages") {
      const holder =
        around($from, "outlinePoint") ??
        around($from, "sermonIntroduction") ??
        around($from, "sermonConclusion");
      if (!holder) return false;
      const titleNode = holder.node.firstChild!;
      const second = holder.node.childCount > 1 ? holder.node.child(1) : null;
      if (second?.type.name === "entryPassages") {
        if (second.childCount >= outlineLimits.references) return false;
        if (!dispatch) return true;
        const at = holder.pos + 1 + titleNode.nodeSize + second.nodeSize - 1;
        dispatch(state.tr.insert(at, node).scrollIntoView());
        return true;
      }
      if (!dispatch) return true;
      const at = holder.pos + 1 + titleNode.nodeSize;
      dispatch(state.tr.insert(at, entryPassages.create(null, node)).scrollIntoView());
      return true;
    }
    if (!$from.parent.inlineContent) return false;
    if (!$from.parent.canReplaceWith($from.index(), $from.index(), scriptureReference))
      return false;
    if (!dispatch) return true;
    dispatch(state.tr.replaceSelectionWith(node, false).scrollIntoView());
    return true;
  };
}

/** Runs a command against an editor. */
export const run = (editor: Editor, command: Command) =>
  command(editor.state, (tr) => editor.view.dispatch(tr));

export const OutlineKeymap = Extension.create({
  name: "outlineKeymap",
  // Before the paragraph and list keymaps.
  priority: 200,
  addKeyboardShortcuts() {
    const on = (command: Command) => () => run(this.editor, command);
    return {
      "Alt-Shift-ArrowUp": on(movePoint("up")),
      "Alt-Shift-ArrowDown": on(movePoint("down")),
      "Alt-Shift-ArrowRight": on(indent),
      "Alt-Shift-ArrowLeft": on(outdent),
      "Mod-Enter": on(addPoint("sibling")),
      "Mod-Shift-Enter": on(addPoint("child")),
      Enter: on(titleEnter),
      Backspace: on(mergeWithPrevious),
    };
  },
});
