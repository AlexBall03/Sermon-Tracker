import { userPresetIds } from "./model";
import type { ComponentKind, ComponentStyle, FontKey, NamedStyle } from "./model";
import type { ResolvedBlock } from "./resolve";

/*
 * Presentation presets (A1-UI.1): the first level of the style cascade
 * (`resolve.ts`), below the outline's own styles, a node's own overrides, and
 * marks. A preset is how an outline looks when it chooses nothing; it never
 * changes the outline's content or structure. Its values are never stored;
 * only which preset an outline chose is.
 *
 * - `baseline` is the lab's look before presets (PS-1B.2B), kept exactly so
 *   the v3 lab stays the unchanged baseline. It does not draw component
 *   colors (B.2C came after it).
 * - `balanced` is the sermon editor's default: professional typography, a
 *   clear hierarchy, restrained component treatments, compact spacing.
 *
 * Minimal and Expressive (below, A1-UI.2B.1) are the other two a person may
 * choose; the outline keeps the choice (`styles.preset`, `model.ts`). Every
 * preset but the baseline is drawn by the studio CSS (`[data-studio]`,
 * `v4/lab-v4.css`), with the preset's own tokens under its `data-preset`. A
 * preset's values are code, provisional until reviewed in screenshots.
 */

type BlockLayer = Partial<ResolvedBlock>;

export type Preset = {
  defaults: ResolvedBlock;
  named: Record<NamedStyle, BlockLayer>;
  components: Record<ComponentKind, ComponentStyle>;
  /** Whether component colors (fill, border, accent, labels) are drawn from the styles. */
  componentColors: boolean;
  /**
   * The shared face of the outline's structural words that no style sets: a
   * passage's reference, verse numbers, a note's or script's label (A1-UI.2A).
   * Drawn as `--ps-structure-font`; each of those reads its own
   * `--ps-<component>-label-font` first, so it can be customized apart later
   * (A1-UI.2B). Null draws nothing (the baseline).
   */
  structureFont: FontKey | null;
  /**
   * Whether a numbered point hangs its number (A1-UI.2A): the number in a
   * column of its own, every line of the heading aligned after it, and the
   * writing a point owns aligned with the heading's words (`v4/lab-v4.css`).
   */
  hangingNumbers: boolean;
};

/** Every preset; the ones a person may choose are `userPresetIds` (`model.ts`). */
export const presetIds = ["baseline", ...userPresetIds] as const;
export type PresetId = (typeof presetIds)[number];

const baseline: Preset = {
  defaults: {
    fontFamily: "lora",
    fontSize: 12,
    bold: false,
    italic: false,
    underline: false,
    color: null,
    lineHeight: 1.5,
    spaceBefore: 0,
    spaceAfter: 6,
    indentLeft: 0,
    indentFirst: 0,
    align: "left",
  },
  named: {
    normal: {},
    title: {
      fontFamily: "playfair-display",
      fontSize: 26,
      bold: true,
      lineHeight: 1.2,
      spaceAfter: 4,
    },
    subtitle: { fontSize: 14, italic: true, color: "gray", spaceAfter: 12 },
    heading1: {
      fontFamily: "figtree",
      fontSize: 20,
      bold: true,
      lineHeight: 1.25,
      spaceBefore: 18,
      spaceAfter: 6,
    },
    heading2: {
      fontFamily: "figtree",
      fontSize: 16,
      bold: true,
      lineHeight: 1.3,
      spaceBefore: 14,
      spaceAfter: 4,
    },
    heading3: {
      fontFamily: "figtree",
      fontSize: 14,
      bold: true,
      lineHeight: 1.3,
      spaceBefore: 12,
      spaceAfter: 4,
    },
    heading4: {
      fontFamily: "figtree",
      fontSize: 12,
      bold: true,
      lineHeight: 1.3,
      spaceBefore: 10,
      spaceAfter: 2,
    },
  },
  components: {
    // A section's and a point's values are its title's.
    introduction: {
      fontFamily: "playfair-display",
      fontSize: 15,
      bold: true,
      lineHeight: 1.3,
      spaceBefore: 4,
      spaceAfter: 4,
    },
    conclusion: {
      fontFamily: "playfair-display",
      fontSize: 15,
      bold: true,
      lineHeight: 1.3,
      spaceBefore: 4,
      spaceAfter: 4,
    },
    point: {
      fontFamily: "figtree",
      fontSize: 13.5,
      bold: true,
      lineHeight: 1.35,
      spaceBefore: 10,
      spaceAfter: 3,
    },
    subpoint: {
      fontFamily: "figtree",
      fontSize: 12.5,
      bold: true,
      lineHeight: 1.35,
      spaceBefore: 8,
      spaceAfter: 2,
    },
    scripture: {},
    // A note's and a script's values are their paragraphs'.
    preacherNote: { fontFamily: "figtree", fontSize: 11, spaceAfter: 3 },
    script: {},
  },
  componentColors: false,
  structureFont: null,
  hangingNumbers: false,
};

/*
 * Balanced. One serif for what is read and said (prose, Scripture, scripts),
 * its companion sans for structure (points, sections, headings, notes). The
 * vertical rhythm is in points, so it prints as it shows: a main point opens
 * 12pt of space, a subpoint 6pt, a heading keeps 3pt or less to its own
 * writing, and paragraphs of one group sit 4pt apart.
 */
const structure = "source-sans-3" as const;

const balanced: Preset = {
  defaults: {
    ...baseline.defaults,
    fontFamily: "source-serif-4",
    lineHeight: 1.4,
    spaceAfter: 4,
  },
  named: {
    normal: {},
    title: {
      fontFamily: "source-serif-4",
      fontSize: 24,
      bold: true,
      lineHeight: 1.2,
      spaceAfter: 4,
    },
    subtitle: { fontSize: 13, italic: true, color: "gray", spaceAfter: 12 },
    heading1: {
      fontFamily: structure,
      fontSize: 18,
      bold: true,
      lineHeight: 1.25,
      spaceBefore: 16,
      spaceAfter: 4,
    },
    heading2: {
      fontFamily: structure,
      fontSize: 15,
      bold: true,
      lineHeight: 1.3,
      spaceBefore: 12,
      spaceAfter: 4,
    },
    heading3: {
      fontFamily: structure,
      fontSize: 13,
      bold: true,
      lineHeight: 1.3,
      spaceBefore: 10,
      spaceAfter: 3,
    },
    heading4: {
      fontFamily: structure,
      fontSize: 12,
      bold: true,
      lineHeight: 1.3,
      spaceBefore: 8,
      spaceAfter: 2,
    },
  },
  components: {
    // The frame gives a section its space above its rule (`lab-v4.css`); this is under the rule.
    introduction: {
      fontFamily: structure,
      fontSize: 13,
      bold: true,
      lineHeight: 1.3,
      spaceBefore: 6,
      spaceAfter: 4,
    },
    conclusion: {
      fontFamily: structure,
      fontSize: 13,
      bold: true,
      lineHeight: 1.3,
      spaceBefore: 6,
      spaceAfter: 4,
    },
    point: {
      fontFamily: structure,
      fontSize: 13,
      bold: true,
      lineHeight: 1.3,
      spaceBefore: 12,
      spaceAfter: 3,
    },
    subpoint: {
      fontFamily: structure,
      fontSize: 12,
      bold: true,
      lineHeight: 1.35,
      spaceBefore: 6,
      spaceAfter: 2,
    },
    scripture: {},
    preacherNote: { fontFamily: structure, fontSize: 10.5, lineHeight: 1.4, spaceAfter: 2 },
    // Words to be said aloud: the reading serif, given a little more air.
    script: { lineHeight: 1.5, spaceAfter: 3 },
  },
  componentColors: true,
  structureFont: structure,
  hangingNumbers: true,
};

/*
 * Minimal (A1-UI.2B.1): a traditional printed outline. One serif for
 * everything, structure told by weight, size, and numbering alone; quiet
 * hairlines and no fills (`lab-v4.css`). Compact: a main point opens 10pt,
 * paragraphs sit 3pt apart.
 */
const serif = "source-serif-4" as const;

const minimal: Preset = {
  defaults: { ...balanced.defaults, lineHeight: 1.38, spaceAfter: 3 },
  named: {
    normal: {},
    title: { fontFamily: serif, fontSize: 22, bold: true, lineHeight: 1.2, spaceAfter: 2 },
    subtitle: { fontSize: 12, italic: true, color: "gray", spaceAfter: 10 },
    heading1: {
      fontFamily: serif,
      fontSize: 16,
      bold: true,
      lineHeight: 1.25,
      spaceBefore: 14,
      spaceAfter: 3,
    },
    heading2: {
      fontFamily: serif,
      fontSize: 14,
      bold: true,
      lineHeight: 1.3,
      spaceBefore: 10,
      spaceAfter: 3,
    },
    heading3: {
      fontFamily: serif,
      fontSize: 12.5,
      bold: true,
      lineHeight: 1.3,
      spaceBefore: 8,
      spaceAfter: 2,
    },
    heading4: {
      fontFamily: serif,
      fontSize: 12,
      bold: true,
      italic: true,
      lineHeight: 1.3,
      spaceBefore: 6,
      spaceAfter: 2,
    },
  },
  components: {
    introduction: {
      fontFamily: serif,
      fontSize: 12.5,
      bold: true,
      lineHeight: 1.3,
      spaceBefore: 8,
      spaceAfter: 3,
    },
    conclusion: {
      fontFamily: serif,
      fontSize: 12.5,
      bold: true,
      lineHeight: 1.3,
      spaceBefore: 8,
      spaceAfter: 3,
    },
    point: {
      fontFamily: serif,
      fontSize: 13,
      bold: true,
      lineHeight: 1.3,
      spaceBefore: 10,
      spaceAfter: 2,
    },
    subpoint: {
      fontFamily: serif,
      fontSize: 12,
      bold: true,
      lineHeight: 1.35,
      spaceBefore: 5,
      spaceAfter: 2,
    },
    scripture: {},
    // A margin note in a printed book: the reading face, smaller and italic.
    preacherNote: {
      fontFamily: serif,
      fontSize: 10.5,
      italic: true,
      lineHeight: 1.4,
      spaceAfter: 2,
    },
    script: { lineHeight: 1.45, spaceAfter: 3 },
  },
  componentColors: true,
  structureFont: serif,
  hangingNumbers: true,
};

/*
 * Expressive (A1-UI.2B.1): the same reading serif and structural sans as
 * Balanced, with a stronger hierarchy (larger points and sections, a display
 * title) and more evident component treatments (`lab-v4.css`): tinted
 * notes, a heavier Scripture rule, a double-ruled script. Practical first:
 * every treatment still tells its component apart in grayscale.
 */
const expressive: Preset = {
  defaults: { ...balanced.defaults, lineHeight: 1.45 },
  named: {
    normal: {},
    title: {
      fontFamily: "playfair-display",
      fontSize: 27,
      bold: true,
      lineHeight: 1.15,
      spaceAfter: 4,
    },
    subtitle: { fontFamily: structure, fontSize: 13, color: "gray", spaceAfter: 14 },
    heading1: {
      fontFamily: structure,
      fontSize: 19,
      bold: true,
      lineHeight: 1.25,
      spaceBefore: 18,
      spaceAfter: 4,
    },
    heading2: {
      fontFamily: structure,
      fontSize: 16,
      bold: true,
      lineHeight: 1.3,
      spaceBefore: 14,
      spaceAfter: 4,
    },
    heading3: {
      fontFamily: structure,
      fontSize: 13.5,
      bold: true,
      lineHeight: 1.3,
      spaceBefore: 10,
      spaceAfter: 3,
    },
    heading4: {
      fontFamily: structure,
      fontSize: 12,
      bold: true,
      lineHeight: 1.3,
      spaceBefore: 8,
      spaceAfter: 2,
    },
  },
  components: {
    introduction: {
      fontFamily: structure,
      fontSize: 14.5,
      bold: true,
      lineHeight: 1.3,
      spaceBefore: 10,
      spaceAfter: 5,
    },
    conclusion: {
      fontFamily: structure,
      fontSize: 14.5,
      bold: true,
      lineHeight: 1.3,
      spaceBefore: 10,
      spaceAfter: 5,
    },
    point: {
      fontFamily: structure,
      fontSize: 14,
      bold: true,
      lineHeight: 1.3,
      spaceBefore: 14,
      spaceAfter: 4,
    },
    subpoint: {
      fontFamily: structure,
      fontSize: 12.5,
      bold: true,
      lineHeight: 1.35,
      spaceBefore: 7,
      spaceAfter: 2,
    },
    scripture: {},
    preacherNote: { fontFamily: structure, fontSize: 10.5, lineHeight: 1.45, spaceAfter: 2 },
    script: { lineHeight: 1.55, spaceAfter: 3 },
  },
  componentColors: true,
  structureFont: structure,
  hangingNumbers: true,
};

export const presets: Record<PresetId, Preset> = { baseline, minimal, balanced, expressive };

export const isPresetId = (value: unknown): value is PresetId =>
  typeof value === "string" && (presetIds as readonly string[]).includes(value);
