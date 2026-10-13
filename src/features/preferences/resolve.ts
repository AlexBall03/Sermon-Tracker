import {
  availableTranslations,
  defaultTranslationFor,
  fallbackTranslation,
  type TranslationId,
} from "@/features/scripture/translations";
import { defaultLocale, type Locale } from "@/i18n/locales";

/**
 * What a person chose, as it is stored. The interface can be in one language
 * and the Bible in the other.
 */
export type StoredPreferences = {
  locale: Locale;
  /** Null until a translation is chosen; until then it follows the interface language. */
  bibleTranslation: TranslationId | null;
  /** Whether the person said they attend preaching class. Left out, they have not. */
  attendsPreachingClass?: boolean;
};

/** What is in force for a request, which is what every surface uses. */
export type Preferences = {
  /** The interface language in force. */
  locale: Locale;
  /** The Bible translation in force where nothing names another. */
  translation: TranslationId;
  /** The translations on offer, in order. */
  translations: TranslationId[];
  /** False when an administrator has switched Spanish off. */
  spanishEnabled: boolean;
  /**
   * Whether the account attends preaching class, as it said. It decides what is
   * suggested, never what the account may do or keep.
   */
  attendsPreachingClass: boolean;
  /** What is saved, untouched by the switch, for the settings page to show. */
  stored: StoredPreferences;
};

export const defaultStoredPreferences: StoredPreferences = {
  locale: defaultLocale,
  bibleTranslation: null,
  attendsPreachingClass: false,
};

/**
 * Turns what is stored into what is in force. No server code: the rule is
 * here, in one place, and is tested as it stands.
 *
 * - With Spanish switched off the interface is English and the Spanish Bible
 *   is not on offer, whatever is stored. Nothing stored is changed, so
 *   switching it back on restores every choice.
 * - A translation someone chose is theirs until they choose another, or choose
 *   another interface language: saving a new language clears it (`saveLocale`),
 *   so nothing here has to move it.
 * - Someone who has chosen none reads the translation in their interface's
 *   language.
 * - Attending preaching class is passed on as it was saved. The switch has
 *   nothing to say about it.
 */
export function resolvePreferences(
  stored: StoredPreferences,
  spanishEnabled: boolean,
): Preferences {
  const locale = spanishEnabled ? stored.locale : defaultLocale;
  const translations = availableTranslations(spanishEnabled);
  const chosen = stored.bibleTranslation ?? defaultTranslationFor(locale);
  return {
    locale,
    translation: translations.includes(chosen) ? chosen : fallbackTranslation,
    translations,
    spanishEnabled,
    attendsPreachingClass: stored.attendsPreachingClass ?? false,
    stored,
  };
}

/**
 * The translation a request may read: the one it names when that is on offer,
 * the one in force when it names none, and null when it names one that is not
 * on offer (a request for the Spanish text while Spanish is switched off).
 */
export function requestedTranslation(
  named: string | null | undefined,
  preferences: Pick<Preferences, "translation" | "translations">,
): TranslationId | null {
  if (named === null || named === undefined || named === "") return preferences.translation;
  return preferences.translations.find((id) => id === named) ?? null;
}
