import type { textAlignments } from "../schema/model";
import type { ColorValue } from "./colors";
import {
  documentStylesSchema,
  type BorderStyle,
  type ComponentKind,
  type ComponentStyle,
  type DocumentStyles,
  type FontKey,
  type NamedStyle,
} from "./model";
import { presets, type Preset } from "./presets";

/*
 * How a piece of the document looks, worked out one property at a time
 * (PS-1B.2B.2 B.2A; presets A1-UI.1). The order is fixed, and later wins:
 *
 *   the preset's defaults → the document's defaults
 *     → the preset's named or component style → the document's own version of it
 *     → the node's override (`format` or `appearance`)
 *
 * Marks inside the text come after all of this and are the editor's to draw.
 * A property one level leaves out is inherited from the level before, so a
 * note given a red fill still follows a later change to the note style's font
 * size. `null` is a value, not a gap: on a fill, border, or accent it turns
 * that color off; on a text color it is the theme's text color.
 *
 * A preset's values (`presets.ts`) are code, never stored: changing them
 * changes every document that did not choose otherwise, and stores nothing.
 * Without a preset, the baseline (the v3 lab's look) is used.
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
  borderStyle?: BorderStyle;
  borderWidth?: number;
  accentWidth?: number;
  radius?: number;
};

type BlockLayer = Partial<ResolvedBlock>;

/** The baseline preset (`presets.ts`), under its earlier names. */
export const builtInDefaults: ResolvedBlock = presets.baseline.defaults;
export const builtInNamed: Record<NamedStyle, BlockLayer> = presets.baseline.named;
export const builtInComponents: Record<ComponentKind, ComponentStyle> = presets.baseline.components;

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
  preset: Preset = presets.baseline,
): ResolvedBlock {
  return cascade<ResolvedBlock>(
    preset.defaults,
    styles?.defaults as BlockLayer | undefined,
    preset.named[name],
    styles?.named?.[name] as BlockLayer | undefined,
    override,
  ) as ResolvedBlock;
}

/** A semantic component, with one node's `appearance` last. */
export function resolveComponent(
  styles: DocumentStyles | null,
  kind: ComponentKind,
  appearance?: ComponentStyle | null,
  preset: Preset = presets.baseline,
): ResolvedComponent {
  const { align: _align, ...resolved } = cascade<ResolvedBlock & ComponentStyle>(
    preset.defaults,
    styles?.defaults as BlockLayer | undefined,
    preset.components[kind],
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
