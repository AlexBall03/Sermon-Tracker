import type { Locale } from "@/i18n/locales";

/**
 * The Bible translations the application holds. Plain values with no server
 * code, so the schema, the server, and the browser read one list.
 *
 * `id` is what a verse, a favorite, or a highlight is stored under. `short`
 * is the name people see: the Reina-Valera Gómez is shown as "RVG" and its
 * revision year is never part of it. `language` is the language of the text,
 * and so of the book names written beside it.
 *
 * Both follow the same numbering of chapters and verses (see
 * data/bible/README.md), which is why a reference names no translation.
 */
export const translationIds = ["kjv", "rvg"] as const;
export type TranslationId = (typeof translationIds)[number];

export type Translation = {
  id: TranslationId;
  short: string;
  name: string;
  language: Locale;
};

export const translations: Record<TranslationId, Translation> = {
  kjv: { id: "kjv", short: "KJV", name: "King James Version", language: "en" },
  rvg: { id: "rvg", short: "RVG", name: "Reina-Valera Gómez", language: "es" },
};

/** The translation that is always there, whatever is switched off. */
export const fallbackTranslation: TranslationId = "kjv";

export function isTranslationId(value: unknown): value is TranslationId {
  return typeof value === "string" && (translationIds as readonly string[]).includes(value);
}

/** The translation someone reads who has not chosen one: the one in their interface's language. */
export function defaultTranslationFor(locale: Locale): TranslationId {
  return locale === "es" ? "rvg" : "kjv";
}

/**
 * The translations on offer. With Spanish switched off (an administrator's
 * decision, enforced on the server) the Spanish text is not among them.
 */
export function availableTranslations(spanishEnabled: boolean): TranslationId[] {
  return translationIds.filter((id) => spanishEnabled || translations[id].language !== "es");
}

/** The other translation on offer, for comparing; the same one when there is no other. */
export function otherTranslation(
  id: TranslationId,
  available: readonly TranslationId[],
): TranslationId {
  return available.find((candidate) => candidate !== id) ?? id;
}
