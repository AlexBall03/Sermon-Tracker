import type { TranslationId } from "@/features/scripture/translations";
import type { Locale } from "@/i18n/locales";
import { resolvePreferences, type Preferences } from "./resolve";

/**
 * Tests only. The preferences a test's "request" is made with, in place of
 * the session and the database that `getPreferences` reads (vitest.setup.ts
 * stands this in for features/preferences/current.ts in every test). The rule
 * that turns them into what is in force is the real one.
 *
 * By default: an English interface, no translation chosen, Spanish on. Each
 * test starts from that again.
 */
const defaults = {
  locale: "en" as Locale,
  bibleTranslation: null as TranslationId | null,
  spanishEnabled: true,
};

export const testPreferences = {
  ...defaults,
  reset() {
    Object.assign(testPreferences, defaults);
  },
  current(): Preferences {
    const { locale, bibleTranslation, spanishEnabled } = testPreferences;
    return resolvePreferences({ locale, bibleTranslation }, spanishEnabled);
  },
};
