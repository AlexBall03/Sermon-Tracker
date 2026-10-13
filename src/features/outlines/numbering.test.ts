import { describe, expect, it } from "vitest";

import { numberingLimits, numberingPresetIds } from "./model";
import {
  defaultNumbering,
  entryLabel,
  formatCounter,
  largestRoman,
  levelFormat,
  numberOutline,
  numberingConfigSchema,
  numberingPresets,
  readNumbering,
  resolveNumbering,
  type NumberingConfig,
} from "./numbering";
import { orderEntries, planMove, type TreeRow } from "./tree";

const preset = (name: (typeof numberingPresetIds)[number]): NumberingConfig => ({
  version: 1,
  preset: name,
});

/** The labels down one branch: the first point at each level, to `depth` levels. */
const down = (config: NumberingConfig, depth: number) =>
  Array.from({ length: depth }, (_, index) => entryLabel(config, Array(index + 1).fill(1)));

describe("counters", () => {
  it("count in digits", () => {
    expect([1, 9, 10, 250].map((n) => formatCounter("decimal", n))).toEqual([
      "1",
      "9",
      "10",
      "250",
    ]);
  });

  it("go on past Z as AA, AB, and on to three letters", () => {
    const at = (n: number) => formatCounter("alpha", n);
    expect([1, 2, 26, 27, 28, 52, 53, 702, 703].map(at)).toEqual([
      "A",
      "B",
      "Z",
      "AA",
      "AB",
      "AZ",
      "BA",
      "ZZ",
      "AAA",
    ]);
    expect(formatCounter("alpha", 28, "lower")).toBe("ab");
  });

  it("write Roman numerals, in either case", () => {
    const at = (n: number) => formatCounter("roman", n);
    expect([1, 4, 9, 14, 40, 90, 400, 1994, 3999].map(at)).toEqual([
      "I",
      "IV",
      "IX",
      "XIV",
      "XL",
      "XC",
      "CD",
      "MCMXCIV",
      "MMMCMXCIX",
    ]);
    expect(formatCounter("roman", 14, "lower")).toBe("xiv");
  });

  it("give a number too large for Roman numerals in digits", () => {
    expect(formatCounter("roman", largestRoman + 1)).toBe("4000");
    expect(formatCounter("roman", 1_000_000, "lower")).toBe("1000000");
  });

  it("give nothing for what is not a place: zero, a negative, a fraction, not a number", () => {
    for (const value of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      for (const style of ["decimal", "alpha", "roman"] as const) {
        expect(formatCounter(style, value)).toBe("");
      }
    }
    expect(formatCounter("bullet", 3)).toBe("");
    expect(formatCounter("none", 3)).toBe("");
  });
});

describe("the built-in styles", () => {
  it("are all there, and each is an ordinary configuration", () => {
    expect(Object.keys(numberingPresets).sort()).toEqual([...numberingPresetIds].sort());
    for (const name of numberingPresetIds) {
      expect(numberingConfigSchema.safeParse({ version: 1, preset: name }).success).toBe(true);
      // Written out in full as a custom one, it is accepted too.
      const custom = { version: 1, preset: "custom", ...numberingPresets[name] };
      expect(numberingConfigSchema.safeParse(custom).success, name).toBe(true);
    }
    expect(defaultNumbering).toEqual({ version: 1, preset: "traditional" });
  });

  it("traditional: I. A. 1. a. i. and then (1) (a) (i), which repeats", () => {
    expect(down(preset("traditional"), 11)).toEqual([
      "I.",
      "A.",
      "1.",
      "a.",
      "i.",
      "(1)",
      "(a)",
      "(i)",
      "(1)",
      "(a)",
      "(i)",
    ]);
    expect(entryLabel(preset("traditional"), [3])).toBe("III.");
    expect(entryLabel(preset("traditional"), [3, 2])).toBe("B.");
    expect(entryLabel(preset("traditional"), [3, 2, 4])).toBe("4.");
  });

  it("decimal: each level carries the ones above it", () => {
    const config = preset("decimal");
    expect(entryLabel(config, [1])).toBe("1.");
    expect(entryLabel(config, [1, 1])).toBe("1.1.");
    expect(entryLabel(config, [2, 3, 1])).toBe("2.3.1.");
    expect(entryLabel(config, [2, 3, 1, 12])).toBe("2.3.1.12.");
  });

  it("numeric: 1. 2. 3. at every level", () => {
    const config = preset("numeric");
    expect(entryLabel(config, [2])).toBe("2.");
    expect(entryLabel(config, [2, 3])).toBe("3.");
    expect(entryLabel(config, [2, 3, 1, 7])).toBe("7.");
  });

  it("alphabetic and roman: capitals, then small letters, and again", () => {
    expect(down(preset("alphabetic"), 4)).toEqual(["A.", "a.", "A.", "a."]);
    expect(entryLabel(preset("alphabetic"), [27, 28])).toBe("ab.");
    expect(down(preset("roman"), 4)).toEqual(["I.", "i.", "I.", "i."]);
    expect(entryLabel(preset("roman"), [4, 9])).toBe("ix.");
  });

  it("bullets: a mark for each level, the same for every point of it", () => {
    expect(down(preset("bullets"), 5)).toEqual(["•", "◦", "▪", "•", "◦"]);
    expect(entryLabel(preset("bullets"), [7, 3])).toBe("◦");
  });

  it("none: headings with no number at any depth", () => {
    expect(down(preset("none"), 6)).toEqual(["", "", "", "", "", ""]);
  });
});

describe("a custom numbering", () => {
  const custom = numberingConfigSchema.parse({
    version: 1,
    preset: "custom",
    levels: [
      { counter: "roman", prefix: "POINT ", suffix: "" },
      { counter: "alpha", prefix: "SECTION ", suffix: "" },
      { counter: "decimal", prefix: "(", suffix: ")" },
      { counter: "alpha", case: "lower", prefix: "(", suffix: ")" },
      { counter: "roman", case: "lower", prefix: "(", suffix: ")" },
    ],
    overflow: "none",
  });

  it("writes what is put before and after each level's number", () => {
    expect(entryLabel(custom, [1])).toBe("POINT I");
    expect(entryLabel(custom, [2, 1])).toBe("SECTION A");
    expect(entryLabel(custom, [2, 1, 1])).toBe("(1)");
    expect(entryLabel(custom, [2, 1, 1, 1])).toBe("(a)");
    expect(entryLabel(custom, [2, 1, 1, 1, 1])).toBe("(i)");
  });

  it("leaves a level below the last one unnumbered when told to", () => {
    expect(entryLabel(custom, [2, 1, 1, 1, 1, 1])).toBe("");
    expect(levelFormat(resolveNumbering(custom), 5)).toBeNull();
  });

  it("uses the last level for ever when told to", () => {
    const last = { ...custom, overflow: "last" as const };
    expect(entryLabel(last, [1, 1, 1, 1, 1, 3])).toBe("(iii)");
    expect(entryLabel(last, Array(40).fill(2))).toBe("(ii)");
  });

  it("repeats from the level it is told to", () => {
    const repeating = { ...custom, overflow: "repeat" as const, repeatFrom: 2 };
    expect(down(repeating, 9)).toEqual([
      "POINT I",
      "SECTION A",
      "(1)",
      "(a)",
      "(i)",
      "(1)",
      "(a)",
      "(i)",
      "(1)",
    ]);
  });

  it("joins the levels above with its own separator, each in its own style", () => {
    const legal = numberingConfigSchema.parse({
      version: 1,
      preset: "custom",
      levels: [
        { counter: "roman", suffix: "." },
        { counter: "alpha", composite: true, separator: "-", suffix: ")" },
        { counter: "decimal", composite: true, separator: "-", suffix: ")" },
      ],
    });
    expect(entryLabel(legal, [2])).toBe("II.");
    expect(entryLabel(legal, [2, 3])).toBe("II-C)");
    expect(entryLabel(legal, [2, 3, 4])).toBe("II-C-4)");
  });

  it("leaves a level that does not count out of a joined number", () => {
    const mixed = numberingConfigSchema.parse({
      version: 1,
      preset: "custom",
      levels: [
        { counter: "bullet" },
        { counter: "decimal", composite: true, suffix: "." },
        { counter: "decimal", composite: true, suffix: "." },
      ],
    });
    expect(entryLabel(mixed, [5])).toBe("•");
    expect(entryLabel(mixed, [5, 2])).toBe("2.");
    expect(entryLabel(mixed, [5, 2, 3])).toBe("2.3.");
  });
});

describe("a label", () => {
  it("is never longer than the limit, however deep the point is, and keeps its end", () => {
    const deep = Array.from({ length: 500 }, (_, index) => index + 1);
    const label = entryLabel(preset("decimal"), deep);
    expect([...label].length).toBe(numberingLimits.label);
    expect(label.startsWith("…")).toBe(true);
    expect(label.endsWith("499.500.")).toBe(true);
    // Two points side by side still differ.
    expect(entryLabel(preset("decimal"), [...deep.slice(0, -1), 501])).not.toBe(label);
  });

  it("is nothing for no place at all", () => {
    expect(entryLabel(preset("traditional"), [])).toBe("");
  });
});

describe("a stored configuration", () => {
  it("is refused when it is malformed", () => {
    const level = { counter: "decimal" };
    const custom = (fields: object) => ({
      version: 1,
      preset: "custom",
      levels: [level],
      ...fields,
    });
    const refusedOnes: unknown[] = [
      null,
      "traditional",
      [],
      {},
      { preset: "traditional" },
      { version: 2, preset: "traditional" },
      { version: 1, preset: "fancy" },
      { version: 1, preset: "custom" },
      custom({ levels: [] }),
      custom({ levels: Array(numberingLimits.levels + 1).fill(level) }),
      custom({ levels: [{ counter: "hieroglyph" }] }),
      custom({ levels: [{ counter: "alpha", case: "title" }] }),
      custom({ levels: [{ counter: "bullet", bullet: "<img>" }] }),
      custom({ levels: [{ counter: "bullet", bullet: "★" }] }),
      custom({ levels: [{ ...level, prefix: "x".repeat(numberingLimits.prefix + 1) }] }),
      custom({ levels: [{ ...level, suffix: "x".repeat(numberingLimits.suffix + 1) }] }),
      custom({ levels: [{ ...level, separator: "12345" }] }),
      custom({ levels: [{ ...level, prefix: "<b>" }] }),
      custom({ levels: [{ ...level, suffix: "a\nb" }] }),
      custom({ levels: [{ ...level, prefix: "a\u0000" }] }),
      custom({ levels: [{ ...level, prefix: "a‮b" }] }),
      custom({ levels: [{ ...level, prefix: 5 }] }),
      custom({ overflow: "wrap" }),
      custom({ repeatFrom: 1 }),
      custom({ repeatFrom: -1 }),
      custom({ repeatFrom: 0.5 }),
    ];
    for (const value of refusedOnes) {
      expect(numberingConfigSchema.safeParse(value).success, JSON.stringify(value)).toBe(false);
    }
  });

  it("keeps only what a configuration is made of", () => {
    expect(
      numberingConfigSchema.parse({ version: 1, preset: "decimal", levels: [], ownerId: "x" }),
    ).toEqual({ version: 1, preset: "decimal" });
    const parsed = numberingConfigSchema.parse({
      version: 1,
      preset: "custom",
      levels: [{ counter: "alpha", onclick: "x" }],
    });
    expect(parsed).toEqual({
      version: 1,
      preset: "custom",
      levels: [
        {
          counter: "alpha",
          case: "upper",
          bullet: "•",
          prefix: "",
          suffix: "",
          composite: false,
          separator: ".",
        },
      ],
      overflow: "last",
      repeatFrom: 0,
    });
    expect(JSON.stringify(parsed).length).toBeLessThan(numberingLimits.stored);
  });

  it("reads as the default when it cannot be read", () => {
    expect(readNumbering({ version: 9, preset: "from-the-future" })).toEqual(defaultNumbering);
    expect(readNumbering(null)).toEqual(defaultNumbering);
    expect(readNumbering({ version: 1, preset: "bullets" })).toEqual({
      version: 1,
      preset: "bullets",
    });
  });

  it("is small enough to store at its largest", () => {
    const largest = {
      version: 1,
      preset: "custom",
      levels: Array(numberingLimits.levels).fill({
        counter: "roman",
        case: "lower",
        bullet: "•",
        prefix: "é".repeat(numberingLimits.prefix),
        suffix: "é".repeat(numberingLimits.suffix),
        composite: true,
        separator: "é".repeat(numberingLimits.separator),
      }),
      overflow: "repeat",
      repeatFrom: 11,
    };
    const parsed = numberingConfigSchema.parse(largest);
    expect(JSON.stringify(parsed).length).toBeLessThanOrEqual(numberingLimits.stored);
  });
});

describe("numbering an outline", () => {
  const point = (id: string, parentId: string | null, position: number): TreeRow => ({
    id,
    parentId,
    type: "point",
    position,
  });
  const rows: TreeRow[] = [
    { id: "intro", parentId: null, type: "introduction", position: 0 },
    point("a", null, 0),
    point("a1", "a", 0),
    point("a2", "a", 1),
    point("b", null, 1),
    point("b1", "b", 0),
    point("b1x", "b1", 0),
    { id: "end", parentId: null, type: "conclusion", position: 0 },
  ];
  const labels = (list: TreeRow[], config = preset("traditional")) =>
    Object.fromEntries(numberOutline(orderEntries(list), config));

  it("numbers the points and leaves the introduction and the conclusion without one", () => {
    expect(labels(rows)).toEqual({
      intro: "",
      a: "I.",
      a1: "A.",
      a2: "B.",
      b: "II.",
      b1: "A.",
      b1x: "1.",
      end: "",
    });
    expect(labels(rows, preset("decimal"))).toMatchObject({ a2: "1.2.", b1x: "2.1.1.", end: "" });
  });

  it("renumbers when a point is moved, and changes no row but where it is", () => {
    // "b" goes first: what is under it follows, and "a" becomes the second.
    const plan = planMove(rows, "b", null, 0);
    expect(plan.ok).toBe(true);
    const placed = new Map((plan.ok ? plan.placements : []).map((p) => [p.id, p]));
    const after = rows.map((row) => ({ ...row, ...placed.get(row.id) }));
    expect(labels(after)).toEqual({
      intro: "",
      b: "I.",
      b1: "A.",
      b1x: "1.",
      a: "II.",
      a1: "A.",
      a2: "B.",
      end: "",
    });
  });
});
