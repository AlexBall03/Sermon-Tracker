import { z } from "zod";

import { dictionary, formatNumber } from "@/i18n";
import { defaultLocale, type Locale } from "@/i18n/locales";
import { bibleBooks } from "../books";
import { highlightColors, savedLimits, translationIds } from "./model";
import { normaliseVerses, verseExists } from "./verse-set";

export const favoriteIdSchema = z.uuid();

/** A translation the application holds. Whether it is on offer is the action's to decide. */
export const translationSchema = z.enum(translationIds);

const verseSchema = z.object({
  book: z.number().int().min(1).max(bibleBooks.length),
  chapter: z.number().int().min(1).max(200),
  verse: z.number().int().min(1).max(200),
});

/**
 * The schemas of saved Scripture, saying what they refuse in one language.
 * The rules are the same whatever the language; only the words differ.
 */
export function savedSchemas(locale: Locale = defaultLocale) {
  const t = dictionary(locale, "scripture").saved.actions;
  /**
   * The verses of a favorite, or the verses to highlight: at least one, every
   * one of them a verse the Bible has, and returned in canonical order with
   * each once. A verse that does not exist is refused, never dropped.
   */
  const verses = z
    .array(verseSchema, t.chooseVerse)
    .min(1, t.chooseVerse)
    .max(savedLimits.verses * 2, t.tooManyVerses(savedLimits.verses))
    .refine((list) => list.every(verseExists), t.noSuchVerse)
    .transform(normaliseVerses)
    .refine((list) => list.length <= savedLimits.verses, t.tooManyVerses(savedLimits.verses));

  /** A favorite's label: one line, trimmed, and null when nothing was written. */
  const label = z
    .string()
    .transform((value) => value.replace(/\s+/g, " ").trim())
    .pipe(z.string().max(savedLimits.label, t.labelTooLong(savedLimits.label)))
    .nullish()
    .transform((value) => value || null);

  /** A favorite's notes: trimmed, and null when nothing was written. */
  const notes = z
    .string()
    .trim()
    .max(savedLimits.notes, t.notesTooLong(formatNumber(locale, savedLimits.notes)))
    .nullish()
    .transform((value) => value || null);

  return {
    verses,
    label,
    notes,
    /** A new favorite. Label and notes may be left out; the verses may not. */
    favoriteInput: z.object({ translation: translationSchema, verses, label, notes }),
    /** A change to a favorite. What is left out is left alone. */
    favoriteChange: z.object({
      verses: verses.optional(),
      label: label.optional(),
      notes: notes.optional(),
    }),
    /** Verses to highlight in one color, or to clear when the color is null. */
    highlightInput: z.object({
      translation: translationSchema,
      verses,
      color: z.enum(highlightColors).nullable(),
    }),
  };
}

const inEnglish = savedSchemas();

// The schemas in English, for callers that only need the shapes and the types.
export const versesSchema = inEnglish.verses;
export const labelSchema = inEnglish.label;
export const notesSchema = inEnglish.notes;
export const favoriteInputSchema = inEnglish.favoriteInput;
export type FavoriteInput = z.infer<typeof favoriteInputSchema>;
export const favoriteChangeSchema = inEnglish.favoriteChange;
export type FavoriteChange = z.infer<typeof favoriteChangeSchema>;
export const highlightInputSchema = inEnglish.highlightInput;
export type HighlightInput = z.infer<typeof highlightInputSchema>;
