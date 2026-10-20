import { Extension, type Editor } from "@tiptap/core";
import { Fragment, type Node as ProseMirrorNode, type ResolvedPos } from "@tiptap/pm/model";
import { GapCursor } from "@tiptap/pm/gapcursor";
import { liftListItem, sinkListItem } from "@tiptap/pm/schema-list";
import {
  NodeSelection,
  Plugin,
  PluginKey,
  Selection,
  TextSelection,
  type EditorState,
  type Transaction,
} from "@tiptap/pm/state";

import { moveTarget, type MoveDirection } from "@/features/outlines/editor/moves";
import { outlineLimits } from "@/features/outlines/model";
import { planMove } from "@/features/outlines/tree";
import type { ScriptureReference } from "@/features/scripture/reference";
import { documentRows } from "./numbering";
import type { SectionRole } from "./schema/model";
import { isTextOnly } from "./changes";

/*
 * Changing the document's structure (PS-1B.1 §B.5). A point owns exactly
 * what is nested in it: its title, its body, and its subpoints. Prose between
 * two sibling points belongs to their parent, so it stays where it was written
 * when a point moves, and a point always moves with everything it owns.
 *
 * Moves read the points back as tree rows, ask the legacy editor's
 * `moveTarget` (`outlines/editor/moves.ts`) where a move goes, and check it
 * with `planMove` (`tree.ts`). Up and down exchange the point with the
 * sibling point beside it: the two trade places and whatever lies between
 * them (prose, a section, a page break) stays where it is, so down undoes up
 * (PS-1B.2A closeout). Indent, outdent, and the move to the main points take
 * the point out and put it back where `planMove` says. Either way the same
 * nodes move in one transaction, so every ID is kept and a point carries
 * everything under it.
 * Every command checks before it changes anything and returns false when it
 * cannot apply; the toolbar, the keyboard, and the tests call the same ones.
 * The Tab key is never taken.
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
const sectionAround = ($pos: ResolvedPos) => around($pos, "sermonSection");

const titleTypes = new Set(["pointTitle", "sectionTitle"]);
const containerTypes = new Set(["outlinePoint", "sermonSection"]);

/** The point or section whose title holds the cursor. */
function titleHolder($pos: ResolvedPos): Found | null {
  if (!titleTypes.has($pos.parent.type.name) || $pos.depth < 1) return null;
  return {
    node: $pos.node($pos.depth - 1),
    pos: $pos.before($pos.depth - 1),
    depth: $pos.depth - 1,
  };
}

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

/** Points and sections in a document. */
const entryCount = (doc: ProseMirrorNode) => documentRows(doc).length;

/** Points and sections in a node, the node included. */
function entriesIn(node: ProseMirrorNode) {
  let count = containerTypes.has(node.type.name) ? 1 : 0;
  node.descendants((child) => {
    if (containerTypes.has(child.type.name)) count += 1;
    return child.type.name === "outlinePoint";
  });
  return count;
}

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
    // The cursor goes with the point, where it was in it.
    const inside = (position: number) =>
      Math.min(Math.max(position - point.pos, 1), point.node.nodeSize - 1);
    const follow = (tr: Transaction, at: number) =>
      tr.setSelection(
        TextSelection.between(tr.doc.resolve(at + inside(from)), tr.doc.resolve(at + inside(to))),
      );

    if (direction === "up" || direction === "down") {
      const siblings = rows.filter(
        (row) => row.type === "point" && row.parentId === target.parentId,
      );
      const place = siblings.findIndex((row) => row.id === id);
      const other = siblings[direction === "up" ? place - 1 : place + 1];
      if (!other) return false;
      const otherNode = state.doc.nodeAt(other.pos)!;
      const [first, second] =
        direction === "up"
          ? [{ pos: other.pos, node: otherNode }, point]
          : [point, { pos: other.pos, node: otherNode }];
      // The later slot first, so the earlier one's position still holds.
      const tr = state.tr
        .replaceWith(second.pos, second.pos + second.node.nodeSize, first.node)
        .replaceWith(first.pos, first.pos + first.node.nodeSize, second.node);
      const at =
        direction === "up" ? first.pos : second.pos + second.node.nodeSize - first.node.nodeSize;
      dispatch(follow(tr, at).scrollIntoView());
      return true;
    }

    const end = point.pos + point.node.nodeSize;
    const tr = state.tr.delete(point.pos, end);
    const at = insertionPoint(tr.doc, target.parentId, plan.position);
    if (at === null) return false;
    tr.insert(at, point.node);
    dispatch(follow(tr, at).scrollIntoView());
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

/** What a new point holds: a title, passages, notes as paragraphs, and where it came from. */
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

/** A passage block a person inserts: printed in full, following the document's translation. */
function passageNode(state: EditorState, reference: ScriptureReference) {
  return state.schema.nodes.scripturePassage.create({
    ...reference,
    translation: null,
    print: "full",
  });
}

function newPoint(state: EditorState, seed: PointSeed = {}) {
  const { outlinePoint, pointTitle } = state.schema.nodes;
  const children: ProseMirrorNode[] = [
    pointTitle.create(null, seed.title ? state.schema.text(seed.title) : null),
  ];
  for (const reference of seed.references ?? []) children.push(passageNode(state, reference));
  if (seed.notes) children.push(...notesToParagraphs(state, seed.notes));
  // No ID: the identity step gives it a new one.
  return outlinePoint.create({ sourcePointId: seed.sourcePointId ?? null }, children);
}

/** Where a new main point goes when the cursor is not in a point: after the top-level block it is in. */
function topLevelInsertion(state: EditorState) {
  const { $from } = state.selection;
  if ($from.depth === 0) return state.doc.content.size;
  return $from.after(1);
}

/**
 * A new point: beside the one holding the cursor (`sibling`), or as its last
 * subpoint (`child`). Outside a point it becomes a main point after the
 * block the cursor is in. A seed fills it, as inserting a saved point does.
 */
export function addPoint(kind: "sibling" | "child", seed?: PointSeed): Command {
  return (state, dispatch) => {
    if (entryCount(state.doc) >= outlineLimits.entries) return false;
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

/** Where a container's body begins: after its title and the passages straight after it. */
function bodyStart(holder: Found) {
  let pos = holder.pos + 1;
  for (let index = 0; index < holder.node.childCount; index += 1) {
    const child = holder.node.child(index);
    if (index > 0 && child.type.name !== "scripturePassage") break;
    pos += child.nodeSize;
  }
  return pos;
}

/**
 * Enter in a title (§B.4):
 * - at its end, or inside a section's title, it opens a paragraph at the start
 *   of the body (after the passages that follow the title);
 * - at the very start of a section's non-empty title, it opens an empty line
 *   before the section, moving the section down; the caret stays on the title;
 * - at the very start of a point's non-empty title, it opens an empty point
 *   before this one, which keeps its ID, its words, and everything it owns;
 * - inside a point's title, it splits the point: the words after the cursor
 *   (marks and inline passages included) become a new point after this one,
 *   which gets a new ID and remembers this one in `derivedFrom`; the body and
 *   the subpoints stay with the first part.
 */
export const titleEnter: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty) return false;
  const holder = titleHolder($from);
  if (!holder) return false;
  const isPoint = holder.node.type.name === "outlinePoint";
  const atEnd = $from.parentOffset === $from.parent.content.size;

  // At the very start of a section's title, Enter moves the whole section down: an empty
  // line opens above it, and the caret stays on the title, as at the start of a heading (PS-1B.2B.2B).
  if (!isPoint && $from.parentOffset === 0 && !atEnd) {
    const $section = state.doc.resolve(holder.pos);
    const { paragraph } = state.schema.nodes;
    if (!$section.parent.canReplaceWith($section.index(), $section.index(), paragraph))
      return false;
    if (!dispatch) return true;
    dispatch(state.tr.insert(holder.pos, paragraph.create()).scrollIntoView());
    return true;
  }

  if (atEnd || !isPoint) {
    if (!dispatch) return true;
    const at = bodyStart(holder);
    const tr = state.tr.insert(at, state.schema.nodes.paragraph.create());
    tr.setSelection(TextSelection.create(tr.doc, at + 1));
    dispatch(tr.scrollIntoView());
    return true;
  }

  if (entryCount(state.doc) >= outlineLimits.entries) return false;
  const { outlinePoint, pointTitle } = state.schema.nodes;

  if ($from.parentOffset === 0) {
    if (!dispatch) return true;
    const blank = outlinePoint.create({ sourcePointId: null }, pointTitle.create());
    const tr = state.tr.insert(holder.pos, blank);
    tr.setSelection(TextSelection.create(tr.doc, holder.pos + blank.nodeSize + 2));
    dispatch(tr.scrollIntoView());
    return true;
  }

  if (!dispatch) return true;
  const titleEnd = $from.end();
  const rest = $from.parent.content.cut($from.parentOffset);
  const tr = state.tr.delete($from.pos, titleEnd);
  const after = tr.mapping.map(holder.pos + holder.node.nodeSize);
  tr.insert(
    after,
    outlinePoint.create(
      { derivedFrom: holder.node.attrs.id ?? null, sourcePointId: null },
      pointTitle.create(null, rest),
    ),
  );
  tr.setSelection(TextSelection.create(tr.doc, after + 2));
  dispatch(tr.scrollIntoView());
  return true;
};

/**
 * The two points become one, when the node before the cursor's point is a
 * point beside it (a command; Backspace reaches the same end in two steps,
 * through `unwrapPoint` and `backspaceAfterContainer`, as a word processor
 * does with list items). The first keeps its node and ID; the
 * second's title (with its marks) is added to the first's, and its body and
 * subpoints after the first's. The second ID is retired; its source point's
 * link ends with it.
 */
export const mergeWithPrevious: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parent.type.name !== "pointTitle" || $from.parentOffset !== 0) return false;
  const current = pointAround($from);
  if (!current) return false;
  const previous = state.doc.resolve(current.pos).nodeBefore;
  if (!previous || previous.type.name !== "outlinePoint") return false;
  if (!dispatch) return true;

  const parts = (node: ProseMirrorNode) => {
    const rest: ProseMirrorNode[] = [];
    node.forEach((child, _offset, index) => {
      if (index > 0) rest.push(child);
    });
    return { title: node.firstChild!, rest };
  };
  const head = parts(previous);
  const second = parts(current.node);
  const join = head.title.content.size;
  const title = state.schema.nodes.pointTitle.create(
    null,
    head.title.content.append(second.title.content),
  );
  const merged = previous.type.create(previous.attrs, [title, ...head.rest, ...second.rest]);

  const start = current.pos - previous.nodeSize;
  const tr = state.tr.replaceWith(start, current.pos + current.node.nodeSize, merged);
  tr.setSelection(TextSelection.create(tr.doc, start + 2 + join));
  dispatch(tr.scrollIntoView());
  return true;
};

/**
 * Enter in an empty paragraph that is the last thing in a point or section
 * (§B.5, "leaving a point"): the paragraph moves out to just after it, where
 * it belongs to the point's parent (the enclosing point, or the document).
 */
export const leaveContainer: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parent.type.name !== "paragraph" || $from.parent.content.size > 0) {
    return false;
  }
  const depth = $from.depth - 1;
  if (depth < 1) return false;
  const container = $from.node(depth);
  if (!containerTypes.has(container.type.name)) return false;
  if ($from.index(depth) !== container.childCount - 1) return false;
  if (!dispatch) return true;

  const paragraphStart = $from.before();
  const tr = state.tr.delete(paragraphStart, paragraphStart + $from.parent.nodeSize);
  const after = tr.mapping.map($from.after(depth));
  tr.insert(after, state.schema.nodes.paragraph.create());
  tr.setSelection(TextSelection.create(tr.doc, after + 1));
  dispatch(tr.scrollIntoView());
  return true;
};

/**
 * Backspace in a point that holds nothing (an empty title, no body, no
 * subpoints): the point is removed and the cursor goes to the end of the line
 * before it, as Backspace removes an empty list item in a word processor
 * (the owner's decision, PS-1B.2B.1). A document left with nothing gets one
 * empty line.
 */
export const removeEmptyPoint: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parent.type.name !== "pointTitle" || $from.parent.content.size > 0) {
    return false;
  }
  const current = pointAround($from);
  if (!current || current.node.childCount !== 1) return false;
  if (!dispatch) return true;
  const end = current.pos + current.node.nodeSize;
  const tr =
    current.depth === 1 && state.doc.childCount === 1
      ? state.tr.replaceWith(current.pos, end, state.schema.nodes.paragraph.create())
      : state.tr.delete(current.pos, end);
  tr.setSelection(Selection.near(tr.doc.resolve(tr.mapping.map(current.pos)), -1));
  dispatch(tr.scrollIntoView());
  return true;
};

/**
 * Backspace at the very start of a point's title: the point becomes ordinary
 * writing again, as Backspace takes the bullet off a list item (the owner's
 * decision, PS-1B.2B.1). Its title becomes a paragraph with the same words
 * and marks, in the same place; its body follows it unchanged; its subpoints
 * keep their IDs and everything they own and move up one level, to the
 * point's parent. Nothing is deleted, the point's own ID is retired, and one
 * undo restores it. A second Backspace then joins that paragraph to the line
 * before (`backspaceAfterContainer`).
 */
export const unwrapPoint: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parent.type.name !== "pointTitle" || $from.parentOffset !== 0) return false;
  const current = pointAround($from);
  if (!current) return false;
  const { paragraph } = state.schema.nodes;
  const title = current.node.firstChild!;
  if (!paragraph.validContent(title.content)) return false;
  const rest: ProseMirrorNode[] = [];
  current.node.forEach((child, _offset, index) => {
    if (index > 0) rest.push(child);
  });
  const replacement = [paragraph.create(null, title.content), ...rest];
  const $point = state.doc.resolve(current.pos);
  const index = $point.index();
  if (!$point.parent.canReplace(index, index + 1, Fragment.from(replacement))) return false;
  if (!dispatch) return true;
  const tr = state.tr.replaceWith(current.pos, current.pos + current.node.nodeSize, replacement);
  tr.setSelection(TextSelection.create(tr.doc, current.pos + 1));
  dispatch(tr.scrollIntoView());
  return true;
};

/**
 * Backspace at the start of a block straight after a point or a section. The
 * container is a boundary that editing does not cross by accident: its whole
 * node is never selected (where a second Backspace would delete it with
 * everything it owns). Instead, as in a word processor:
 *
 * - an empty line is removed, and the cursor goes to the end of the point's
 *   last text;
 * - a line with words is joined to the end of the point's last text, when
 *   that text can hold them (a title holds no line break); otherwise the
 *   cursor goes there and nothing changes.
 */
export const backspaceAfterContainer: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || $from.parentOffset !== 0 || !$from.parent.isTextblock || $from.depth < 1) {
    return false;
  }
  if (titleTypes.has($from.parent.type.name)) return false;
  const parent = $from.node($from.depth - 1);
  const index = $from.index($from.depth - 1);
  if (index === 0) return false;
  const before = parent.child(index - 1);
  if (!containerTypes.has(before.type.name)) return false;
  if (!dispatch) return true;

  const line = $from.parent;
  const blockStart = $from.before();
  const containerEnd = blockStart - 1;
  const target = Selection.near(state.doc.resolve(containerEnd), -1);
  const tr = state.tr;
  if (line.content.size === 0) {
    tr.delete(blockStart, blockStart + line.nodeSize);
    tr.setSelection(Selection.near(tr.doc.resolve(containerEnd), -1));
  } else if (
    target instanceof TextSelection &&
    target.$from.parent.isTextblock &&
    target.$from.parentOffset === target.$from.parent.content.size &&
    target.$from.parent.type.validContent(target.$from.parent.content.append(line.content))
  ) {
    tr.delete(blockStart, blockStart + line.nodeSize);
    tr.insert(target.from, line.content);
    tr.setSelection(TextSelection.create(tr.doc, target.from));
  } else {
    tr.setSelection(target);
  }
  dispatch(tr.scrollIntoView());
  return true;
};

/**
 * Delete at the end of a block straight before a point or a section: the
 * mirror of `backspaceAfterContainer`. ProseMirror would select the whole
 * point, and a second Delete would remove it with everything it owns; instead
 * the cursor goes to the start of its title. An empty line is removed on the way.
 */
export const deleteBeforeContainer: Command = (state, dispatch) => {
  const { $from, empty } = state.selection;
  if (!empty || !$from.parent.isTextblock || $from.depth < 1) return false;
  if ($from.parentOffset !== $from.parent.content.size) return false;
  if (titleTypes.has($from.parent.type.name)) return false;
  const parent = $from.node($from.depth - 1);
  const index = $from.index($from.depth - 1);
  if (index + 1 >= parent.childCount) return false;
  if (!containerTypes.has(parent.child(index + 1).type.name)) return false;
  if (!dispatch) return true;

  const blockStart = $from.before();
  const blockEnd = $from.after();
  const tr = state.tr;
  // The container starts where the block ends; its title's text one level further in.
  let titleStart = blockEnd + 2;
  if ($from.parent.content.size === 0) {
    tr.delete(blockStart, blockEnd);
    titleStart = blockStart + 2;
  }
  tr.setSelection(TextSelection.create(tr.doc, titleStart));
  dispatch(tr.scrollIntoView());
  return true;
};

/**
 * A title is one line (§B.4): Shift+Enter, which elsewhere is a line break,
 * does nothing in a title rather than splitting it into a body paragraph.
 */
export const titleLineBreak: Command = (state) =>
  titleTypes.has(state.selection.$from.parent.type.name);

/** A copy of the point holding the cursor, with everything it owns, straight after it (§B.6). */
export const duplicatePoint: Command = (state, dispatch) => {
  const point = pointAround(state.selection.$from);
  if (!point) return false;
  if (entryCount(state.doc) + entriesIn(point.node) > outlineLimits.entries) return false;
  if (!dispatch) return true;
  const at = point.pos + point.node.nodeSize;
  // The same node again: the identity step gives the copy and its contents new IDs.
  const tr = state.tr.insert(at, point.node);
  const offset = state.selection.from - point.pos;
  tr.setSelection(TextSelection.create(tr.doc, at + offset));
  dispatch(tr.scrollIntoView());
  return true;
};

/** Whether the document already has a section in this role. */
function hasRole(doc: ProseMirrorNode, role: SectionRole) {
  let found = false;
  doc.forEach((child) => {
    if (child.type.name === "sermonSection" && child.attrs.role === role) found = true;
  });
  return found;
}

/**
 * A main point becomes the introduction or the conclusion (§B.3), keeping its
 * ID and provenance; a section has no source point. Refused, rather than
 * flattened or stripped, for a point with subpoints (a section holds none),
 * a point with its own numbering, a subpoint, or a role the document has.
 */
export function turnIntoSection(role: SectionRole): Command {
  return (state, dispatch) => {
    const point = pointAround(state.selection.$from);
    if (!point || point.depth !== 1) return false;
    if (point.node.attrs.presentation !== null) return false;
    let hasSubpoints = false;
    point.node.forEach((child) => {
      if (child.type.name === "outlinePoint") hasSubpoints = true;
    });
    if (hasSubpoints || hasRole(state.doc, role)) return false;
    if (!dispatch) return true;

    const { sermonSection, sectionTitle } = state.schema.nodes;
    const { id, legacyEntryId, legacyRevision, derivedFrom } = point.node.attrs;
    const rest: ProseMirrorNode[] = [];
    point.node.forEach((child, _offset, index) => {
      if (index > 0) rest.push(child);
    });
    const section = sermonSection.create({ id, legacyEntryId, legacyRevision, derivedFrom, role }, [
      sectionTitle.create(null, point.node.firstChild!.content),
      ...rest,
    ]);
    const { from, to } = state.selection;
    const tr = state.tr.replaceWith(point.pos, point.pos + point.node.nodeSize, section);
    // The same size, so the cursor stays where it was.
    tr.setSelection(TextSelection.between(tr.doc.resolve(from), tr.doc.resolve(to)));
    dispatch(tr.scrollIntoView());
    return true;
  };
}

/** The section holding the cursor becomes a main point, keeping its ID and provenance. */
export const turnIntoPoint: Command = (state, dispatch) => {
  const section = sectionAround(state.selection.$from);
  if (!section) return false;
  if (!dispatch) return true;
  const { outlinePoint, pointTitle } = state.schema.nodes;
  const { id, legacyEntryId, legacyRevision, derivedFrom } = section.node.attrs;
  const rest: ProseMirrorNode[] = [];
  section.node.forEach((child, _offset, index) => {
    if (index > 0) rest.push(child);
  });
  const point = outlinePoint.create(
    {
      id,
      legacyEntryId,
      legacyRevision,
      derivedFrom,
      sourcePointId: null,
      legacyParentId: null,
      presentation: null,
    },
    [pointTitle.create(null, section.node.firstChild!.content), ...rest],
  );
  const { from, to } = state.selection;
  const tr = state.tr.replaceWith(section.pos, section.pos + section.node.nodeSize, point);
  tr.setSelection(TextSelection.between(tr.doc.resolve(from), tr.doc.resolve(to)));
  dispatch(tr.scrollIntoView());
  return true;
};

/**
 * A passage block (§B.8), after the block holding the cursor, at the nearest
 * level that can hold one: in a title, after the passages that follow it; in
 * a list or a quotation, after the list or the quotation.
 */
export function insertPassage(reference: ScriptureReference): Command {
  return (state, dispatch) => {
    const { $from } = state.selection;
    const node = passageNode(state, reference);
    let at: number | null = null;
    const holder = titleHolder($from);
    if (holder) {
      at = bodyStart(holder);
    } else {
      for (let depth = $from.depth; depth >= 1; depth -= 1) {
        const parent = $from.node(depth - 1);
        const index = $from.indexAfter(depth - 1);
        if (parent.canReplaceWith(index, index, node.type)) {
          at = $from.after(depth);
          break;
        }
      }
    }
    if (at === null) return false;
    if (!dispatch) return true;
    const tr = state.tr.insert(at, node);
    tr.setSelection(NodeSelection.create(tr.doc, at));
    dispatch(tr.scrollIntoView());
    return true;
  };
}

/** An inline reference at the cursor, in prose or in a title. */
export function insertReference(reference: ScriptureReference): Command {
  return (state, dispatch) => {
    const { scriptureReference } = state.schema.nodes;
    const node = scriptureReference.create({
      ...reference,
      translation: null,
      display: "reference",
    });
    const { $from } = state.selection;
    if (!$from.parent.inlineContent) return false;
    if (!$from.parent.canReplaceWith($from.index(), $from.index(), scriptureReference))
      return false;
    if (!dispatch) return true;
    dispatch(state.tr.replaceSelectionWith(node, false).scrollIntoView());
    return true;
  };
}

/** The first command that applies. */
const firstOf =
  (...commands: Command[]): Command =>
  (state, dispatch) =>
    commands.some((command) => command(state, dispatch));

/** Runs a command against an editor. */
export const run = (editor: Editor, command: Command) =>
  command(editor.state, (tr) => editor.view.dispatch(tr));

/** How many of each section a document holds at its top level. */
function sectionCounts(doc: ProseMirrorNode) {
  const counts = { introduction: 0, conclusion: 0 } as Record<string, number>;
  doc.forEach((child) => {
    if (child.type.name === "sermonSection")
      counts[child.attrs.role] = (counts[child.attrs.role] ?? 0) + 1;
  });
  return counts;
}

/**
 * → at the very end of a section's last line, or ← at the very start of its
 * title, stops at the section's edge (a gap cursor) where there is one: the
 * place just after or before the section where a new line can be opened with
 * Enter or by typing (the owner's request, PS-1B.2B.1). Without this only ↓
 * stopped there, and → went straight past. Where writing already follows
 * the section, the cursor goes on into it as before, as a word processor
 * moves from line to line: an extra stop there would be a key press that
 * seems to do nothing. A line can be opened beside the section from that
 * writing, or by Enter at the start of the section's title (`titleEnter`).
 */
export const toSectionEdge =
  (dir: 1 | -1): Command =>
  (state, dispatch) => {
    const { selection } = state;
    if (!(selection instanceof TextSelection) || !selection.empty) return false;
    const $head = selection.$head;
    const section = sectionAround($head);
    if (!section) return false;
    const end = section.pos + section.node.nodeSize;
    const edge =
      dir > 0
        ? Selection.near(state.doc.resolve(end - 1), -1)
        : Selection.near(state.doc.resolve(section.pos + 1), 1);
    if (edge.head !== $head.pos) return false;
    const $gap = state.doc.resolve(dir > 0 ? end : section.pos);
    // An edge to stop at: no line of text directly beside it (there the cursor simply goes into that line).
    const beside = [$gap.nodeBefore, $gap.nodeAfter];
    if (beside.some((node) => node?.isTextblock)) return false;
    if (dispatch) dispatch(state.tr.setSelection(new GapCursor($gap)).scrollIntoView());
    return true;
  };

export const sectionGuardKey = new PluginKey("labSectionGuard");

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
      ArrowRight: on(toSectionEdge(1)),
      ArrowLeft: on(toSectionEdge(-1)),
      Enter: on(firstOf(titleEnter, leaveContainer)),
      "Shift-Enter": on(titleLineBreak),
      Backspace: on(firstOf(removeEmptyPoint, unwrapPoint, backspaceAfterContainer)),
      Delete: on(deleteBeforeContainer),
    };
  },
  addProseMirrorPlugins() {
    return [
      // At most one introduction and one conclusion (§B.2 invariant 1): a
      // change that would make a second is refused. A paste of one is turned
      // into a heading before it gets here (`clipboard.ts`).
      new Plugin({
        key: sectionGuardKey,
        filterTransaction(tr, state) {
          if (!tr.docChanged || isTextOnly([tr])) return true;
          const after = sectionCounts(tr.doc);
          const before = sectionCounts(state.doc);
          return Object.keys(after).every((role) => after[role] <= Math.max(1, before[role] ?? 0));
        },
      }),
    ];
  },
});
