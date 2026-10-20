import type { textAlignments } from "../schema/model";
import type { ColorValue } from "./colors";
import {
  documentStylesSchema,
  type ComponentKind,
  type ComponentStyle,
  type DocumentStyles,
  type FontKey,
  type NamedStyle,
} from "./model";

/*
 * How a piece of the document looks, worked out one property at a time
 * (PS-1B.2B.2 B.2A). The order is fixed, and later wins:
 *
 *   built-in defaults → the document's defaults
 *     → a built-in named or component style → the document's own version of it
 *     → the node's override (`format` or `appearance`)
 *
 * Marks inside the text come after all of this and are the editor's to draw.
 * A property one level leaves out is inherited from the level before, so a
 * note given a red fill still follows a later change to the note style's font
 * size. `null` is a value, not a gap: on a fill, border, or accent it turns
 * that color off; on a text color it is the theme's text color.
 *
 * The built-in values below are code, never stored: changing them changes
 * every document that did not choose otherwise, and stores nothing. They are
 * provisional until B.2B draws them and tunes them in the lab.
 */

export type Alignment = (typeof textAlignments)[number];

/** Every text and paragraph property, resolved: nothing is left out. */
export type ResolvedBlock = {
  fontFamily: FontKey;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  /** null: the theme's text color. */
  color: ColorValue | null;
  lineHeight: number;
  spaceBefore: number;
  spaceAfter: number;
  indentLeft: number;
  indentFirst: number;
  align: Alignment;
};

/**
 * A component, resolved. A component color left unset everywhere is
 * `undefined`: the theme's default for that part (which may be none). `null`
 * means a person or a style turned it off.
 */
export type ResolvedComponent = Omit<ResolvedBlock, "align"> & {
  titleColor?: ColorValue | null;
  notationColor?: ColorValue | null;
  referenceColor?: ColorValue | null;
  labelColor?: ColorValue | null;
  border?: ColorValue | null;
  fill?: ColorValue | null;
  accent?: ColorValue | null;
};

type BlockLayer = Partial<ResolvedBlock>;

export const builtInDefaults: ResolvedBlock = {
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
};

export const builtInNamed: Record<NamedStyle, BlockLayer> = {
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
};

/** The look of each component when the document chooses nothing. Its colors are the theme's (unset). */
export const builtInComponents: Record<ComponentKind, ComponentStyle> = {
  // A section's and a point's values are its title's; tuned in B.2B to the lab's earlier look.
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
};

/** Later layers win, property by property; a property a layer leaves out (undefined) is inherited. */
function cascade<T extends object>(...layers: (Partial<T> | null | undefined)[]): Partial<T> {
  const result: Partial<T> = {};
  for (const layer of layers) {
    if (!layer) continue;
    for (const [key, value] of Object.entries(layer)) {
      if (value !== undefined) (result as Record<string, unknown>)[key] = value;
    }
  }
  return result;
}

/**
 * A document's styles as stored, or null for "all defaults". The validator
 * refuses a document whose styles do not parse; this guards anything that
 * reads styles without it, by falling back to the defaults.
 */
export function readStyles(stored: unknown): DocumentStyles | null {
  if (stored === null || stored === undefined || typeof stored !== "object") return null;
  // The same stored object always reads as the same object, so callers can compare by identity
  // (the style sheet, the highlight pairs, and the editor's subscriptions do, on every transaction).
  if (read.has(stored)) return read.get(stored)!;
  const parsed = documentStylesSchema.safeParse(stored);
  const styles = parsed.success ? parsed.data : null;
  read.set(stored, styles);
  return styles;
}

const read = new WeakMap<object, DocumentStyles | null>();

/** A block of ordinary text in a named style, with its own `format` (and `textAlign`) last. */
export function resolveNamed(
  styles: DocumentStyles | null,
  name: NamedStyle,
  override?: Partial<ResolvedBlock> | null,
): ResolvedBlock {
  return cascade<ResolvedBlock>(
    builtInDefaults,
    styles?.defaults as BlockLayer | undefined,
    builtInNamed[name],
    styles?.named?.[name] as BlockLayer | undefined,
    override,
  ) as ResolvedBlock;
}

/** A semantic component, with one node's `appearance` last. */
export function resolveComponent(
  styles: DocumentStyles | null,
  kind: ComponentKind,
  appearance?: ComponentStyle | null,
): ResolvedComponent {
  const { align: _align, ...resolved } = cascade<ResolvedBlock & ComponentStyle>(
    builtInDefaults,
    styles?.defaults as BlockLayer | undefined,
    builtInComponents[kind],
    styles?.components?.[kind],
    appearance,
  ) as ResolvedBlock & ComponentStyle;
  void _align;
  return resolved as ResolvedComponent;
}

/** The named style a block of text is in: a heading's level, or a paragraph's `styleName`. */
export function namedStyleOf(type: string, attrs: Record<string, unknown>): NamedStyle | null {
  if (type === "heading") {
    const level = attrs.level;
    return level === 1 || level === 2 || level === 3 || level === 4 ? `heading${level}` : null;
  }
  if (type === "paragraph") {
    return attrs.styleName === "title" || attrs.styleName === "subtitle"
      ? attrs.styleName
      : "normal";
  }
  return null;
}

/**
 * The component a node stands for. A point at the top level is a point; one
 * inside a point is a subpoint, at any depth (the Outline Layout, not the
 * style, tells deeper levels apart).
 */
export function componentOf(
  type: string,
  attrs: Record<string, unknown>,
  insidePoint: boolean,
): ComponentKind | null {
  switch (type) {
    case "sermonSection":
      return attrs.role === "conclusion"
        ? "conclusion"
        : attrs.role === "introduction"
          ? "introduction"
          : null;
    case "outlinePoint":
      return insidePoint ? "subpoint" : "point";
    case "scripturePassage":
      return "scripture";
    case "preacherNote":
      return "preacherNote";
    case "script":
      return "script";
    default:
      return null;
  }
}
