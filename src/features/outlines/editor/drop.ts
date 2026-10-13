import type { TreeRow } from "../tree";
import { siblingsOf, type MoveTarget } from "./moves";

/*
 * Where a dragged point would land. The editor shows its points as one list,
 * top to bottom; a drag names a gap in that list and how far across the
 * pointer has gone, and this turns the two into a parent and an index for
 * `planMove`. It has no DOM in it.
 */

/** A point as the list shows it. */
export type ListedPoint = { id: string; depth: number };

export type Drop = MoveTarget & {
  /** The level the point would be at, from 0: where the drop line is drawn. */
  depth: number;
};

/**
 * `listed` is the points on screen, in order, without the dragged point or
 * anything under it. `gap` is where it would go among them: 0 is before the
 * first, `listed.length` is after the last. `wanted` is the level the pointer
 * asks for. The level is held to what the gap allows: no deeper than one under
 * the point above, and no shallower than the point below.
 *
 * `rows` is every entry of the outline. A point above the gap whose own
 * subpoints are hidden (collapsed) takes the dragged point as its last.
 */
export function projectDrop(
  rows: readonly TreeRow[],
  listed: readonly ListedPoint[],
  draggedId: string,
  gap: number,
  wanted: number,
): Drop {
  const at = Math.min(Math.max(Math.trunc(gap), 0), listed.length);
  const above = listed[at - 1];
  const below = listed[at];
  const deepest = above ? above.depth + 1 : 0;
  const shallowest = below ? Math.min(below.depth, deepest) : 0;
  const depth = Math.min(Math.max(Math.trunc(wanted), shallowest), deepest);

  // The nearest point above that is one level up is the parent.
  let parentId: string | null = null;
  if (depth > 0) {
    for (let index = at - 1; index >= 0; index -= 1) {
      if (listed[index].depth === depth - 1) {
        parentId = listed[index].id;
        break;
      }
    }
  }

  // Its place is after every point of that parent that stands before the gap.
  // One that is not on screen is under a collapsed point, and so before it.
  const before = new Map(listed.slice(0, at).map((point, index) => [point.id, index]));
  const onScreen = new Set(listed.map((point) => point.id));
  const index = siblingsOf(rows, parentId).filter(
    (row) => row.id !== draggedId && (before.has(row.id) || !onScreen.has(row.id)),
  ).length;

  return { parentId, index, depth };
}
