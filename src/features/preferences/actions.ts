"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";

import { getDb } from "@/db";
import { describeDatabaseError } from "@/db/types";
import { authorize } from "@/features/auth/access";
import { translationIds, translations } from "@/features/scripture/translations";
import { dictionary } from "@/i18n";
import { localeCookie, locales, type Locale } from "@/i18n/locales";
import type { ActionResult } from "@/lib/action-result";
import { saveBibleTranslation, saveLocale, storedPreferences } from "./preferences";
import { resolvePreferences } from "./resolve";
import { getAppSettings } from "./settings";

const localeSchema = z.enum(locales);
/** A translation, or null to follow the interface language again. */
const translationSchema = z.enum(translationIds).nullable();

/** A year. The cookie only says which language to show before signing in. */
const cookieAge = 60 * 60 * 24 * 365;

async function rememberLocale(locale: Locale) {
  (await cookies()).set(localeCookie, locale, {
    path: "/",
    maxAge: cookieAge,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
}

/*
 * As with every action: each authorises itself when it runs and takes the
 * account from the session. Choosing another language returns the Bible
 * translation to following it; choosing a translation never writes the
 * language. Spanish is refused here, on the server, while an administrator has
 * it switched off; what was saved before is left as it was.
 */

/**
 * Saves the account's interface language. A language that differs from the
 * one saved takes the Bible translation with it; the same one changes nothing.
 */
export async function setLocale(locale: unknown): Promise<ActionResult> {
  const actor = await authorize("active");
  if (!actor.ok) return actor;
  const { spanishEnabled } = await getAppSettings();
  const current = resolvePreferences(storedPreferences(actor.user), spanishEnabled);
  const t = dictionary(current.locale, "settings").language;

  const parsed = localeSchema.safeParse(locale);
  if (!parsed.success) return { ok: false, message: t.invalid };
  if (parsed.data === "es" && !spanishEnabled) return { ok: false, message: t.spanishOff };

  try {
    if (
      parsed.data !== actor.user.locale &&
      !(await saveLocale(getDb(), actor.user.id, parsed.data))
    ) {
      return { ok: false, message: t.notSaved };
    }
  } catch (error) {
    console.error("Language preference save failed:", describeDatabaseError(error));
    return { ok: false, message: t.notSaved };
  }
  await rememberLocale(parsed.data);
  // Every page is written in it.
  revalidatePath("/", "layout");
  // Said in the language just chosen.
  return { ok: true, message: dictionary(parsed.data, "settings").language.saved };
}

/**
 * Saves the account's Bible translation, or with null goes back to following
 * the interface language. The interface language is not touched.
 */
export async function setBibleTranslation(translation: unknown): Promise<ActionResult> {
  const actor = await authorize("active");
  if (!actor.ok) return actor;
  const { spanishEnabled } = await getAppSettings();
  const current = resolvePreferences(storedPreferences(actor.user), spanishEnabled);
  const t = dictionary(current.locale, "settings").language;

  const parsed = translationSchema.safeParse(translation);
  if (!parsed.success) return { ok: false, message: t.invalid };
  if (parsed.data && !current.translations.includes(parsed.data)) {
    return { ok: false, message: t.translationOff };
  }

  try {
    if (!(await saveBibleTranslation(getDb(), actor.user.id, parsed.data))) {
      return { ok: false, message: t.notSaved };
    }
  } catch (error) {
    console.error("Bible translation preference save failed:", describeDatabaseError(error));
    return { ok: false, message: t.notSaved };
  }
  revalidatePath("/", "layout");
  return {
    ok: true,
    message: parsed.data ? t.translationSaved(translations[parsed.data].short) : t.followSaved,
  };
}

/**
 * Chooses the language of the pages shown before signing in. There is no
 * account to save it on, so it is the language cookie and nothing else; it
 * grants nothing, and with Spanish switched off the pages are English
 * whatever it says.
 */
export async function setGuestLocale(locale: unknown): Promise<void> {
  const parsed = localeSchema.safeParse(locale);
  if (!parsed.success) return;
  await rememberLocale(parsed.data);
  revalidatePath("/", "layout");
}
