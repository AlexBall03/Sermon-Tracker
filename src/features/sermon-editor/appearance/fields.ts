import type { ComponentKind } from "@/features/editor-lab/styles/model";

/*
 * What the Appearance panel offers for each layer (A1-UI.2B.2): every
 * property the layer's schema accepts that changes what is drawn, grouped
 * as a person thinks of them, the less common under "More options". The
 * coverage test (`appearance-panel.test.ts`) holds this list to the schema:
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
  | "accentPosition";

export type FieldSpec = {
  field: string;
  control: Control;
  /** Bounds for a number (points, or a line height's multiple). */
  limits?: { min: number; max: number };
  advanced?: boolean;
};

export type GroupId = "typography" | "label" | "spacing" | "colors" | "borders" | "accents" | "box";
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

/** The outline's defaults and its named text styles: every property a style may set. */
export const blockGroups: FieldGroup[] = [
  { id: "typography", fields: text() },
  { id: "spacing", fields: [...spacing(false), { field: "align", control: "align" }] },
];

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

export const fieldsOf = (groups: FieldGroup[]): string[] =>
  groups.flatMap((group) => group.fields.map((spec) => spec.field));
