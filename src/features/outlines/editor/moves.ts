import type { TreeRow } from "../tree";

/*
 * Where the editor's movement controls put a point: up and down among the
 * points beside it, in under the one before it, out to beside its parent, and
 * out to the main points. Each answer is a parent and an index for `planMove`
 * (`tree.ts`), which does the moving; nothing here changes a row.
 */

export const moveDirections = ["up", "down", "indent", "outdent", "top"] as const;
export type MoveDirection = (typeof moveDirections)[number];

/** Where a point is to go: under `parentId`, at `index` among the points there, not counting itself. */
export type MoveTarget = { parentId: string | null; index: number };

/** The points under one parent, in order. */
export function siblingsOf<T extends TreeRow>(rows: readonly T[], parentId: string | null): T[] {
  return rows
    .filter((row) => row.type === "point" && row.parentId === parentId)
    .sort((a, b) => a.position - b.position || (a.id < b.id ? -1 : 1));
}

/** Where a move in `direction` puts the point, or null when it cannot move that way. */
export function moveTarget(
  rows: readonly TreeRow[],
  id: string,
  direction: MoveDirection,
): MoveTarget | null {
  const row = rows.find((candidate) => candidate.id === id);
  if (!row || row.type !== "point") return null;
  const beside = siblingsOf(rows, row.parentId);
  const place = beside.findIndex((candidate) => candidate.id === id);

  switch (direction) {
    case "up":
      return place > 0 ? { parentId: row.parentId, index: place - 1 } : null;
    case "down":
      return place < beside.length - 1 ? { parentId: row.parentId, index: place + 1 } : null;
    case "indent": {
      if (place <= 0) return null;
      const above = beside[place - 1];
      return { parentId: above.id, index: siblingsOf(rows, above.id).length };
    }
    case "outdent": {
      if (row.parentId === null) return null;
      const parent = rows.find((candidate) => candidate.id === row.parentId);
      if (!parent) return null;
      const parents = siblingsOf(rows, parent.parentId);
      return {
        parentId: parent.parentId,
        index: parents.findIndex((candidate) => candidate.id === parent.id) + 1,
      };
    }
    case "top": {
      // Straight after the main point it is somewhere under. Only for a point two or more levels down.
      const byId = new Map(rows.map((candidate) => [candidate.id, candidate]));
      let ancestor = row;
      let depth = 0;
      while (ancestor.parentId !== null && depth <= rows.length) {
        const parent = byId.get(ancestor.parentId);
        if (!parent) return null;
        ancestor = parent;
        depth += 1;
      }
      if (depth < 2) return null;
      const main = siblingsOf(rows, null);
      return {
        parentId: null,
        index: main.findIndex((candidate) => candidate.id === ancestor.id) + 1,
      };
    }
  }
}
