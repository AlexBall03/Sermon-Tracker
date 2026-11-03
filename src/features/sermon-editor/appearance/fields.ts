import {
  levelIndentLimits,
  markerLimits,
  type ComponentKind,
} from "@/features/editor-lab/styles/model";

/*
 * What the Appearance panel offers for each layer (A1-UI.2B.2): every
 * property the layer's schema accepts that changes what is drawn, grouped
 * as a person thinks of them, the less common under "More options". The
 * coverage test (`v4/appearance-draft.test.ts`) holds this list to the schema:
 * a property is either offered here or named in `notDrawn` with why.
 */

export type Control =
  | "font"
  | "size"
  | "toggle"
  | "ink"
  | "inkOrNone"
  | "fill"
  | "number"
  | "align"
  | "borderStyle"
  | "accentPosition"
  | "markerAlign";

export type FieldSpec = {
  field: string;
  control: Control;
  /** Bounds for a number (points, or a line height's multiple). */
  limits?: { min: number; max: number };
  advanced?: boolean;
};

export type GroupId =
  "typography" | "label" | "spacing" | "number" | "colors" | "borders" | "accents" | "box";
export type FieldGroup = { id: GroupId; fields: FieldSpec[] };

const spacing = (advancedIndent: boolean): FieldSpec[] => [
  { field: "lineHeight", control: "number", limits: { min: 1, max: 3 } },
  { field: "spaceBefore", control: "number", limits: { min: 0, max: 72 } },
  { field: "spaceAfter", control: "number", limits: { min: 0, max: 72 } },
  {
    field: "indentLeft",
    control: "number",
    limits: { min: 0, max: 432 },
    advanced: advancedIndent,
  },
  {
    field: "indentFirst",
    control: "number",
    limits: { min: -144, max: 144 },
    advanced: advancedIndent,
  },
];

const text = (extra: FieldSpec[] = []): FieldSpec[] => [
  { field: "fontFamily", control: "font" },
  { field: "fontSize", control: "size" },
  { field: "bold", control: "toggle" },
  { field: "italic", control: "toggle" },
  { field: "underline", control: "toggle", advanced: true },
  { field: "color", control: "ink" },
  ...extra,
];

/** The outline's named text styles: every property a style may set. */
export const blockGroups: FieldGroup[] = [
  { id: "typography", fields: text() },
  { id: "spacing", fields: [...spacing(false), { field: "align", control: "align" }] },
];

/** The outline's shared defaults: a text style's, and the indent of each outline level (A4.2A). */
export const defaultsGroups: FieldGroup[] = [
  blockGroups[0],
  {
    id: "spacing",
    fields: [
      ...blockGroups[1].fields,
      { field: "levelIndent", control: "number", limits: levelIndentLimits },
    ],
  },
];

/*
 * A point's number (A4.2A): how it is drawn, never what it says (that is
 * Outline Settings → Numbering). Offered on the point and subpoint types and
 * on every level, never on a single point.
 */
const numberGroup: FieldGroup = {
  id: "number",
  fields: [
    { field: "markerVisible", control: "toggle" },
    { field: "notationColor", control: "ink" },
    { field: "markerFont", control: "font" },
    { field: "markerSize", control: "size" },
    { field: "markerBold", control: "toggle" },
    { field: "markerItalic", control: "toggle", advanced: true },
    { field: "hanging", control: "toggle" },
    { field: "markerAlign", control: "markerAlign", advanced: true },
    { field: "markerGap", control: "number", limits: markerLimits.gap, advanced: true },
  ],
};

const box: FieldGroup[] = [
  { id: "colors", fields: [{ field: "fill", control: "fill" }] },
  {
    id: "borders",
    fields: [
      { field: "border", control: "inkOrNone" },
      { field: "borderWidth", control: "number", limits: { min: 0, max: 4 } },
      { field: "borderStyle", control: "borderStyle" },
      { field: "radius", control: "number", limits: { min: 0, max: 12 } },
    ],
  },
  {
    id: "accents",
    fields: [
      { field: "accent", control: "inkOrNone" },
      { field: "accentWidth", control: "number", limits: { min: 0, max: 6 } },
      { field: "accentPosition", control: "accentPosition" },
    ],
  },
  {
    id: "box",
    fields: [
      { field: "paddingBlock", control: "number", limits: { min: 0, max: 24 } },
      { field: "paddingInline", control: "number", limits: { min: 0, max: 36 } },
      { field: "outsideBefore", control: "number", limits: { min: 0, max: 48 } },
      { field: "outsideAfter", control: "number", limits: { min: 0, max: 48 } },
    ],
  },
];

const section: FieldGroup[] = [
  { id: "typography", fields: text([{ field: "titleColor", control: "ink", advanced: true }]) },
  { id: "spacing", fields: spacing(true) },
  { id: "colors", fields: [{ field: "fill", control: "fill" }] },
  {
    id: "borders",
    fields: [
      { field: "border", control: "inkOrNone" },
      { field: "borderWidth", control: "number", limits: { min: 0, max: 4 } },
      { field: "borderStyle", control: "borderStyle" },
    ],
  },
  {
    id: "accents",
    fields: [
      { field: "accent", control: "inkOrNone" },
      { field: "accentWidth", control: "number", limits: { min: 0, max: 6 } },
    ],
  },
];

/** A single point: its heading's text and spacing, and its own number color. */
const point: FieldGroup[] = [
  {
    id: "typography",
    fields: text([
      { field: "titleColor", control: "ink", advanced: true },
      { field: "notationColor", control: "ink" },
    ]),
  },
  { id: "spacing", fields: spacing(true) },
];

/** Every point or subpoint (their type): a single point's properties, and its number. */
const pointType: FieldGroup[] = [
  { id: "typography", fields: text([{ field: "titleColor", control: "ink", advanced: true }]) },
  { id: "spacing", fields: spacing(true) },
  numberGroup,
];

/**
 * One depth's points (A4.2A): their heading's text and spacing (a level's place
 * is its depth's, so no indent) and their number.
 */
export const levelGroups: FieldGroup[] = [
  { id: "typography", fields: text([{ field: "titleColor", control: "ink", advanced: true }]) },
  { id: "spacing", fields: spacing(false).filter((spec) => !spec.field.startsWith("indent")) },
  numberGroup,
];

/** A container's words: its own paragraphs (a note's, a script's) are spaced and indented too. */
const containerText = (label: FieldSpec[], paragraphs: boolean): FieldGroup[] => [
  {
    id: "typography",
    fields: [...text(), { field: "lineHeight", control: "number", limits: { min: 1, max: 3 } }],
  },
  { id: "label", fields: label },
  ...(paragraphs
    ? [
        {
          id: "spacing" as const,
          fields: spacing(true).filter((spec) => spec.field !== "lineHeight"),
        },
      ]
    : []),
];

/** What a single component offers (Component Appearance): its node's own contract. */
export const componentGroups: Record<ComponentKind, FieldGroup[]> = {
  introduction: section,
  conclusion: section,
  point,
  subpoint: point,
  scripture: [
    ...containerText(
      [
        { field: "referenceColor", control: "ink" },
        { field: "labelFont", control: "font" },
      ],
      false,
    ),
    ...box,
  ],
  preacherNote: [
    ...containerText(
      [
        { field: "labelColor", control: "ink" },
        { field: "labelFont", control: "font" },
      ],
      true,
    ),
    ...box,
  ],
  script: [...containerText([{ field: "labelFont", control: "font" }], true), ...box],
};

/**
 * Properties a kind's schema accepts that draw nothing, so the panel does
 * not offer them (a reset of the whole style or component still clears them).
 */
export const notDrawn: Partial<Record<ComponentKind, Record<string, string>>> = {
  introduction: { notationColor: "a section's heading is never numbered" },
  conclusion: { notationColor: "a section's heading is never numbered" },
  scripture: {
    spaceBefore: "a passage's place is its box's (`outsideBefore`)",
    spaceAfter: "a passage's place is its box's (`outsideAfter`)",
    indentLeft: "a passage is indented by its depth",
    indentFirst: "a passage's verses are not paragraphs",
  },
};

/** What a component type offers (Outline Settings → Components): a node's, and a point's number. */
export const typeGroups: Record<ComponentKind, FieldGroup[]> = {
  ...componentGroups,
  point: pointType,
  subpoint: pointType,
};

export const fieldsOf = (groups: FieldGroup[]): string[] =>
  groups.flatMap((group) => group.fields.map((spec) => spec.field));
