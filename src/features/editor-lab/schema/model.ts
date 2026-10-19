import { z } from "zod";

import { bullets } from "@/features/outlines/model";
import { translationIds } from "@/features/scripture/translations";

/*
 * The closed lists of the canonical sermon document, schema v2 (PS-1B.1 §B.2,
 * Proposed; validated in PS-1B.2A). Every attribute that takes one of a fixed
 * set of values takes it from here, so the schema, the validator, and the
 * converters agree. Adding a value is a schema change (§B.11), never free text.
 */

/** The version this code reads and writes. A document above it is never edited here. */
export const currentSchemaVersion = 2;

export const sectionRoles = ["introduction", "conclusion"] as const;
export type SectionRole = (typeof sectionRoles)[number];

/** How a passage prints. `full` is the default for a passage a person inserts (§B.9). */
export const passagePrints = ["full", "reference", "hidden"] as const;
export type PassagePrint = (typeof passagePrints)[number];

/** How an inline reference reads in prose: its label, or the verse text quoted (§B.8.2). */
export const referenceDisplays = ["reference", "text"] as const;

export const noteKinds = [
  "question",
  "reminder",
  "cue",
  "illustration",
  "task",
  "note",
  "application",
] as const;
export type NoteKind = (typeof noteKinds)[number];

/** A note's own print setting; null follows its kind's default (§B.10). */
export const notePrints = ["show", "hide"] as const;

export const documentTranslations = translationIds;

export const textAlignments = ["left", "center", "right", "justify"] as const;

export const headingLevels = [2, 3, 4] as const;

/** Text color presets (§B.7). Shown through theme tokens added with the color controls (PS-1B.2B). */
export const textColorPresets = [
  "gray",
  "red",
  "orange",
  "amber",
  "green",
  "teal",
  "blue",
  "purple",
  "pink",
] as const;

/** Highlight presets (§B.7). */
export const highlightPresets = [
  "yellow",
  "green",
  "blue",
  "pink",
  "orange",
  "purple",
  "gray",
] as const;

export const defaultHighlight = "yellow";

/** A point's own numbering override (§D.3): closed, versioned, null by default. */
export const pointPresentationSchema = z
  .object({
    version: z.literal(1),
    restartAt: z.number().int().min(1).max(9999).optional(),
    hideMarker: z.boolean().optional(),
    marker: z
      .discriminatedUnion("kind", [
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
      ])
      .optional(),
  })
  .strict();
export type PointPresentation = z.infer<typeof pointPresentationSchema>;
