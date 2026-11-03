import { z } from "zod";

import { paperSizes } from "../pagination/geometry";
import { highlightPresets, textAlignments, textColorPresets } from "../schema/model";
import { maxDepth } from "../v4/model";
import type { ColorValue } from "./colors";

/*
 * The document style contracts of schema v3 (PS-1B.2B.2 B.2A, lab only).
 *
 * Three levels, resolved one property at a time (`resolve.ts`):
 *   1. document defaults (`styles.defaults`);
 *   2. a named style (`styles.named`: Normal, Title, Subtitle, Heading 1–4)
 *      or a component style (`styles.components`: introduction, conclusion,
 *      point, subpoint, scripture, preacherNote, script);
 *   3. a node's own override (a paragraph's `format`, a component's
 *      `appearance`) and, inside the text, marks.
 *
 * Everything here is sparse: a property left out inherits, and the built-in
 * defaults are code (`defaults.ts`), never stored. `null` on a document
 * (`styles`, `page`) means "all defaults"; `null` on a node means "no
 * override". An empty object is never stored in place of null, so nothing
 * redundant reaches the document.
 *
 * Every value is from a closed list or a bounded number. Nothing here is a
 * CSS string: what is rendered is built from these values only.
 */

/* Fonts */

export const fontCategories = ["serif", "sans", "mono", "display"] as const;
export type FontCategory = (typeof fontCategories)[number];

/**
 * The font registry, version 1: every family a document may name, by a key
 * that never changes. Each is self-hosted under SIL OFL 1.1 or Apache 2.0
 * (loaded in B.2B). Adding a family widens the schema (§B.11); removing or
 * renaming one never happens. `metricFor` names the common system font a
 * family is metric-compatible with, so pasted text in that font keeps its
 * line breaks (paste mapping is B.2B).
 */
export const fontRegistry = {
  lora: { name: "Lora", category: "serif" },
  "source-serif-4": { name: "Source Serif 4", category: "serif" },
  "eb-garamond": { name: "EB Garamond", category: "serif" },
  merriweather: { name: "Merriweather", category: "serif" },
  tinos: { name: "Tinos", category: "serif", metricFor: "Times New Roman" },
  figtree: { name: "Figtree", category: "sans" },
  inter: { name: "Inter", category: "sans" },
  "source-sans-3": { name: "Source Sans 3", category: "sans" },
  "atkinson-hyperlegible-next": { name: "Atkinson Hyperlegible Next", category: "sans" },
  arimo: { name: "Arimo", category: "sans", metricFor: "Arial" },
  "jetbrains-mono": { name: "JetBrains Mono", category: "mono" },
  cousine: { name: "Cousine", category: "mono", metricFor: "Courier New" },
  "playfair-display": { name: "Playfair Display", category: "display" },
  "cormorant-garamond": { name: "Cormorant Garamond", category: "display" },
} as const satisfies Record<string, { name: string; category: FontCategory; metricFor?: string }>;

export const fontRegistryVersion = 1;
export type FontKey = keyof typeof fontRegistry;
export const fontKeys = Object.keys(fontRegistry) as [FontKey, ...FontKey[]];
export const isFontKey = (value: unknown): value is FontKey =>
  typeof value === "string" && Object.hasOwn(fontRegistry, value);

/** Font sizes are points, the unit of print: 4 to 144, in half points. */
export const fontSizeLimits = { min: 4, max: 144, step: 0.5 } as const;
export const isFontSize = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= fontSizeLimits.min &&
  value <= fontSizeLimits.max &&
  Number.isInteger(value / fontSizeLimits.step);

/* Colors */

const hex6 = /^#[0-9a-f]{6}$/;
const hexColor = z.string().regex(hex6);

/**
 * A stored color (PS-1B.2B.2B), one of three intents (`colors.ts`):
 *
 *   - a preset key or lowercase `#rrggbb`: Adaptive, the default;
 *   - `{ mode: "exact", color }`: Exact, drawn as chosen everywhere;
 *   - `{ mode: "themed", light, dark }`: the person's own color for each theme.
 *
 * The two objects widen schema v3 after its first form. Every earlier v3
 * value keeps its meaning, so no document needs migrating; but a reader older
 * than this phase refuses the objects, and any change to this union must
 * change the validator, the marks' HTML, and the paste rules together
 * (`schema/formatting.ts`). The lab persists nothing, so no older reader
 * holds such a document; production adoption needs its own approved phase.
 */
export const colorValueSchema = (presets: readonly string[]) =>
  z.union([
    z.string().refine((value) => presets.includes(value) || hex6.test(value), "invalid color"),
    z.object({ mode: z.literal("exact"), color: hexColor }).strict(),
    z.object({ mode: z.literal("themed"), light: hexColor, dark: hexColor }).strict(),
  ]);

/** A text-like color (text, title, notation, border, accent), from the text presets. */
export const inkColorSchema = colorValueSchema(textColorPresets);
/** A fill, from the highlight presets. */
export const fillColorSchema = colorValueSchema(highlightPresets);

/* Properties */

const fontSize = z.number().refine(isFontSize, "invalid font size");
/** Paragraph spacing and indents are points too. */
const points = (min: number, max: number) => z.number().finite().min(min).max(max);

/** What text looks like. `color: null` is the theme's text color, chosen on purpose. */
export const textPropsShape = {
  fontFamily: z.enum(fontKeys).optional(),
  fontSize: fontSize.optional(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
  color: inkColorSchema.nullable().optional(),
};

/** How a block of text sits. Alignment stays the existing `textAlign` attribute on a node. */
export const paragraphPropsShape = {
  lineHeight: z.number().finite().min(1).max(3).optional(),
  spaceBefore: points(0, 72).optional(),
  spaceAfter: points(0, 72).optional(),
  indentLeft: points(0, 432).optional(),
  indentFirst: points(-144, 144).optional(),
};

/** Defaults and named styles may also set alignment. */
const blockStyleShape = {
  ...textPropsShape,
  ...paragraphPropsShape,
  align: z.enum(textAlignments).optional(),
};

/* Components */

export const componentKinds = [
  "introduction",
  "conclusion",
  "point",
  "subpoint",
  "scripture",
  "preacherNote",
  "script",
] as const;
export type ComponentKind = (typeof componentKinds)[number];

const ink = inkColorSchema.nullable().optional();
const fill = fillColorSchema.nullable().optional();

/*
 * A component's treatment (A1-UI.2B.1): how its lines are drawn, in bounded
 * points and a closed list, never CSS. `0` turns a line off. Only components
 * drawn with lines have them: a section (its opening rule is the accent, its
 * closing hairline the border) and the containers (which also have corners).
 * Points have none: their look is typography and numbering.
 */
export const borderStyles = ["solid", "dashed", "dotted", "double"] as const;
export type BorderStyle = (typeof borderStyles)[number];
/**
 * Which side of a container its accent rule is on (A1-UI.2B.2). Left is the
 * presets' design; there is no bottom, which would meet a section's closing
 * hairline. Drawn as `data-accent` on the container (`plugin.ts`), never CSS.
 */
export const accentPositions = ["left", "top", "right"] as const;
export type AccentPosition = (typeof accentPositions)[number];
export const treatmentLimits = {
  borderWidth: { min: 0, max: 4 },
  accentWidth: { min: 0, max: 6 },
  radius: { min: 0, max: 12 },
  paddingBlock: { min: 0, max: 24 },
  paddingInline: { min: 0, max: 36 },
  outsideBefore: { min: 0, max: 48 },
  outsideAfter: { min: 0, max: 48 },
} as const;
const limited = (name: keyof typeof treatmentLimits) =>
  points(treatmentLimits[name].min, treatmentLimits[name].max).optional();
const lines = {
  borderStyle: z.enum(borderStyles).optional(),
  borderWidth: limited("borderWidth"),
  accentWidth: limited("accentWidth"),
};
/*
 * A container (a passage, a note, a script) also has corners, the side of
 * its accent, the space inside it, the space outside it, and the font of its
 * label (A1-UI.2B.2). Padding and the space outside are points, as every
 * other spacing is.
 */
const box = {
  ...lines,
  radius: limited("radius"),
  accentPosition: z.enum(accentPositions).optional(),
  paddingBlock: limited("paddingBlock"),
  paddingInline: limited("paddingInline"),
  outsideBefore: limited("outsideBefore"),
  outsideAfter: limited("outsideAfter"),
  labelFont: z.enum(fontKeys).optional(),
};

/**
 * The colors each component has (brief §7): only what its design shows, so
 * nothing gains a box just to have a setting. `null` turns a color off
 * (no fill, no border) or, for text colors, returns to the theme's.
 */
/*
 * How a point's number is drawn (A4.2A): its face, size, weight, slant,
 * alignment in its column, the space after it, whether it hangs, and whether
 * it is shown at all. Presentation only: what the number says is the
 * outline's numbering (`layout.numbering`), and nothing here renumbers. Its
 * color stays `notationColor`. A point or subpoint type style and a level's
 * style (`levels`) may set these; a single node's `appearance` may not (its
 * contract is unchanged).
 */
export const markerAlignments = ["left", "right"] as const;
export type MarkerAlignment = (typeof markerAlignments)[number];
export const markerLimits = { gap: { min: 0, max: 36 } } as const;
export const markerShape = {
  markerVisible: z.boolean().optional(),
  markerFont: z.enum(fontKeys).optional(),
  markerSize: fontSize.optional(),
  markerBold: z.boolean().optional(),
  markerItalic: z.boolean().optional(),
  markerAlign: z.enum(markerAlignments).optional(),
  markerGap: points(markerLimits.gap.min, markerLimits.gap.max).optional(),
  hanging: z.boolean().optional(),
};

const componentColors = {
  introduction: { titleColor: ink, notationColor: ink, border: ink, fill, accent: ink, ...lines },
  conclusion: { titleColor: ink, notationColor: ink, border: ink, fill, accent: ink, ...lines },
  point: { titleColor: ink, notationColor: ink },
  subpoint: { titleColor: ink, notationColor: ink },
  scripture: { referenceColor: ink, border: ink, fill, accent: ink, ...box },
  preacherNote: { labelColor: ink, border: ink, fill, accent: ink, ...box },
  script: { border: ink, fill, accent: ink, ...box },
} as const satisfies Record<ComponentKind, Record<string, z.ZodType>>;

const componentShape = (kind: ComponentKind) => ({
  ...textPropsShape,
  ...paragraphPropsShape,
  ...componentColors[kind],
});

const nonEmpty = (value: object) => Object.keys(value).length > 0;
const sparse = <T extends z.ZodRawShape>(shape: T) =>
  z.object(shape).strict().refine(nonEmpty, "empty: store null instead");

/** Whether a kind's type style also draws its number (A4.2A). */
const numbered = (kind: ComponentKind) => kind === "point" || kind === "subpoint";

/** A kind's type style: its node contract, and for points their number. */
const componentTypeShape = (kind: ComponentKind) =>
  numbered(kind) ? { ...componentShape(kind), ...markerShape } : componentShape(kind);

/** A component type's style, as `styles.components[kind]`. */
export const componentStyleSchemas = Object.fromEntries(
  componentKinds.map((kind) => [kind, sparse(componentTypeShape(kind))]),
) as unknown as Record<ComponentKind, z.ZodType<ComponentStyle>>;

/** The properties a single node of a kind may set: what its `appearance` accepts. */
export const componentFields = (kind: ComponentKind): readonly string[] =>
  Object.keys(componentShape(kind));

/** The properties a component type's style may set: a node's, and for points their number. */
export const componentTypeFields = (kind: ComponentKind): readonly string[] =>
  Object.keys(componentTypeShape(kind));

/**
 * An appearance kept to what `kind` accepts, or null when nothing is left.
 * For a point whose role was taken away: a section's fill and lines mean
 * nothing on a plain point, and the outline must still validate.
 */
export function narrowAppearance(appearance: unknown, kind: ComponentKind): ComponentStyle | null {
  if (!appearance || typeof appearance !== "object") return null;
  const allowed = new Set(componentFields(kind));
  const kept = Object.fromEntries(
    Object.entries(appearance).filter(([key, value]) => allowed.has(key) && value !== undefined),
  );
  const parsed = componentStyleSchemas[kind].safeParse(kept);
  return parsed.success ? parsed.data : null;
}

/** Any component's style, as one type: each kind's schema accepts only its own colors. */
export type ComponentStyle = {
  [K in keyof ReturnType<typeof componentShape>]?: z.infer<ReturnType<typeof componentShape>[K]>;
} & {
  titleColor?: ColorValue | null;
  notationColor?: ColorValue | null;
  referenceColor?: ColorValue | null;
  labelColor?: ColorValue | null;
  border?: ColorValue | null;
  fill?: ColorValue | null;
  accent?: ColorValue | null;
  borderStyle?: BorderStyle;
  borderWidth?: number;
  accentWidth?: number;
  radius?: number;
  accentPosition?: AccentPosition;
  paddingBlock?: number;
  paddingInline?: number;
  outsideBefore?: number;
  outsideAfter?: number;
  labelFont?: FontKey;
  markerVisible?: boolean;
  markerFont?: FontKey;
  markerSize?: number;
  markerBold?: boolean;
  markerItalic?: boolean;
  markerAlign?: MarkerAlignment;
  markerGap?: number;
  hanging?: boolean;
};

/**
 * A component node's appearance override: its kind's own properties, never a
 * point's number (A4.2A keeps the node contract exactly as it was).
 */
export const appearanceSchemas = Object.fromEntries(
  componentKinds.map((kind) => [kind, sparse(componentShape(kind))]),
) as unknown as Record<ComponentKind, z.ZodType<ComponentStyle>>;

/*
 * Levels (A4.2A): how the points at one semantic depth look, over their
 * type's style (a main point's at depth 1, a subpoint's below). Keyed by the
 * depth as a string, "1" to `maxDepth` (the v4 schema's own bound), sparse:
 * a level left out, or a property it leaves out, inherits. Only what a point
 * heading draws: its text, its spacing (its place is its depth's, so no
 * indent), its title color, and its number. Never a role's heading.
 */
export const levelShape = {
  ...textPropsShape,
  lineHeight: paragraphPropsShape.lineHeight,
  spaceBefore: paragraphPropsShape.spaceBefore,
  spaceAfter: paragraphPropsShape.spaceAfter,
  titleColor: ink,
  notationColor: ink,
  ...markerShape,
};
export const levelFields = Object.keys(levelShape);
export const levelStyleSchema = sparse(levelShape);
export type LevelStyle = Omit<ComponentStyle, "indentLeft" | "indentFirst">;

/** A depth's key in `styles.levels`: "1" to `maxDepth`, the integer as written. */
export const levelKey = (depth: number) => String(depth);
export const isLevelKey = (key: string): boolean => {
  if (!/^[1-9][0-9]*$/.test(key)) return false;
  return Number(key) <= maxDepth;
};
export const levelsSchema = z
  .record(z.string(), levelStyleSchema)
  .refine((levels) => Object.keys(levels).every(isLevelKey), "invalid level")
  .refine(nonEmpty, "empty: store null instead");

/* Named styles */

export const namedStyles = [
  "normal",
  "title",
  "subtitle",
  "heading1",
  "heading2",
  "heading3",
  "heading4",
] as const;
export type NamedStyle = (typeof namedStyles)[number];

/** A paragraph's own named style: null is Normal. Headings are `heading` nodes, not this. */
export const paragraphStyleNames = ["title", "subtitle"] as const;

/** A paragraph's or heading's own overrides of its style. */
export const paragraphFormatSchema = sparse(paragraphPropsShape);

/* The document */

/**
 * The presentation presets a person may choose (A1-UI.2B.1). An outline keeps
 * its choice as `styles.preset`; left out, the editor's default applies
 * (Balanced in the sermon editor, the baseline in the v3 lab), so a document
 * made before presets keeps its look. The baseline is the v3 lab's and is
 * never stored.
 */
export const userPresetIds = ["minimal", "balanced", "expressive"] as const;
export type UserPresetId = (typeof userPresetIds)[number];

const blockStyle = sparse(blockStyleShape);

/** How far each outline level is drawn in from the one above (A4.2A), in points. */
export const levelIndentLimits = { min: 6, max: 72 } as const;
/** The outline's defaults: a text style's properties, and the indent per outline level. */
export const defaultsStyleSchema = sparse({
  ...blockStyleShape,
  levelIndent: points(levelIndentLimits.min, levelIndentLimits.max).optional(),
});

/*
 * Which revision of its built-in preset an outline is drawn with (A4.2A).
 * Revisions are immutable: a refinement is a new revision, written only when
 * a person chooses a preset, so no document changes look because a preset
 * was refined. Left out, the first revision applies: every document stored
 * before A4.2A keeps exactly its look.
 */
export type PresetRevision = 1 | 2;
export const latestPresetRevision: PresetRevision = 2;

export const documentStylesSchema = z
  .object({
    version: z.literal(1),
    preset: z.enum(userPresetIds).optional(),
    presetRevision: z.union([z.literal(1), z.literal(2)]).optional(),
    defaults: defaultsStyleSchema.optional(),
    named: z
      .object(Object.fromEntries(namedStyles.map((name) => [name, blockStyle.optional()])))
      .strict()
      .optional(),
    components: z
      .object(
        Object.fromEntries(
          componentKinds.map((kind) => [kind, componentStyleSchemas[kind].optional()]),
        ),
      )
      .strict()
      .optional(),
    levels: levelsSchema.optional(),
    runningHeader: sparse({ fontSize: fontSize.optional(), color: ink }).optional(),
  })
  .strict();
export type DocumentStyles = z.infer<typeof documentStylesSchema>;

/** The optional line under the sermon's title. The title itself is the sermon's, never the document's. */
export const subtitleSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/\S/)
  .regex(/^[^<>\p{Cc}]*$/u);

/** Margins in points: at least half an inch, and at least three inches of text left each way. */
const margin = points(36, 288);
const minText = 216;
const paperPoints = {
  letter: { width: 612, height: 792 },
  legal: { width: 612, height: 1008 },
  a4: { width: 595.28, height: 841.89 },
  a5: { width: 419.53, height: 595.28 },
  halfLetter: { width: 396, height: 612 },
} as const satisfies Record<(typeof paperSizes)[number], { width: number; height: number }>;

/** A sermon's own paper, margins, running header, and page numbers (2B.1 §8.1). */
export const pageSetupSchema = z
  .object({
    version: z.literal(1),
    paper: z.enum(paperSizes),
    margins: z.object({ top: margin, right: margin, bottom: margin, left: margin }).strict(),
    runningHeader: z.object({ enabled: z.boolean(), subtitle: z.boolean() }).strict(),
    pageNumbers: z.object({ enabled: z.boolean() }).strict(),
  })
  .strict()
  .refine(({ paper, margins }) => {
    const size = paperPoints[paper];
    return (
      size.width - margins.left - margins.right >= minText &&
      size.height - margins.top - margins.bottom >= minText
    );
  }, "margins leave too little text");
export type PageSetup = z.infer<typeof pageSetupSchema>;
