import { z } from "zod";

import {
  normaliseReference,
  referenceKey,
  referenceShape,
  refineReference,
  type ScriptureReference,
} from "@/features/scripture/reference";
import { dictionary, formatNumber } from "@/i18n";
import { defaultLocale, type Locale } from "@/i18n/locales";
import { entryTypes, outlineLimits } from "./model";
import { numberingConfigSchema } from "./numbering";

/** An ID as it is stored and compared: lower case. */
const id = z.uuid().transform((value) => value.toLowerCase());

export const outlineIdSchema = id;
export const entryIdSchema = id;
export const sermonIdSchema = id;

/**
 * The revision a change was made against. Left out, the change is made to
 * the outline or the entry as it stands now.
 */
export const revisionSchema = z.number().int().min(0).max(2_147_483_647).optional();

/**
 * The schemas of outlines, saying what they refuse in one language. The rules
 * are the same whatever the language. They have no server code, so the editor
 * checks with these before it asks, and the server checks again.
 *
 * There is no owner in any of them: the owner is the signed-in account, and
 * any other key in the input is dropped.
 */
export function outlineSchemas(locale: Locale = defaultLocale) {
  const t = dictionary(locale, "outlines").validation;

  /** A heading: one line, with runs of whitespace reduced to one space. It may be empty. */
  const title = z
    .string()
    .transform((value) => value.replace(/\s+/g, " ").trim())
    .pipe(z.string().max(outlineLimits.title, t.titleTooLong(outlineLimits.title)));

  /** Brief notes: trimmed, and null when nothing was written. */
  const notes = z
    .string()
    .trim()
    .max(outlineLimits.notes, t.notesTooLong(formatNumber(locale, outlineLimits.notes)))
    .nullable()
    .transform((value) => value || null);

  const parentId = id.nullish().transform((value) => value ?? null);

  /**
   * A new entry. A title or notes left out are empty, or are copied from the
   * point idea the entry is made from when there is one. An introduction or a
   * conclusion is under nothing and is made from nothing.
   */
  const entryCreate = z
    .object({
      outlineId: id,
      type: z.enum(entryTypes).default("point"),
      /** The point it goes under. Null or left out, it is a main point. */
      parentId,
      /** Its place among the points it will be beside, from 0. Left out, it goes last. */
      position: z.number().int().min(0).max(outlineLimits.entries).optional(),
      title: title.optional(),
      notes: notes.optional(),
      /** The saved point idea it is made from. */
      sourcePointId: id.nullish().transform((value) => value ?? null),
      expectedRevision: revisionSchema,
    })
    .refine((entry) => entry.type === "point" || (!entry.parentId && !entry.sourcePointId));

  /**
   * A change to an entry's words. A field left out is left alone; notes given
   * as null, or as blanks, are cleared.
   */
  const entryUpdate = z
    .object({ title: title.optional(), notes: notes.optional(), expectedRevision: revisionSchema })
    .refine((change) => change.title !== undefined || change.notes !== undefined, {
      message: t.nothingToSave,
    });

  /** Where an entry is to go: under which point (null for none), and where among those there. */
  const entryMove = z.object({
    parentId,
    position: z.number().int().min(0).max(outlineLimits.entries).optional(),
    expectedRevision: revisionSchema,
  });

  /** The passages of an entry, all of them, in order. The same passage twice is one. */
  const entryReferences = z
    .array(
      z
        .object(referenceShape)
        .superRefine((reference: ScriptureReference, context) =>
          refineReference(reference, context, locale),
        )
        .transform((reference) => normaliseReference(reference)),
    )
    .max(outlineLimits.references, t.tooManyReferences(outlineLimits.references))
    .transform((references) => {
      const seen = new Set<string>();
      return references.filter((reference) => {
        const key = referenceKey(reference);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    });

  /** How an outline is numbered. What is wrong with a configuration is not said part by part. */
  const numbering = z.unknown().transform((value, context) => {
    const parsed = numberingConfigSchema.safeParse(value);
    if (parsed.success) return parsed.data;
    context.addIssue({ code: "custom", message: t.numbering });
    return z.NEVER;
  });

  return { entryCreate, entryUpdate, entryMove, entryReferences, numbering };
}

type Schemas = ReturnType<typeof outlineSchemas>;

export type EntryCreate = z.infer<Schemas["entryCreate"]>;
export type EntryUpdate = z.infer<Schemas["entryUpdate"]>;
export type EntryMove = z.infer<Schemas["entryMove"]>;
