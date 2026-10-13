import { describe, expect, it } from "vitest";

import {
  isWithin,
  orderEntries,
  planInsert,
  planMove,
  planRemove,
  subtreeIds,
  type Placement,
  type TreeRow,
} from "./tree";

const point = (id: string, parentId: string | null, position: number): TreeRow => ({
  id,
  parentId,
  type: "point",
  position,
});
const introduction: TreeRow = { id: "intro", parentId: null, type: "introduction", position: 0 };
const conclusion: TreeRow = { id: "end", parentId: null, type: "conclusion", position: 0 };

/*
 *   a
 *     a1
 *       a1x
 *     a2
 *   b
 *   c
 *     c1
 */
const rows: TreeRow[] = [
  conclusion,
  point("c1", "c", 0),
  point("b", null, 1),
  point("a2", "a", 1),
  point("a", null, 0),
  point("a1x", "a1", 0),
  introduction,
  point("c", null, 2),
  point("a1", "a", 0),
];

const shown = (list: readonly TreeRow[]) =>
  orderEntries(list).map((entry) => `${"  ".repeat(entry.depth)}${entry.id}`);

/** The rows as they would be once a plan was written. */
const applied = (list: readonly TreeRow[], placements: Placement[]) => {
  const placed = new Map(placements.map((placement) => [placement.id, placement]));
  return list.map((row) => ({ ...row, ...placed.get(row.id) }));
};

/** Every list of siblings is 0, 1, 2, … with none missing and none twice. */
function expectTidy(list: readonly TreeRow[]) {
  const positions = new Map<string | null, number[]>();
  for (const row of list.filter((entry) => entry.type === "point")) {
    positions.set(row.parentId, [...(positions.get(row.parentId) ?? []), row.position]);
  }
  for (const values of positions.values()) {
    expect(values.sort((a, b) => a - b)).toEqual(values.map((_, index) => index));
  }
}

describe("the order of an outline", () => {
  it("is the introduction, each point with what is under it, then the conclusion", () => {
    expect(shown(rows)).toEqual(["intro", "a", "  a1", "    a1x", "  a2", "b", "c", "  c1", "end"]);
  });

  it("is the same whatever order the rows arrive in", () => {
    const expected = shown(rows);
    expect(shown([...rows].reverse())).toEqual(expected);
    expect(shown([...rows].sort((a, b) => (a.id < b.id ? -1 : 1)))).toEqual(expected);
  });

  it("says where each point is, from the top down, and nothing for a section", () => {
    const paths = Object.fromEntries(orderEntries(rows).map((entry) => [entry.id, entry.path]));
    expect(paths).toEqual({
      intro: [],
      a: [1],
      a1: [1, 1],
      a1x: [1, 1, 1],
      a2: [1, 2],
      b: [2],
      c: [3],
      c1: [3, 1],
      end: [],
    });
  });

  it("is an empty list for an empty outline, and only the sections for one with no points", () => {
    expect(orderEntries([])).toEqual([]);
    expect(shown([conclusion, introduction])).toEqual(["intro", "end"]);
  });

  it("settles two rows at one place by their IDs, so it is always one order", () => {
    const tied = [point("z", null, 0), point("m", null, 0), point("a", null, 0)];
    expect(shown(tied)).toEqual(["a", "m", "z"]);
    expect(shown([...tied].reverse())).toEqual(["a", "m", "z"]);
  });

  it("goes far deeper than an outline may be without calling itself", () => {
    // Six times the most entries an outline holds, every one under the last.
    const depth = 3_000;
    const chain = Array.from({ length: depth }, (_, index) =>
      point(`p${index}`, index === 0 ? null : `p${index - 1}`, 0),
    );
    const ordered = orderEntries(chain);
    expect(ordered).toHaveLength(depth);
    expect(ordered[depth - 1].depth).toBe(depth - 1);
    expect(subtreeIds(chain, "p0")).toHaveLength(depth);
    expect(isWithin(chain, `p${depth - 1}`, "p0")).toBe(true);
    expect(isWithin(chain, "p0", `p${depth - 1}`)).toBe(false);
  });

  it("shows every row even when the rows are broken: no parent, or a loop", () => {
    const broken = [
      point("a", null, 0),
      point("orphan", "gone", 0),
      point("x", "y", 0),
      point("y", "x", 0),
    ];
    const ordered = orderEntries(broken);
    expect(ordered.map((entry) => entry.id).sort()).toEqual(["a", "orphan", "x", "y"]);
    expect(ordered[0].id).toBe("a");
    // And the walks that follow parents stop.
    expect(isWithin(broken, "x", "a")).toBe(false);
    expect(subtreeIds(broken, "x").sort()).toEqual(["x", "y"]);
  });
});

describe("a subtree", () => {
  it("is an entry and everything under it", () => {
    expect(subtreeIds(rows, "a")).toHaveLength(4);
    expect(subtreeIds(rows, "a").sort()).toEqual(["a", "a1", "a1x", "a2"]);
    expect(subtreeIds(rows, "b")).toEqual(["b"]);
  });

  it("knows what is within what", () => {
    expect(isWithin(rows, "a1x", "a")).toBe(true);
    expect(isWithin(rows, "a", "a")).toBe(true);
    expect(isWithin(rows, "a", "a1x")).toBe(false);
    expect(isWithin(rows, "c1", "a")).toBe(false);
  });
});

describe("making room for a new point", () => {
  it("puts it last when no place is named, and moves nothing", () => {
    expect(planInsert(rows, null)).toEqual({ ok: true, position: 3, placements: [] });
    expect(planInsert(rows, "a")).toEqual({ ok: true, position: 2, placements: [] });
    expect(planInsert(rows, "b")).toEqual({ ok: true, position: 0, placements: [] });
    expect(planInsert([], null)).toEqual({ ok: true, position: 0, placements: [] });
  });

  it("moves down the points after the place it is given", () => {
    expect(planInsert(rows, null, 1)).toEqual({
      ok: true,
      position: 1,
      placements: [
        { id: "b", parentId: null, position: 2 },
        { id: "c", parentId: null, position: 3 },
      ],
    });
  });

  it("takes a place past the end as the end", () => {
    expect(planInsert(rows, "a", 99)).toMatchObject({ position: 2, placements: [] });
  });

  it("refuses a parent that is not a point of the outline", () => {
    for (const parent of ["intro", "end", "nowhere"]) {
      expect(planInsert(rows, parent)).toEqual({ ok: false, problem: "invalid_parent" });
    }
  });
});

describe("moving a point", () => {
  const after = (id: string, parentId: string | null, index?: number) => {
    const plan = planMove(rows, id, parentId, index);
    if (!plan.ok) throw new Error(plan.problem);
    const result = applied(rows, plan.placements);
    expectTidy(result);
    return shown(result);
  };

  it("among the points it is beside", () => {
    expect(after("c", null, 0)).toEqual([
      "intro",
      "c",
      "  c1",
      "a",
      "  a1",
      "    a1x",
      "  a2",
      "b",
      "end",
    ]);
    expect(after("a", null, 1).filter((line) => !line.startsWith(" "))).toEqual([
      "intro",
      "b",
      "a",
      "c",
      "end",
    ]);
    // Last, by naming no place.
    expect(after("a", null).at(-2)).toBe("  a2");
  });

  it("under another point, taking everything under it along", () => {
    expect(after("a", "c", 0)).toEqual([
      "intro",
      "b",
      "c",
      "  a",
      "    a1",
      "      a1x",
      "    a2",
      "  c1",
      "end",
    ]);
  });

  it("out from under its parent to the main points", () => {
    expect(after("a1", null, 1)).toEqual([
      "intro",
      "a",
      "  a2",
      "a1",
      "  a1x",
      "b",
      "c",
      "  c1",
      "end",
    ]);
  });

  it("writes only the rows whose place changes", () => {
    const plan = planMove(rows, "a1", "b");
    expect(plan).toEqual({
      ok: true,
      position: 0,
      placements: [
        { id: "a1", parentId: "b", position: 0 },
        { id: "a2", parentId: "a", position: 0 },
      ],
    });
  });

  it("plans nothing when the point is already there", () => {
    expect(planMove(rows, "b", null, 1)).toEqual({ ok: true, position: 1, placements: [] });
    expect(planMove(rows, "c", null)).toEqual({ ok: true, position: 2, placements: [] });
    expect(planMove(rows, "a1x", "a1", 0)).toEqual({ ok: true, position: 0, placements: [] });
  });

  it("is refused under itself or under anything that is under it", () => {
    for (const parent of ["a", "a1", "a1x", "a2"]) {
      expect(planMove(rows, "a", parent)).toEqual({ ok: false, problem: "cycle" });
    }
  });

  it("is refused under a section or under a point that is not there", () => {
    for (const parent of ["intro", "end", "nowhere"]) {
      expect(planMove(rows, "b", parent)).toEqual({ ok: false, problem: "invalid_parent" });
    }
  });

  it("is refused for the introduction, the conclusion, and an entry that is not there", () => {
    expect(planMove(rows, "intro", null, 2)).toEqual({ ok: false, problem: "section" });
    expect(planMove(rows, "end", "a")).toEqual({ ok: false, problem: "section" });
    expect(planMove(rows, "nowhere", null)).toEqual({ ok: false, problem: "missing" });
  });
});

describe("removing a point", () => {
  it("closes the gap among the points it was beside", () => {
    expect(planRemove(rows, "a")).toEqual([
      { id: "b", parentId: null, position: 0 },
      { id: "c", parentId: null, position: 1 },
    ]);
    expect(planRemove(rows, "a1")).toEqual([{ id: "a2", parentId: "a", position: 0 }]);
  });

  it("moves nothing when it was last, or was a section", () => {
    expect(planRemove(rows, "c")).toEqual([]);
    expect(planRemove(rows, "intro")).toEqual([]);
    expect(planRemove(rows, "nowhere")).toEqual([]);
  });
});
