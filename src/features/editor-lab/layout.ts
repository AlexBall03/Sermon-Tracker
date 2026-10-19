import { z } from "zod";

import { bullets } from "@/features/outlines/model";
import {
  numberingConfigSchema,
  readNumbering,
  type NumberingConfig,
} from "@/features/outlines/numbering";
import { textColorPresets } from "./schema/model";

/*
 * Outline Layout, version 1 (PS-1B.1 §D.1, Proposed): the data contract only.
 * It is stored on the document (`doc.attrs.layout`) and wraps the outline's
 * numbering configuration verbatim. PS-1B.2A needs the contract because the
 * document carries it; the engine that draws section markers, restarts, and
 * per-level presentation (`layoutLabels`), the presets, and the panel are
 * PS-1B.2B. Until then only `layout.numbering` changes what is shown.
 *
 * The layout is validated, never repaired: one that does not parse is
 * reported by the validator as a warning and kept exactly as stored, and the
 * editor numbers by the default until a person applies a layout.
 */

const sectionMarkerSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }).strict(),
  z.object({ kind: z.literal("bullet"), bullet: z.enum(bullets) }).strict(),
  z
    .object({
      kind: z.literal("text"),
      text: z
        .string()
        .min(1)
        .max(16)
        .regex(/^[^<>\p{Cc}]*$/u),
    })
    .strict(),
]);

const em = (max: number) => z.number().min(0).max(max);

const levelPresentationSchema = z
  .object({
    indent: em(6),
    hanging: z.boolean(),
    markerAlign: z.enum(["left", "right"]),
    markerGap: em(3),
    spaceBefore: em(4),
    spaceAfter: em(4),
    lineHeight: z.number().min(1).max(3).nullable(),
    titleWeight: z.enum(["normal", "bold"]),
    titleStyle: z.enum(["normal", "italic"]),
    markerColor: z.enum(textColorPresets).nullable(),
  })
  .strict();

export const outlineLayoutSchema = z
  .object({
    version: z.literal(1),
    numbering: numberingConfigSchema,
    sections: z
      .object({ introduction: sectionMarkerSchema, conclusion: sectionMarkerSchema })
      .strict(),
    levels: z.array(levelPresentationSchema).min(1).max(12),
    typography: z
      .object({
        face: z.enum(["serif", "sans"]),
        scale: z.enum(["small", "normal", "large"]),
      })
      .strict(),
    basedOn: z.string().min(1).max(64).nullable(),
  })
  .strict();

export type OutlineLayout = Omit<z.infer<typeof outlineLayoutSchema>, "numbering"> & {
  numbering: NumberingConfig;
};

/** The presentation of a level when a layout names nothing else. */
export const defaultLevel = {
  indent: 1.25,
  hanging: false,
  markerAlign: "left",
  markerGap: 0.5,
  spaceBefore: 0.875,
  spaceAfter: 0.25,
  lineHeight: null,
  titleWeight: "bold",
  titleStyle: "normal",
  markerColor: null,
} as const satisfies z.infer<typeof levelPresentationSchema>;

/**
 * The layout an outline has when nothing but its numbering was chosen: what
 * every converted legacy outline and every PS-1A document gets. The numbering
 * is carried as it was given, even when it does not parse, so nothing is lost.
 */
export function layoutFromNumbering(numbering: unknown): OutlineLayout {
  return {
    version: 1,
    numbering: numbering as NumberingConfig,
    sections: { introduction: { kind: "none" }, conclusion: { kind: "none" } },
    levels: [{ ...defaultLevel }],
    typography: { face: "serif", scale: "normal" },
    basedOn: null,
  };
}

export const defaultLayout = (): OutlineLayout =>
  layoutFromNumbering({ version: 1, preset: "traditional" });

/** Whether a stored layout is one this version reads. */
export const layoutParses = (stored: unknown) => outlineLayoutSchema.safeParse(stored).success;

/** The numbering to draw with: the layout's, or the default when the layout cannot be read. */
export function layoutNumbering(stored: unknown): NumberingConfig {
  if (!layoutParses(stored)) return readNumbering(undefined);
  return readNumbering((stored as OutlineLayout).numbering);
}

/** Whether a layout says anything beyond its numbering (a legacy outline can hold only that). */
export function layoutBeyondNumbering(stored: unknown): boolean {
  if (typeof stored !== "object" || stored === null) return true;
  const plain = layoutFromNumbering((stored as { numbering?: unknown }).numbering);
  return !sameJson(stored, plain);
}

/** Whether two JSON values are equal, whatever the order of their keys. */
export function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const record = (value: object) => value as Record<string, unknown>;
  const keys = (value: object) =>
    Object.keys(value).filter((key) => record(value)[key] !== undefined);
  const keysA = keys(a);
  if (keysA.length !== keys(b).length) return false;
  return keysA.every((key) => sameJson(record(a)[key], record(b)[key]));
}
