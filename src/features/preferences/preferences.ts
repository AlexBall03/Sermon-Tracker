import { eq } from "drizzle-orm";

import { users, type AppUser } from "@/db/schema";
import type { Database } from "@/db/types";
import type { TranslationId } from "@/features/scripture/translations";
import type { Locale } from "@/i18n/locales";
import type { StoredPreferences } from "./resolve";
import type { ProfileUpdate } from "./schemas";

/*
 * What an account has saved, and saving it. What is in force for a request,
 * with the administrator's switch applied, is `getPreferences` in current.ts.
 *
 * Beside the two preferences is what an account says about itself: its church
 * and its ministry role, which are words and decide nothing, and whether it
 * attends preaching class. All of it is on the account's own row.
 */

/** What an account has saved. */
export function storedPreferences(
  user: Pick<AppUser, "locale" | "bibleTranslation"> &
    Partial<Pick<AppUser, "attendsPreachingClass">>,
): StoredPreferences {
  return {
    locale: user.locale,
    bibleTranslation: user.bibleTranslation,
    attendsPreachingClass: user.attendsPreachingClass ?? false,
  };
}

/** What an account says about itself, for a form to start from. */
export type StoredProfile = {
  churchName: string | null;
  ministryRole: string | null;
  attendsPreachingClass: boolean;
};

export function storedProfile(
  user: Partial<Pick<AppUser, "churchName" | "ministryRole" | "attendsPreachingClass">>,
): StoredProfile {
  return {
    churchName: user.churchName ?? null,
    ministryRole: user.ministryRole ?? null,
    attendsPreachingClass: user.attendsPreachingClass ?? false,
  };
}

/**
 * Saves what an account says about itself. A field left out is left alone,
 * and null clears a text. Nothing else is written: not the language, not the
 * translation, and nothing about preaching.
 */
export async function saveProfile(
  db: Pick<Database, "update">,
  userId: string,
  { churchName, ministryRole, attendsPreachingClass }: ProfileUpdate,
) {
  const updated = await db
    .update(users)
    // A field that is undefined is left out of the statement.
    .set({ churchName, ministryRole, attendsPreachingClass })
    .where(eq(users.id, userId))
    .returning({ id: users.id });
  return updated.length > 0;
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
