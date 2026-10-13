import { z } from "zod";

import {
  bullets,
  counterStyles,
  letterCases,
  numberingLimits,
  numberingPresetIds,
  overflowRules,
  type Bullet,
  type CounterStyle,
  type LetterCase,
  type NumberingPresetId,
  type OverflowRule,
} from "./model";

/*
 * Outline numbering. A number is never stored: it is worked out from where an
 * entry is and from the outline's configuration, each time it is shown, so
 * moving a point renumbers the outline and changing the style changes nothing
 * but the style. Everything here is a pure function with no database or
 * server code, and runs the same in the browser.
 */

/** How one level of an outline is numbered. */
export type LevelFormat = {
  counter: CounterStyle;
  /** For `alpha` and `roman`. */
  case: LetterCase;
  /** For `bullet`. */
  bullet: Bullet;
  /** Written before the number: "POINT ", "(". */
  prefix: string;
  /** Written after it: ".", ")". */
  suffix: string;
  /**
   * Whether the numbers of the levels above are written first, each in its
   * own level's style, joined by `separator`: "1.2.3".
   */
  composite: boolean;
  separator: string;
};

export type CustomNumbering = {
  version: 1;
  preset: "custom";
  /** Level 1 first. */
  levels: LevelFormat[];
  /** What a level deeper than the last one written uses. */
  overflow: OverflowRule;
  /** Where `repeat` starts again, counted from 0. */
  repeatFrom: number;
};

/** What an outline stores: the name of a built-in style, or a custom one in full. */
export type NumberingConfig = { version: 1; preset: NumberingPresetId } | CustomNumbering;

/** A configuration with its levels written out, whichever kind it was. */
export type ResolvedNumbering = Omit<CustomNumbering, "version" | "preset">;

export const defaultNumbering: NumberingConfig = { version: 1, preset: numberingPresetIds[0] };

const level = (format: Partial<LevelFormat>): LevelFormat => ({
  counter: "decimal",
  case: "upper",
  bullet: bullets[0],
  prefix: "",
  suffix: ".",
  composite: false,
  separator: ".",
  ...format,
});

const inParentheses = { prefix: "(", suffix: ")" };

/** The built-in styles. Each is an ordinary configuration: nothing here is a special case. */
export const numberingPresets: Record<NumberingPresetId, ResolvedNumbering> = {
  // I. A. 1. a. i. and then (1) (a) (i), which is what repeats below that.
  traditional: {
    levels: [
      level({ counter: "roman" }),
      level({ counter: "alpha" }),
      level({ counter: "decimal" }),
      level({ counter: "alpha", case: "lower" }),
      level({ counter: "roman", case: "lower" }),
      level({ counter: "decimal", ...inParentheses }),
      level({ counter: "alpha", case: "lower", ...inParentheses }),
      level({ counter: "roman", case: "lower", ...inParentheses }),
    ],
    overflow: "repeat",
    repeatFrom: 5,
  },
  // 1. 1.1. 1.1.1.
  decimal: { levels: [level({ composite: true })], overflow: "last", repeatFrom: 0 },
  // 1. 2. 3. at every level.
  numeric: { levels: [level({})], overflow: "last", repeatFrom: 0 },
  // A. a. A. a.
  alphabetic: {
    levels: [level({ counter: "alpha" }), level({ counter: "alpha", case: "lower" })],
    overflow: "repeat",
    repeatFrom: 0,
  },
  // I. i. I. i.
  roman: {
    levels: [level({ counter: "roman" }), level({ counter: "roman", case: "lower" })],
    overflow: "repeat",
    repeatFrom: 0,
  },
  bullets: {
    levels: bullets.slice(0, 3).map((bullet) => level({ counter: "bullet", bullet, suffix: "" })),
    overflow: "repeat",
    repeatFrom: 0,
  },
  none: { levels: [level({ counter: "none", suffix: "" })], overflow: "last", repeatFrom: 0 },
};

/**
 * Text a person may put around a number. It is only ever shown as text, never
 * as markup, and is kept short and on one line all the same: no control
 * characters, no line breaks, and no angle brackets.
 */
const safeText = (limit: number) =>
  z
    .string()
    .max(limit)
    .refine((value) => !/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}<>]/u.test(value));

const levelSchema = z.object({
  counter: z.enum(counterStyles),
  case: z.enum(letterCases).default("upper"),
  bullet: z.enum(bullets).default(bullets[0]),
  prefix: safeText(numberingLimits.prefix).default(""),
  suffix: safeText(numberingLimits.suffix).default(""),
  composite: z.boolean().default(false),
  separator: safeText(numberingLimits.separator).default("."),
});

/**
 * A numbering configuration as it is stored and sent. Anything else in the
 * input is dropped, and a built-in style is stored as its name alone. It says
 * nothing in words, so it needs no language.
 */
export const numberingConfigSchema: z.ZodType<NumberingConfig> = z.discriminatedUnion("preset", [
  z.object({ version: z.literal(1), preset: z.enum(numberingPresetIds) }),
  z
    .object({
      version: z.literal(1),
      preset: z.literal("custom"),
      levels: z.array(levelSchema).min(1).max(numberingLimits.levels),
      overflow: z.enum(overflowRules).default("last"),
      repeatFrom: z.number().int().min(0).default(0),
    })
    // A repeat has to start at a level that is there.
    .refine((config) => config.repeatFrom < config.levels.length),
]);

/**
 * A stored configuration as it is read. One that no longer parses (written by
 * a later version, or damaged) reads as the default, and is not rewritten.
 */
export function readNumbering(stored: unknown): NumberingConfig {
  const parsed = numberingConfigSchema.safeParse(stored);
  return parsed.success ? parsed.data : defaultNumbering;
}

/** The levels a configuration stands for. */
export function resolveNumbering(config: NumberingConfig): ResolvedNumbering {
  return config.preset === "custom" ? config : numberingPresets[config.preset];
}

const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** 1 is A, 26 is Z, 27 is AA, 28 is AB, 703 is AAA. */
function alphabetic(value: number): string {
  let text = "";
  for (let rest = value; rest > 0; rest = Math.floor((rest - 1) / 26)) {
    text = letters[(rest - 1) % 26] + text;
  }
  return text;
}

const romanParts: [number, string][] = [
  [1000, "M"],
  [900, "CM"],
  [500, "D"],
  [400, "CD"],
  [100, "C"],
  [90, "XC"],
  [50, "L"],
  [40, "XL"],
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
];

/** The largest number Roman numerals write without a bar over a letter. */
export const largestRoman = 3999;

function roman(value: number): string {
  let text = "";
  let rest = value;
  for (const [amount, numeral] of romanParts) {
    while (rest >= amount) {
      text += numeral;
      rest -= amount;
    }
  }
  return text;
}

/**
 * A counter's text for the `value`th entry of its level, counted from 1.
 *
 * - `alpha` goes on past Z as a spreadsheet's columns do: AA, AB, … AAA.
 * - `roman` is written to 3,999; beyond it the number is given in digits,
 *   which is plain and is never a wrong numeral.
 * - `bullet` and `none` do not count and give nothing; a bullet's mark is the
 *   level's, not the counter's.
 * - Anything that is not a whole number of 1 or more gives nothing.
 */
export function formatCounter(
  style: CounterStyle,
  value: number,
  letterCase: LetterCase = "upper",
): string {
  if (!Number.isSafeInteger(value) || value < 1) return "";
  let text: string;
  switch (style) {
    case "decimal":
      return String(value);
    case "alpha":
      text = alphabetic(value);
      break;
    case "roman":
      if (value > largestRoman) return String(value);
      text = roman(value);
      break;
    default:
      return "";
  }
  return letterCase === "lower" ? text.toLowerCase() : text;
}

/**
 * The format of a level, counted from 0, or null where that level is not
 * numbered. A level deeper than the last one written follows `overflow`.
 */
export function levelFormat(numbering: ResolvedNumbering, depth: number): LevelFormat | null {
  const { levels, overflow } = numbering;
  if (levels.length === 0 || !Number.isInteger(depth) || depth < 0) return null;
  if (depth < levels.length) return levels[depth];
  if (overflow === "none") return null;
  if (overflow === "last") return levels[levels.length - 1];
  const from = Math.min(Math.max(numbering.repeatFrom, 0), levels.length - 1);
  return levels[from + ((depth - from) % (levels.length - from))];
}

/** A label that would run past the limit keeps its end, which is the part that tells entries apart. */
function bounded(label: string): string {
  const characters = [...label];
  if (characters.length <= numberingLimits.label) return label;
  return `…${characters.slice(1 - numberingLimits.label).join("")}`;
}

/**
 * The label of one point. `path` is where it is: its place among its
 * siblings, counted from 1, at each level from the top down to its own, so
 * the second subpoint of the third main point is `[3, 2]`.
 *
 * It is never longer than `numberingLimits.label` characters, however deep
 * the point is.
 */
export function entryLabel(config: NumberingConfig, path: readonly number[]): string {
  const numbering = resolveNumbering(config);
  const depth = path.length - 1;
  const format = depth < 0 ? null : levelFormat(numbering, depth);
  if (!format || format.counter === "none") return "";
  if (format.counter === "bullet")
    return bounded(`${format.prefix}${format.bullet}${format.suffix}`);

  const own = formatCounter(format.counter, path[depth], format.case);
  if (!own) return "";
  if (!format.composite) return bounded(`${format.prefix}${own}${format.suffix}`);

  // The levels above, nearest first, each in its own style. One that does not
  // count is left out. Past the limit there is no use reading further up.
  const parts = [own];
  let length = own.length;
  for (let above = depth - 1; above >= 0 && length <= numberingLimits.label; above -= 1) {
    const other = levelFormat(numbering, above);
    const text = other ? formatCounter(other.counter, path[above], other.case) : "";
    if (!text) continue;
    parts.unshift(text);
    length += text.length + format.separator.length;
  }
  return bounded(`${format.prefix}${parts.join(format.separator)}${format.suffix}`);
}

/** What numbering needs to know of an entry: which it is, and where. */
export type Numbered = { id: string; type: string; path: readonly number[] };

/**
 * The label of every entry of an outline, by its ID. The introduction and the
 * conclusion have none and are not counted.
 */
export function numberOutline(
  entries: readonly Numbered[],
  config: NumberingConfig,
): Map<string, string> {
  const labels = new Map<string, string>();
  for (const entry of entries) {
    labels.set(entry.id, entry.type === "point" ? entryLabel(config, entry.path) : "");
  }
  return labels;
}
