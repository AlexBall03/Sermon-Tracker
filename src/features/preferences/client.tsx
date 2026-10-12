"use client";

import { createContext, useContext } from "react";

import { fallbackTranslation, type TranslationId } from "@/features/scripture/translations";

/** What a Scripture surface in the browser needs to know of the account's preferences. */
export type ReadingPreferences = {
  /** The translation to read in where nothing names another. */
  translation: TranslationId;
  /** The translations on offer, in order. One, when Spanish is switched off. */
  translations: readonly TranslationId[];
};

const defaults: ReadingPreferences = {
  translation: fallbackTranslation,
  translations: [fallbackTranslation],
};

const ReadingContext = createContext<ReadingPreferences>(defaults);

/**
 * Carries the account's Bible translation, and the translations on offer, to
 * every Scripture surface. The server decides both, with the administrator's
 * switch applied, and decides again on every request for text: this only
 * tells the interface what to offer. Without a provider there is the King
 * James and nothing else.
 */
export function ReadingProvider({
  translation,
  translations,
  children,
}: ReadingPreferences & { children: React.ReactNode }) {
  return <ReadingContext value={{ translation, translations }}>{children}</ReadingContext>;
}

export function useReading(): ReadingPreferences {
  return useContext(ReadingContext);
}
