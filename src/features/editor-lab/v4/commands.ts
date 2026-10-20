import type { Node as ProseMirrorNode, ResolvedPos } from "@tiptap/pm/model";
import { liftListItem, sinkListItem } from "@tiptap/pm/schema-list";
import { Selection, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";

import type { Command } from "../outline-commands";
import { noticeMeta, structuralMeta, type PointRole, type V4Notice } from "./model";
import {
  analyze,
  analyzeShapes,
  groupRange,
  nearestPoint,
  nextSibling,
  ownerKeys,
  previousSibling,
  type Shape,
  type Structure,
} from "./ownership";

/*
 * Editing a v4 document (prototype). The commands keep four kinds of change apart:
 *
 * - ordinary text editing, left to ProseMirror wherever its own behaviour is
 *   right (typing, splitting and joining prose, line breaks, lists);
 * - semantic conversion: a point becomes prose (Backspace at its start, or
 *   "Remove point") or prose becomes a point;
 * - hierarchy: a point's level, changed in place (nothing moves), or a group
 *   moved (up, down, out to its parent's level);
 * - explicit deletion of a point with everything it owns.
 *
 * The rule that governs them: an edit never changes the owner of a block it
 * did not touch, unless changing ownership is what it is for, and then the
 * change is reported (`V4Notice`). A point's identity always stays with
 * the content it owns. Every command makes one transaction (one undo step),
 * checks before it changes anything, and returns false where it cannot apply.
 */

const structural = (tr: Transaction) => tr.setMeta(structuralMeta, true);
const notify = (tr: Transaction, notice: V4Notice) => tr.setMeta(noticeMeta, notice);

/** The index of the top-level block a position is in, or null at the top level itself. */
const blockIndex = ($pos: ResolvedPos) => ($pos.depth === 0 ? null : $pos.index(0));

/** Whether a point carries a link a person may not want to lose: a source point, a legacy entry, a role. */
const linked = (node: ProseMirrorNode) =>
  Boolean(node.attrs.sourcePointId || node.attrs.legacyEntryId || node.attrs.role);

/** The point heading holding the selection, when the selection is inside one heading. */
function pointHeading(state: EditorState) {
  const { $from, $to } = state.selection;
  if ($from.parent.type.name !== "point" || !$from.sameParent($to) || $from.depth !== 1) {
    return null;
  }
  return { index: $from.index(0), pos: $from.before(1), node: $from.parent };
}

/** The attributes a point's new first half takes when the point is split: a new identity, no links. */
function freshAttributes(attrs: Record<string, unknown>, from: unknown): Record<string, unknown> {
  return {
    ...attrs,
    id: null,
    derivedFrom: typeof from === "string" ? from : null,
    role: null,
    sourcePointId: null,
    presentation: null,
    legacyEntryId: null,
    legacyRevision: null,
    legacyParentId: null,
  };
}

/** The depth a block at `index` can take and stay regular, as close to `wanted` as it can. */
function regularDepth(structure: Structure, index: number, wanted: number): number {
  const open = structure.openBefore[index];
  let best = 0;
  for (const point of open) {
    const depth = structure.blocks[point].depth;
    if (depth <= wanted) best = depth;
  }
  return best;
}

/** How many blocks that the change did not touch now belong to someone else. */
function adopted(
  before: Structure,
  after: ProseMirrorNode,
  tr: Transaction,
  touched: Set<number>,
): number {
  const next = analyze(after);
  const oldKeys = ownerKeys(before);
  const newKeys = ownerKeys(next);
  let count = 0;
  before.blocks.forEach((block, index) => {
    if (touched.has(index)) return;
    const mapped = tr.mapping.mapResult(block.pos, 1);
    if (mapped.deleted) return;
    const now = next.blocks.findIndex((other) => other.pos === mapped.pos);
    if (now >= 0 && newKeys[now] !== oldKeys[index]) count += 1;
  });
  return count;
}

/* Enter */

/**
 * Enter in a point heading:
 * - at its end, an ordinary paragraph at the point's depth (its first line of writing);
 * - at the start of a heading with words, an empty point above it at the
 *   same level; the original keeps its identity, words, and content, and the caret stays on it;
 * - in the middle, a split: the words before the caret become a new point
 *   above (a new identity that remembers the original in `derivedFrom`, and
 *   no links); the original keeps its identity, source, role, the words
 *   after the caret, and everything it owns;
 * - in an empty point that owns nothing, the point becomes an ordinary
 *   paragraph where it stands, at the deepest depth that stays regular.
 * A selection inside the heading is deleted first. One transaction.
 */
export const enterInPoint: Command = (state, dispatch) => {
  const heading = pointHeading(state);
  if (!heading || !(state.selection instanceof TextSelection)) return false;
  if (!dispatch) return true;
  const structure = analyze(state.doc);
  const block = structure.blocks[heading.index];
  const tr = state.tr;
  if (!state.selection.empty) tr.deleteSelection();
  const at = tr.selection.from;
  const $at = tr.doc.resolve(at);
  const point = $at.parent;
  const offset = $at.parentOffset;
  const ownsNothing = structure.groupEnd[heading.index] === heading.index + 1;
  const { paragraph } = state.schema.nodes;

  if (point.content.size === 0 && ownsNothing) {
    const depth = regularDepth(structure, heading.index, block.depth);
    tr.setNodeMarkup(heading.pos, paragraph, {
      depth,
      textAlign: point.attrs.textAlign ?? null,
      format: point.attrs.format ?? null,
    });
    if (linked(point)) notify(tr, { code: "point_converted", linked: true });
  } else if (offset === 0) {
    tr.insert(heading.pos, state.schema.nodes.point.create({ depth: block.depth }));
  } else if (offset === point.content.size) {
    const after = heading.pos + point.nodeSize;
    tr.insert(after, paragraph.create({ depth: block.depth }));
    tr.setSelection(TextSelection.create(tr.doc, after + 1));
  } else {
    tr.split(at, 1, [{ type: point.type, attrs: point.attrs }]);
    tr.setNodeMarkup(heading.pos, undefined, freshAttributes(point.attrs, point.attrs.id));
    const second = heading.pos + tr.doc.nodeAt(heading.pos)!.nodeSize;
    tr.setSelection(TextSelection.create(tr.doc, second + 1));
  }
  dispatch(structural(tr).scrollIntoView());
  return true;
};

/* Conversion */

function convert(state: EditorState, index: number): Transaction {
  const structure = analyze(state.doc);
  const block = structure.blocks[index];
  const point = block.node;
  const tr = state.tr;
  // Everything the point owns comes up one level: its writing goes to its parent, its subpoints become its parent's.
  for (let member = index + 1; member < structure.groupEnd[index]; member += 1) {
    const other = structure.blocks[member];
    tr.setNodeAttribute(other.pos, "depth", Math.max(other.isPoint ? 1 : 0, other.depth - 1));
  }
  const styleName = point.attrs.styleName as string | null;
  const carried = { textAlign: point.attrs.textAlign ?? null, format: point.attrs.format ?? null };
  const depth = block.depth - 1;
  if (styleName?.startsWith("heading")) {
    tr.setNodeMarkup(block.pos, state.schema.nodes.heading, {
      ...carried,
      depth,
      level: Number(styleName.slice("heading".length)),
    });
  } else {
    tr.setNodeMarkup(block.pos, state.schema.nodes.paragraph, {
      ...carried,
      depth,
      styleName: styleName === "title" || styleName === "subtitle" ? styleName : null,
    });
  }
  return notify(structural(tr), { code: "point_converted", linked: linked(point) });
}

/** The point holding the caret becomes ordinary writing ("Remove point, keep content"). */
export const pointToProse: Command = (state, dispatch) => {
  const index = blockIndex(state.selection.$from);
  if (index === null || !state.doc.child(index).isTextblock) return false;
  if (state.doc.child(index).type.name !== "point") return false;
  if (dispatch) dispatch(convert(state, index).scrollIntoView());
  return true;
};

/**
 * Each selected top-level paragraph or heading becomes a point one level
 * below the point that owns it (a main point at the document's level). It
 * takes nothing with it: what follows stays where it belongs.
 */
export const proseToPoint: Command = (state, dispatch) => {
  const { $from, $to } = state.selection;
  const first = blockIndex($from);
  const last = blockIndex($to);
  if (first === null || last === null) return false;
  const structure = analyze(state.doc);
  const { point } = state.schema.nodes;
  const tr = state.tr;
  let changed = false;
  for (let index = first; index <= last; index += 1) {
    const block = structure.blocks[index];
    const name = block.node.type.name;
    if (name !== "paragraph" && name !== "heading") continue;
    const owner = structure.owner[index];
    const ownerDepth = owner === null ? 0 : structure.blocks[owner].depth;
    const styleName =
      name === "heading"
        ? `heading${block.node.attrs.level}`
        : (block.node.attrs.styleName ?? null);
    tr.setNodeMarkup(block.pos, point, {
      depth: ownerDepth + 1,
      styleName,
      textAlign: block.node.attrs.textAlign ?? null,
      format: block.node.attrs.format ?? null,
    });
    changed = true;
  }
  if (!changed) return false;
  if (dispatch) dispatch(structural(tr).scrollIntoView());
  return true;
};

/* Backspace and Delete */

/**
 * Backspace at the very start of a point heading. The heading is never
 * joined into the line above:
 * - an empty point that owns nothing is removed, and the caret goes to the end of the line before;
 * - any other point becomes ordinary writing (`convert`), keeping its words
 *   and everything under it; a second Backspace then joins as prose joins.
 */
export const backspaceInPoint: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  const heading = pointHeading(state);
  if (!heading || !empty || $from.parentOffset !== 0) return false;
  const structure = analyze(state.doc);
  const ownsNothing = structure.groupEnd[heading.index] === heading.index + 1;
  if (heading.node.content.size === 0 && ownsNothing) {
    if (!dispatch) return true;
    const end = heading.pos + heading.node.nodeSize;
    const tr =
      state.doc.childCount === 1
        ? state.tr.replaceWith(heading.pos, end, state.schema.nodes.paragraph.create())
        : state.tr.delete(heading.pos, end);
    tr.setSelection(Selection.near(tr.doc.resolve(tr.mapping.map(heading.pos)), -1));
    if (linked(heading.node)) notify(tr, { code: "point_removed", linked: true });
    dispatch(structural(tr).scrollIntoView());
    return true;
  }
  if (dispatch) dispatch(convert(state, heading.index).scrollIntoView());
  return true;
};

/** The end of the last text of a top-level block, or null where it has none. */
function textEnd(doc: ProseMirrorNode, index: number, pos: number) {
  const end = pos + doc.child(index).nodeSize;
  const found = Selection.findFrom(doc.resolve(end), -1, true);
  return found && found.from >= pos ? found.from : null;
}

/**
 * Delete at the end of a block straight before a point never joins the
 * point's heading into it (that would end the point and its identity): the
 * caret goes to the start of the heading instead, and an empty line on the
 * way is removed.
 */
export const deleteBeforePoint: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty) return false;
  const index = blockIndex($from);
  if (index === null || index + 1 >= state.doc.childCount) return false;
  if (state.doc.child(index + 1).type.name !== "point") return false;
  const pos = $from.before(1);
  if (textEnd(state.doc, index, pos) !== $from.pos) return false;
  if (!dispatch) return true;
  const block = state.doc.child(index);
  const tr = state.tr;
  let next = pos + block.nodeSize;
  if (block.isTextblock && block.content.size === 0 && block.type.name !== "point") {
    tr.delete(pos, next);
    next = pos;
  }
  tr.setSelection(TextSelection.create(tr.doc, next + 1));
  dispatch(tr.scrollIntoView());
  return true;
};

/**
 * Deleting a selection that ends inside a point heading which it starts
 * before. ProseMirror would join what is left of the heading into the first
 * block, ending the point; instead the selected words of the heading are
 * deleted and the heading stays a point, with its identity and everything
 * it owns. Points wholly selected are deleted, and the people told. Null
 * where ProseMirror's own deletion is already right.
 */
export function protectedDeletion(state: EditorState): Transaction | null {
  const { from, to, empty } = state.selection;
  if (empty || !(state.selection instanceof TextSelection)) return null;
  const $to = state.doc.resolve(to);
  const last = blockIndex($to);
  if (last === null) return null;
  const node = state.doc.child(last);
  if (node.type.name !== "point") return null;
  const start = $to.before(1);
  if (from >= start) return null;
  const tr = state.tr;
  tr.delete(start + 1, to);
  tr.delete(from, start);
  tr.setSelection(TextSelection.create(tr.doc, tr.mapping.map(from, -1)));
  const removed = countRemovedPoints(state, tr);
  if (removed.count > 0) {
    notify(tr, { code: "points_deleted", count: removed.count, linked: removed.linked });
  }
  return structural(tr);
}

function countRemovedPoints(state: EditorState, tr: Transaction) {
  const after = new Set<unknown>();
  tr.doc.forEach((node) => {
    if (node.type.name === "point") after.add(node.attrs.id);
  });
  let count = 0;
  let isLinked = false;
  state.doc.forEach((node) => {
    if (node.type.name === "point" && !after.has(node.attrs.id)) {
      count += 1;
      if (linked(node)) isLinked = true;
    }
  });
  return { count, linked: isLinked };
}

/** Backspace or Delete with a selection: the protected deletion where it applies. */
export const deleteSelection: Command = (state, dispatch) => {
  const tr = protectedDeletion(state);
  if (!tr) return false;
  if (dispatch) dispatch(tr.scrollIntoView());
  return true;
};

/** Deletes the point holding the caret and everything it owns ("Delete point and content"). */
export const deletePointGroup: Command = (state, dispatch) => {
  const index = blockIndex(state.selection.$from);
  if (index === null) return false;
  const structure = analyze(state.doc);
  const point = nearestPoint(structure, index);
  if (point === null) return false;
  if (!dispatch) return true;
  const { from, to, end } = groupRange(structure, point);
  const tr =
    from === 0 && to === state.doc.content.size
      ? state.tr.replaceWith(from, to, state.schema.nodes.paragraph.create())
      : state.tr.delete(from, to);
  tr.setSelection(Selection.near(tr.doc.resolve(Math.min(from, tr.doc.content.size)), -1));
  let points = 0;
  let isLinked = false;
  for (let member = point; member < end; member += 1) {
    const block = structure.blocks[member];
    if (block.isPoint) {
      points += 1;
      if (linked(block.node)) isLinked = true;
    }
  }
  notify(tr, { code: "points_deleted", count: points, linked: isLinked });
  dispatch(structural(tr).scrollIntoView());
  return true;
};

/* Levels */

/** The points the selection starts or ends in, or lies across, outermost only (the rest go with their groups). */
function selectedPoints(state: EditorState, structure: Structure): number[] {
  const first = blockIndex(state.selection.$from);
  const last = blockIndex(state.selection.$to);
  if (first === null || last === null) return [];
  const chosen: number[] = [];
  let coveredUntil = -1;
  for (let index = first; index <= last; index += 1) {
    if (!structure.blocks[index].isPoint || index < coveredUntil) continue;
    chosen.push(index);
    coveredUntil = structure.groupEnd[index];
  }
  return chosen;
}

/** Shifts the depth of blocks `from`..`to` (indices) by `by`. */
function shift(tr: Transaction, structure: Structure, from: number, to: number, by: number) {
  for (let index = from; index < to; index += 1) {
    const block = structure.blocks[index];
    tr.setNodeAttribute(block.pos, "depth", block.depth + by);
  }
}

/**
 * Increase level in place: each selected point, with its group, goes one
 * level down, under the sibling point straight before it. Nothing moves, and
 * nothing outside the group changes owner. Refused for a first child (there
 * is no point to go under), where parent-owned writing stands between it and
 * that sibling, and for a point with a role.
 */
export const increaseLevel: Command = (state, dispatch) => {
  const structure = analyze(state.doc);
  const points = selectedPoints(state, structure);
  if (points.length === 0) return false;
  for (const index of points) {
    const block = structure.blocks[index];
    if (block.node.attrs.role) return false;
    const sibling = previousSibling(structure, index);
    // The sibling must still be open: its group runs right up to this point.
    if (sibling === null || structure.groupEnd[sibling] !== index) return false;
  }
  if (!dispatch) return true;
  const tr = state.tr;
  for (const index of points) shift(tr, structure, index, structure.groupEnd[index], 1);
  dispatch(structural(tr).scrollIntoView());
  return true;
};

/**
 * Outdent in place: each selected point, with its group, comes one level up
 * where it stands. Nothing moves; what follows it at its old level (later
 * siblings, its parent's closing writing) now belongs to it. That change of
 * ownership is reported. "Move out" (`moveOut`) is the outdent that takes
 * nothing.
 */
export const decreaseLevel: Command = (state, dispatch) => {
  const structure = analyze(state.doc);
  const points = selectedPoints(state, structure);
  if (points.length === 0) return false;
  if (points.some((index) => structure.blocks[index].depth <= 1)) return false;
  if (!dispatch) return true;
  const tr = state.tr;
  const touched = new Set<number>();
  for (const index of points) {
    shift(tr, structure, index, structure.groupEnd[index], -1);
    for (let member = index; member < structure.groupEnd[index]; member += 1) touched.add(member);
  }
  const count = adopted(structure, tr.doc, tr, touched);
  if (count > 0) notify(tr, { code: "ownership_changed", count });
  dispatch(structural(tr).scrollIntoView());
  return true;
};

/**
 * Tab in writing (not in a point heading or a list): the block goes into
 * the point straight above it at the next level, where there is one open.
 */
export const indentProse: Command = (state, dispatch) => {
  const index = blockIndex(state.selection.$from);
  if (index === null || blockIndex(state.selection.$to) !== index) return false;
  const structure = analyze(state.doc);
  const block = structure.blocks[index];
  if (block.isPoint) return false;
  const wanted = block.depth + 1;
  if (regularDepth(structure, index, wanted) !== wanted) return false;
  if (dispatch) {
    dispatch(structural(state.tr.setNodeAttribute(block.pos, "depth", wanted)).scrollIntoView());
  }
  return true;
};

/**
 * Shift+Tab in writing: the block goes up to its owner's parent. What comes
 * after it in its owner's group goes up with it, since it could no longer
 * stay in a point that has ended; when that is more than the block, it is reported.
 */
export const outdentProse: Command = (state, dispatch) => {
  const index = blockIndex(state.selection.$from);
  if (index === null || blockIndex(state.selection.$to) !== index) return false;
  const structure = analyze(state.doc);
  const block = structure.blocks[index];
  if (block.isPoint || block.depth === 0) return false;
  if (!dispatch) return true;
  const owner = structure.owner[index];
  const end = owner === null ? index + 1 : structure.groupEnd[owner];
  const tr = state.tr;
  shift(tr, structure, index, end, -1);
  if (end - index > 1) notify(tr, { code: "ownership_changed", count: end - index });
  dispatch(structural(tr).scrollIntoView());
  return true;
};

/* Moving groups */

/** Rebuilds `from`..`to` (positions) of the document from block ranges, in a new order, keeping every node. */
function reorder(
  state: EditorState,
  structure: Structure,
  ranges: [number, number][],
  depthShift?: { from: number; to: number; by: number },
) {
  const nodes: ProseMirrorNode[] = [];
  for (const [from, to] of ranges) {
    for (let index = from; index < to; index += 1) {
      const block = structure.blocks[index];
      const moved =
        depthShift && index >= depthShift.from && index < depthShift.to
          ? block.node.type.create(
              { ...block.node.attrs, depth: block.depth + depthShift.by },
              block.node.content,
              block.node.marks,
            )
          : block.node;
      nodes.push(moved);
    }
  }
  return nodes;
}

/**
 * Moves the point holding the caret, with its group, past its previous or
 * next sibling's group. Writing between the two siblings belongs to their
 * parent and stays where it is, so nothing changes owner. Every node is the
 * same node, so every ID is kept. Refused where there is no sibling that way.
 */
export function moveGroup(direction: "up" | "down"): Command {
  return (state, dispatch) => {
    const index = blockIndex(state.selection.$from);
    if (index === null) return false;
    const structure = analyze(state.doc);
    const point = nearestPoint(structure, index);
    if (point === null) return false;
    const other =
      direction === "up" ? previousSibling(structure, point) : nextSibling(structure, point);
    if (other === null) return false;
    if (!dispatch) return true;
    const [first, second] = direction === "up" ? [other, point] : [point, other];
    const firstEnd = structure.groupEnd[first];
    const secondEnd = structure.groupEnd[second];
    const nodes = reorder(state, structure, [
      [second, secondEnd],
      [firstEnd, second],
      [first, firstEnd],
    ]);
    const from = structure.blocks[first].pos;
    const to = groupRange(structure, second).to;
    const caret = state.selection.from - structure.blocks[point].pos;
    const tr = state.tr.replaceWith(from, to, nodes);
    // Where the moved point now starts.
    let start = from;
    if (direction === "down") {
      for (let index2 = firstEnd; index2 < secondEnd; index2 += 1) {
        start += structure.blocks[index2].node.nodeSize;
      }
    }
    tr.setSelection(Selection.near(tr.doc.resolve(start + caret)));
    dispatch(structural(tr).scrollIntoView());
    return true;
  };
}

/**
 * Move out: the point holding the caret, with its group, goes one level up
 * and to just after its parent's group, so it takes over nothing.
 */
export const moveOut: Command = (state, dispatch) => {
  const index = blockIndex(state.selection.$from);
  if (index === null) return false;
  const structure = analyze(state.doc);
  const point = nearestPoint(structure, index);
  if (point === null) return false;
  const parent = structure.owner[point];
  if (parent === null || structure.blocks[point].depth <= 1) return false;
  if (!dispatch) return true;
  const end = structure.groupEnd[point];
  const parentEnd = structure.groupEnd[parent];
  const nodes = reorder(
    state,
    structure,
    [
      [end, parentEnd],
      [point, end],
    ],
    { from: point, to: end, by: -1 },
  );
  const from = structure.blocks[point].pos;
  const to = groupRange(structure, parentEnd - 1).to;
  const caret = state.selection.from - from;
  const tr = state.tr.replaceWith(from, to, nodes);
  let start = from;
  for (let other = end; other < parentEnd; other += 1) {
    start += structure.blocks[other].node.nodeSize;
  }
  tr.setSelection(Selection.near(tr.doc.resolve(start + caret)));
  dispatch(structural(tr).scrollIntoView());
  return true;
};

/* New points */

/**
 * A new point beside the point the caret is in or under (`sibling`), after
 * its whole group, or as its last subpoint (`child`). Outside any point,
 * a main point after the block holding the caret. Either way nothing is
 * split and nothing is taken over.
 */
export function addPoint(kind: "sibling" | "child"): Command {
  return (state, dispatch) => {
    const index = blockIndex(state.selection.$from);
    if (index === null) return false;
    const structure = analyze(state.doc);
    const point = nearestPoint(structure, index);
    if (kind === "child" && point === null) return false;
    if (!dispatch) return true;
    let at: number;
    let depth: number;
    if (point === null) {
      const block = structure.blocks[index];
      at = block.pos + block.node.nodeSize;
      depth = 1;
    } else {
      at = groupRange(structure, point).to;
      depth = structure.blocks[point].depth + (kind === "child" ? 1 : 0);
    }
    const tr = state.tr.insert(at, state.schema.nodes.point.create({ depth }));
    tr.setSelection(TextSelection.create(tr.doc, at + 1));
    dispatch(structural(tr).scrollIntoView());
    return true;
  };
}

/* Roles and looks */

/** Gives the main point holding the caret a role, or takes it away (null). One of each role at most. */
export function setRole(role: PointRole | null): Command {
  return (state, dispatch) => {
    const index = blockIndex(state.selection.$from);
    if (index === null) return false;
    const node = state.doc.child(index);
    if (node.type.name !== "point" || node.attrs.depth !== 1) return false;
    if (node.attrs.role === role) return false;
    if (role !== null) {
      let taken = false;
      state.doc.forEach((other) => {
        if (other.type.name === "point" && other.attrs.role === role) taken = true;
      });
      if (taken) return false;
    }
    if (dispatch) {
      const pos = state.selection.$from.before(1);
      dispatch(structural(state.tr.setNodeAttribute(pos, "role", role)));
    }
    return true;
  };
}

/** Gives the selected point headings a named style's look, or their component's (null). Their meaning is unchanged. */
export function setPointStyle(name: string | null): Command {
  return (state, dispatch) => {
    const first = blockIndex(state.selection.$from);
    const last = blockIndex(state.selection.$to);
    if (first === null || last === null) return false;
    const tr = state.tr;
    for (let index = first; index <= last; index += 1) {
      const node = state.doc.child(index);
      if (node.type.name !== "point") continue;
      let pos = 0;
      for (let other = 0; other < index; other += 1) pos += state.doc.child(other).nodeSize;
      tr.setNodeAttribute(pos, "styleName", name);
    }
    if (!tr.docChanged) return false;
    if (dispatch) dispatch(tr);
    return true;
  };
}

/* Keys */

const inList = (state: EditorState) => {
  for (let depth = state.selection.$from.depth; depth > 0; depth -= 1) {
    if (state.selection.$from.node(depth).type.name === "listItem") return true;
  }
  return false;
};

const listSink: Command = (state, dispatch) =>
  inList(state) && sinkListItem(state.schema.nodes.listItem)(state, dispatch);
const listLift: Command = (state, dispatch) =>
  inList(state) && liftListItem(state.schema.nodes.listItem)(state, dispatch);

export const firstOf =
  (...commands: Command[]): Command =>
  (state, dispatch) =>
    commands.some((command) => command(state, dispatch));

/** Tab: a list item sinks; a point goes a level down in place; writing goes into the point above. */
export const tab = firstOf(listSink, increaseLevel, indentProse);
/** Shift+Tab: a list item lifts; a point comes up in place; writing comes up to its owner's parent. */
export const shiftTab = firstOf(listLift, decreaseLevel, outdentProse);

/** For the tests: the shape of a document as the analysis reads it. */
export const shapesOf = (doc: ProseMirrorNode): Shape[] =>
  analyze(doc).blocks.map(({ isPoint, depth }) => ({ isPoint, depth }));
export { analyzeShapes };
