/**
 * The languages the interface is written in. Plain values with no server
 * code, so the schema, the server, and the browser read one list. English is
 * the first and the fallback: a string with no Spanish yet is shown in English.
 */
export const locales = ["en", "es"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

/** Each language named in itself, which is how a language picker should name it. */
export const localeNames: Record<Locale, string> = { en: "English", es: "Español" };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

/**
 * The cookie that carries the interface language to the pages shown before
 * signing in, where there is no account to read it from. It is written when
 * the preference is saved, holds a language code and nothing else, and grants
 * nothing.
 */
export const localeCookie = "st_locale";
