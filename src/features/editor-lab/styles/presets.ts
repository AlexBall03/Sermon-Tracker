import type { ComponentKind, ComponentStyle, NamedStyle } from "./model";
import type { ResolvedBlock } from "./resolve";

/*
 * Presentation presets (A1-UI.1): the first level of the style cascade
 * (`resolve.ts`), below the outline's own styles, a node's own overrides, and
 * marks. A preset is how an outline looks when it chooses nothing; it never
 * changes the outline's content or structure and is never stored in it.
 *
 * - `baseline` is the lab's look before presets (PS-1B.2B), kept exactly so
 *   the v3 lab stays the unchanged baseline. It does not draw component
 *   colors (B.2C came after it).
 * - `balanced` is the sermon editor's default: professional typography, a
 *   clear hierarchy, restrained component treatments, compact spacing. Its
 *   containers, rules, and labels are CSS under `[data-preset="balanced"]`
 *   (`v4/lab-v4.css`).
 *
 * Minimal and Expressive, the chooser, and where the choice is kept are
 * A1-UI.2. A preset's values are code, provisional until reviewed in
 * screenshots.
 */

type BlockLayer = Partial<ResolvedBlock>;

export type Preset = {
  defaults: ResolvedBlock;
  named: Record<NamedStyle, BlockLayer>;
  components: Record<ComponentKind, ComponentStyle>;
  /** Whether component colors (fill, border, accent, labels) are drawn from the styles. */
  componentColors: boolean;
};

export const presetIds = ["baseline", "balanced"] as const;
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
};

export const presets: Record<PresetId, Preset> = { baseline, balanced };

export const isPresetId = (value: unknown): value is PresetId =>
  typeof value === "string" && (presetIds as readonly string[]).includes(value);
