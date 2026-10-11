import { z } from "zod";

import { bibleBooks } from "../books";
import { highlightColors, savedLimits, translationIds } from "./model";
import { normaliseVerses, verseExists } from "./verse-set";

export const favoriteIdSchema = z.uuid();

/** Only the translation the application holds, until there is another. */
export const translationSchema = z.enum(translationIds);

const verseSchema = z.object({
  book: z.number().int().min(1).max(bibleBooks.length),
  chapter: z.number().int().min(1).max(200),
  verse: z.number().int().min(1).max(200),
});

/**
 * The verses of a favorite, or the verses to highlight: at least one, every
 * one of them a verse the Bible has, and returned in canonical order with
 * each once. A verse that does not exist is refused, never dropped.
 */
export const versesSchema = z
  .array(verseSchema, "Choose at least one verse.")
  .min(1, "Choose at least one verse.")
  .max(savedLimits.verses * 2, `Choose ${savedLimits.verses} verses or fewer at a time.`)
  .refine((verses) => verses.every(verseExists), "One of those verses does not exist.")
  .transform(normaliseVerses)
  .refine(
    (verses) => verses.length <= savedLimits.verses,
    `Choose ${savedLimits.verses} verses or fewer at a time.`,
  );

/** A favorite's label: one line, trimmed, and null when nothing was written. */
export const labelSchema = z
  .string()
  .transform((value) => value.replace(/\s+/g, " ").trim())
  .pipe(z.string().max(savedLimits.label, `Keep a label to ${savedLimits.label} characters.`))
  .nullish()
  .transform((value) => value || null);

/** A favorite's notes: trimmed, and null when nothing was written. */
export const notesSchema = z
  .string()
  .trim()
  .max(
    savedLimits.notes,
    `Keep notes to ${savedLimits.notes.toLocaleString("en")} characters or fewer.`,
  )
  .nullish()
  .transform((value) => value || null);

/** A new favorite. Label and notes may be left out; the verses may not. */
export const favoriteInputSchema = z.object({
  translation: translationSchema,
  verses: versesSchema,
  label: labelSchema,
  notes: notesSchema,
});
export type FavoriteInput = z.infer<typeof favoriteInputSchema>;

/** A change to a favorite. What is left out is left alone. */
export const favoriteChangeSchema = z.object({
  verses: versesSchema.optional(),
  label: labelSchema.optional(),
  notes: notesSchema.optional(),
});
export type FavoriteChange = z.infer<typeof favoriteChangeSchema>;

/** Verses to highlight in one color, or to clear when the color is null. */
export const highlightInputSchema = z.object({
  translation: translationSchema,
  verses: versesSchema,
  color: z.enum(highlightColors).nullable(),
});
export type HighlightInput = z.infer<typeof highlightInputSchema>;
