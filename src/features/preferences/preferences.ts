import { eq } from "drizzle-orm";

import { users, type AppUser } from "@/db/schema";
import type { Database } from "@/db/types";
import type { TranslationId } from "@/features/scripture/translations";
import type { Locale } from "@/i18n/locales";
import type { StoredPreferences } from "./resolve";

/*
 * What an account has saved, and saving it. What is in force for a request,
 * with the administrator's switch applied, is `getPreferences` in current.ts.
 */

/** What an account has saved. */
export function storedPreferences(
  user: Pick<AppUser, "locale" | "bibleTranslation">,
): StoredPreferences {
  return { locale: user.locale, bibleTranslation: user.bibleTranslation };
}

/**
 * Saves an account's interface language, and returns its Bible translation to
 * following it: a new language brings its own translation, which the person
 * can then change again. For a language that differs from the one saved.
 */
export async function saveLocale(db: Pick<Database, "update">, userId: string, locale: Locale) {
  const updated = await db
    .update(users)
    .set({ locale, bibleTranslation: null })
    .where(eq(users.id, userId))
    .returning({ id: users.id });
  return updated.length > 0;
}

/**
 * Saves an account's Bible translation, or with null returns it to following
 * the interface language. The interface language is not touched.
 */
export async function saveBibleTranslation(
  db: Pick<Database, "update">,
  userId: string,
  translation: TranslationId | null,
) {
  const updated = await db
    .update(users)
    .set({ bibleTranslation: translation })
    .where(eq(users.id, userId))
    .returning({ id: users.id });
  return updated.length > 0;
}
