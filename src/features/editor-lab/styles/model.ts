import { z } from "zod";

import { paperSizes } from "../pagination/geometry";
import { highlightPresets, textAlignments, textColorPresets } from "../schema/model";

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
const colorOf = (presets: readonly string[]) =>
  z.string().refine((value) => presets.includes(value) || hex6.test(value), "invalid color");

/** A text-like color (text, title, notation, border, accent): a text preset or `#rrggbb`. */
export const inkColorSchema = colorOf(textColorPresets);
/** A fill: a highlight preset or `#rrggbb`. */
export const fillColorSchema = colorOf(highlightPresets);

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

/**
 * The colors each component has (brief §7): only what its design shows, so
 * nothing gains a box just to have a setting. `null` turns a color off
 * (no fill, no border) or, for text colors, returns to the theme's.
 */
const componentColors = {
  introduction: { titleColor: ink, notationColor: ink, border: ink, fill, accent: ink },
  conclusion: { titleColor: ink, notationColor: ink, border: ink, fill, accent: ink },
  point: { titleColor: ink, notationColor: ink },
  subpoint: { titleColor: ink, notationColor: ink },
  scripture: { referenceColor: ink, border: ink, fill, accent: ink },
  preacherNote: { labelColor: ink, border: ink, fill, accent: ink },
  script: { border: ink, fill, accent: ink },
} as const satisfies Record<ComponentKind, Record<string, z.ZodType>>;

const componentShape = (kind: ComponentKind) => ({
  ...textPropsShape,
  ...paragraphPropsShape,
  ...componentColors[kind],
});

const nonEmpty = (value: object) => Object.keys(value).length > 0;
const sparse = <T extends z.ZodRawShape>(shape: T) =>
  z.object(shape).strict().refine(nonEmpty, "empty: store null instead");

/** A component's style, as `styles.components[kind]` or a node's own `appearance`. */
export const componentStyleSchemas = Object.fromEntries(
  componentKinds.map((kind) => [kind, sparse(componentShape(kind))]),
) as unknown as Record<ComponentKind, z.ZodType<ComponentStyle>>;

/** Any component's style, as one type: each kind's schema accepts only its own colors. */
export type ComponentStyle = {
  [K in keyof ReturnType<typeof componentShape>]?: z.infer<ReturnType<typeof componentShape>[K]>;
} & {
  titleColor?: string | null;
  notationColor?: string | null;
  referenceColor?: string | null;
  labelColor?: string | null;
  border?: string | null;
  fill?: string | null;
  accent?: string | null;
};

/** A component node's appearance override: the same properties as its style. */
export const appearanceSchemas = componentStyleSchemas;

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

const blockStyle = sparse(blockStyleShape);

export const documentStylesSchema = z
  .object({
    version: z.literal(1),
    defaults: blockStyle.optional(),
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
