import type { EntryType } from "./model";

/*
 * The shape of an outline, worked out from its rows: the order entries are
 * shown in, and what has to be written to put an entry somewhere else. Pure
 * functions with no database or server code, so the editor can use the same
 * ones to show a change before the server has answered.
 *
 * Nothing here calls itself. Points may be nested as deep as an outline has
 * entries, and every walk is a loop that stops after at most that many steps,
 * whatever the rows say. An entry's `path` is as long as the entry is deep,
 * so what `orderEntries` returns grows with the square of the depth; the
 * limit on an outline's entries (`outlineLimits.entries`) is what keeps that
 * small.
 */

/** What the tree needs to know of an entry. */
export type TreeRow = {
  id: string;
  parentId: string | null;
  type: EntryType;
  /** Its place among the points with the same parent, from 0. */
  position: number;
};

/** An entry with where it stands in the outline. */
export type Placed<T extends TreeRow> = T & {
  /** 0 for a main point and for a section. */
  depth: number;
  /**
   * Its place among its siblings, counted from 1, at each level from the top
   * down to its own: what numbering reads. Empty for a section.
   */
  path: number[];
};

/** Where one entry is to be: what a move, an insertion, or a removal writes. */
export type Placement = { id: string; parentId: string | null; position: number };

const inOrder = (a: TreeRow, b: TreeRow) =>
  a.position - b.position || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** The points under each parent, in order. The key of the main points is null. */
function childrenByParent<T extends TreeRow>(rows: readonly T[]) {
  const children = new Map<string | null, T[]>();
  for (const row of rows) {
    if (row.type !== "point") continue;
    const list = children.get(row.parentId);
    if (list) list.push(row);
    else children.set(row.parentId, [row]);
  }
  for (const list of children.values()) list.sort(inOrder);
  return children;
}

/**
 * An outline's entries in the order they are shown: the introduction, then
 * every point with the points under it straight after it, then the
 * conclusion. Points with the same parent are in `position` order, and by ID
 * where two positions are ever the same, so the order is one order.
 *
 * A point whose parent is not among the rows, or that is part of a loop,
 * cannot happen in a table that keeps its constraints. Were it to, it is
 * shown as a main point after the others, not lost.
 */
export function orderEntries<T extends TreeRow>(rows: readonly T[]): Placed<T>[] {
  const children = childrenByParent(rows);
  const ordered: Placed<T>[] = [];
  const seen = new Set<string>();

  const introduction = rows.find((row) => row.type === "introduction");
  if (introduction) ordered.push({ ...introduction, depth: 0, path: [] });

  let mainPoints = 0;
  const walk = (start: T) => {
    // What is still to be shown, the next one last.
    const pending: Placed<T>[] = [{ ...start, depth: 0, path: [(mainPoints += 1)] }];
    while (pending.length > 0) {
      const entry = pending.pop()!;
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);
      ordered.push(entry);
      const under = children.get(entry.id) ?? [];
      for (let index = under.length - 1; index >= 0; index -= 1) {
        pending.push({ ...under[index], depth: entry.depth + 1, path: [...entry.path, index + 1] });
      }
    }
  };

  for (const point of children.get(null) ?? []) walk(point);
  // Anything not reached from a main point.
  for (const row of rows) {
    if (row.type === "point" && !seen.has(row.id)) walk(row);
  }

  const conclusion = rows.find((row) => row.type === "conclusion");
  if (conclusion) ordered.push({ ...conclusion, depth: 0, path: [] });
  return ordered;
}

/** An entry and everything under it, the entry first. */
export function subtreeIds(rows: readonly TreeRow[], id: string): string[] {
  const children = childrenByParent(rows);
  const ids: string[] = [];
  const seen = new Set<string>();
  const pending = [id];
  while (pending.length > 0) {
    const next = pending.pop()!;
    if (seen.has(next)) continue;
    seen.add(next);
    ids.push(next);
    for (const child of children.get(next) ?? []) pending.push(child.id);
  }
  return ids;
}

/** True when `id` is `ancestorId` or lies anywhere under it. */
export function isWithin(rows: readonly TreeRow[], id: string, ancestorId: string): boolean {
  const parents = new Map(rows.map((row) => [row.id, row.parentId]));
  let current: string | null | undefined = id;
  // No chain of parents is longer than the rows there are.
  for (let steps = 0; current && steps <= rows.length; steps += 1) {
    if (current === ancestorId) return true;
    current = parents.get(current);
  }
  return false;
}

/** Why an entry cannot be put where it was asked to go. */
export type PlacementProblem =
  /** No such entry in this outline. */
  | "missing"
  /** The introduction and the conclusion stay where they are. */
  | "section"
  /** The parent is not a point of this outline. */
  | "invalid_parent"
  /** The parent is the entry itself, or is under it. */
  | "cycle";

export type Plan =
  | { ok: true; position: number; placements: Placement[] }
  | { ok: false; problem: PlacementProblem };

/** A whole number from 0 to `length`; anything else, or nothing, is the end. */
function clamp(index: number | undefined, length: number) {
  if (index === undefined || !Number.isFinite(index)) return length;
  return Math.min(Math.max(Math.trunc(index), 0), length);
}

/** The rows of `list` that are not already at their place in it, as placements under `parentId`. */
function renumbered(list: readonly TreeRow[], parentId: string | null): Placement[] {
  return list.flatMap((row, position) =>
    row.parentId === parentId && row.position === position
      ? []
      : [{ id: row.id, parentId, position }],
  );
}

function parentProblem(rows: readonly TreeRow[], parentId: string | null): PlacementProblem | null {
  if (parentId === null) return null;
  const parent = rows.find((row) => row.id === parentId);
  return parent && parent.type === "point" ? null : "invalid_parent";
}

/**
 * Where a new point goes, and which of the points beside it have to move to
 * make room. `index` is its place among them, from 0; left out, or past the
 * end, it goes last.
 */
export function planInsert(
  rows: readonly TreeRow[],
  parentId: string | null,
  index?: number,
): Plan {
  const problem = parentProblem(rows, parentId);
  if (problem) return { ok: false, problem };
  const siblings = childrenByParent(rows).get(parentId) ?? [];
  const position = clamp(index, siblings.length);
  const placeholder: TreeRow = { id: "", parentId, type: "point", position };
  const list = [...siblings.slice(0, position), placeholder, ...siblings.slice(position)];
  return {
    ok: true,
    position,
    placements: renumbered(list, parentId).filter((placement) => placement.id !== ""),
  };
}

/**
 * What has to be written to move a point, and everything under it, to
 * `parentId` at `index`. `index` is its place among the points it will be
 * beside, not counting itself, from 0; left out, or past the end, it goes
 * last. Only the point's own row and the rows beside it, where it was and
 * where it is going, are written: what is under it follows by itself.
 *
 * A move to where the point already is plans nothing.
 */
export function planMove(
  rows: readonly TreeRow[],
  id: string,
  parentId: string | null,
  index?: number,
): Plan {
  const entry = rows.find((row) => row.id === id);
  if (!entry) return { ok: false, problem: "missing" };
  if (entry.type !== "point") return { ok: false, problem: "section" };
  const problem = parentProblem(rows, parentId);
  if (problem) return { ok: false, problem };
  if (parentId !== null && isWithin(rows, parentId, id)) return { ok: false, problem: "cycle" };

  const children = childrenByParent(rows);
  const beside = (children.get(parentId) ?? []).filter((row) => row.id !== id);
  const position = clamp(index, beside.length);
  const destination = [...beside.slice(0, position), entry, ...beside.slice(position)];
  const placements = renumbered(destination, parentId);
  if (entry.parentId !== parentId) {
    const left = (children.get(entry.parentId) ?? []).filter((row) => row.id !== id);
    placements.push(...renumbered(left, entry.parentId));
  }
  return { ok: true, position, placements };
}

/** What has to be written to close the gap an entry leaves among the points it was beside. */
export function planRemove(rows: readonly TreeRow[], id: string): Placement[] {
  const entry = rows.find((row) => row.id === id);
  if (!entry || entry.type !== "point") return [];
  const left = (childrenByParent(rows).get(entry.parentId) ?? []).filter((row) => row.id !== id);
  return renumbered(left, entry.parentId);
}
