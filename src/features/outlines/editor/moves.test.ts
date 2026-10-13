// @vitest-environment node
import { describe, expect, it } from "vitest";

import { orderEntries, planMove, type TreeRow } from "../tree";
import { projectDrop } from "./drop";
import { moveDirections, moveTarget } from "./moves";

const point = (id: string, parentId: string | null, position: number): TreeRow => ({
  id,
  parentId,
  type: "point",
  position,
});

/**
 * a
 *   a1
 *     a1x
 *   a2
 * b
 * c
 */
const rows: TreeRow[] = [
  { id: "intro", parentId: null, type: "introduction", position: 0 },
  point("a", null, 0),
  point("a1", "a", 0),
  point("a1x", "a1", 0),
  point("a2", "a", 1),
  point("b", null, 1),
  point("c", null, 2),
];

/** The outline after a move, as the IDs in the order they are shown with their depth. */
function after(id: string, target: { parentId: string | null; index: number }) {
  const plan = planMove(rows, id, target.parentId, target.index);
  if (!plan.ok) return plan.problem;
  const placed = new Map(plan.placements.map((placement) => [placement.id, placement]));
  return orderEntries(rows.map((row) => ({ ...row, ...placed.get(row.id) })))
    .filter((row) => row.type === "point")
    .map((row) => `${"  ".repeat(row.depth)}${row.id}`);
}

describe("the movement controls", () => {
  it("move a point up and down among the points beside it, with what is under it", () => {
    expect(after("b", moveTarget(rows, "b", "up")!)).toEqual([
      "b",
      "a",
      "  a1",
      "    a1x",
      "  a2",
      "c",
    ]);
    expect(after("a", moveTarget(rows, "a", "down")!)).toEqual([
      "b",
      "a",
      "  a1",
      "    a1x",
      "  a2",
      "c",
    ]);
    expect(after("a2", moveTarget(rows, "a2", "up")!)).toEqual([
      "a",
      "  a2",
      "  a1",
      "    a1x",
      "b",
      "c",
    ]);
  });

  it("indent a point under the one before it, as its last", () => {
    expect(moveTarget(rows, "b", "indent")).toEqual({ parentId: "a", index: 2 });
    expect(after("b", moveTarget(rows, "b", "indent")!)).toEqual([
      "a",
      "  a1",
      "    a1x",
      "  a2",
      "  b",
      "c",
    ]);
  });

  it("outdent a point to straight after its parent", () => {
    expect(after("a1", moveTarget(rows, "a1", "outdent")!)).toEqual([
      "a",
      "  a2",
      "a1",
      "  a1x",
      "b",
      "c",
    ]);
    expect(after("a1x", moveTarget(rows, "a1x", "outdent")!)).toEqual([
      "a",
      "  a1",
      "  a1x",
      "  a2",
      "b",
      "c",
    ]);
  });

  it("move a deep point out to the main points, after the one it was under", () => {
    expect(after("a1x", moveTarget(rows, "a1x", "top")!)).toEqual([
      "a",
      "  a1",
      "  a2",
      "a1x",
      "b",
      "c",
    ]);
  });

  it("offer no move that cannot be made", () => {
    const possible = (id: string) =>
      moveDirections.filter((direction) => moveTarget(rows, id, direction) !== null);
    expect(possible("a")).toEqual(["down"]);
    expect(possible("c")).toEqual(["up", "indent"]);
    expect(possible("a1")).toEqual(["down", "outdent"]);
    expect(possible("a1x")).toEqual(["outdent", "top"]);
    expect(possible("intro")).toEqual([]);
    expect(possible("nowhere")).toEqual([]);
  });

  it("work at any depth", () => {
    // A chain forty deep, and one more point beside the last.
    const chain: TreeRow[] = Array.from({ length: 40 }, (_, index) =>
      point(`p${index}`, index === 0 ? null : `p${index - 1}`, 0),
    );
    chain.push(point("last", "p38", 1));
    expect(moveTarget(chain, "last", "indent")).toEqual({ parentId: "p39", index: 0 });
    expect(moveTarget(chain, "last", "outdent")).toEqual({ parentId: "p37", index: 1 });
    expect(moveTarget(chain, "last", "top")).toEqual({ parentId: null, index: 1 });
  });
});

describe("where a dragged point lands", () => {
  /** The points on screen without the dragged one and what is under it. */
  const listed = (dragged: string, collapsed: string[] = []) => {
    const moving = new Set<string>();
    const hidden = new Set<string>();
    return orderEntries(rows)
      .filter((row) => row.type === "point")
      .filter((row) => {
        if (row.id === dragged || (row.parentId && moving.has(row.parentId))) moving.add(row.id);
        if (row.parentId && (hidden.has(row.parentId) || collapsed.includes(row.parentId))) {
          hidden.add(row.id);
        }
        return !moving.has(row.id) && !hidden.has(row.id);
      })
      .map(({ id, depth }) => ({ id, depth }));
  };

  it("is beside the point above, or under it, by how far across the pointer is", () => {
    // c dragged to just after a1x: listed is a, a1, a1x, a2, b.
    const others = listed("c");
    expect(projectDrop(rows, others, "c", 3, 0)).toEqual({ parentId: "a", index: 1, depth: 1 });
    expect(projectDrop(rows, others, "c", 3, 2)).toEqual({ parentId: "a1", index: 1, depth: 2 });
    expect(projectDrop(rows, others, "c", 3, 9)).toEqual({ parentId: "a1x", index: 0, depth: 3 });
  });

  it("is never shallower than the point below it, nor deeper than one under the point above", () => {
    const others = listed("c");
    // Between a and a1: a1 is at level 1, so the gap is level 1 whatever is asked.
    expect(projectDrop(rows, others, "c", 1, 0)).toEqual({ parentId: "a", index: 0, depth: 1 });
    expect(projectDrop(rows, others, "c", 1, 5)).toEqual({ parentId: "a", index: 0, depth: 1 });
    // At the very top there is nothing to go under.
    expect(projectDrop(rows, others, "c", 0, 4)).toEqual({ parentId: null, index: 0, depth: 0 });
    // At the very end it may be a main point, or under anything it follows.
    expect(projectDrop(rows, others, "c", 5, 0)).toEqual({ parentId: null, index: 2, depth: 0 });
    expect(projectDrop(rows, others, "c", 5, 1)).toEqual({ parentId: "b", index: 0, depth: 1 });
  });

  it("does not count the dragged point among the points it lands beside", () => {
    // a1 dragged to the end of a's points: a2 is the only one left before it.
    const others = listed("a1");
    expect(others.map((item) => item.id)).toEqual(["a", "a2", "b", "c"]);
    const drop = projectDrop(rows, others, "a1", 2, 1);
    expect(drop).toEqual({ parentId: "a", index: 1, depth: 1 });
    expect(after("a1", drop)).toEqual(["a", "  a2", "  a1", "    a1x", "b", "c"]);
  });

  it("puts a point dropped under a folded point after the ones folded away", () => {
    const others = listed("c", ["a"]);
    expect(others.map((item) => item.id)).toEqual(["a", "b"]);
    expect(projectDrop(rows, others, "c", 1, 1)).toEqual({ parentId: "a", index: 2, depth: 1 });
  });

  it("can never name a place under the dragged point itself", () => {
    const others = listed("a");
    for (let gap = 0; gap <= others.length; gap += 1) {
      for (let wanted = 0; wanted < 5; wanted += 1) {
        const drop = projectDrop(rows, others, "a", gap, wanted);
        expect(planMove(rows, "a", drop.parentId, drop.index).ok).toBe(true);
      }
    }
  });
});
