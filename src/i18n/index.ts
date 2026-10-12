import * as en from "./dictionaries/en";
import * as es from "./dictionaries/es";
import { defaultLocale, type Locale } from "./locales";

/**
 * Every string the interface shows, by feature, in each language.
 *
 * English is the source: its dictionaries define what exists, and their types
 * are what the others are checked against. A Spanish dictionary may leave
 * anything out, and whatever it leaves out is shown in English, so a feature
 * can be written first and translated after without anything breaking.
 *
 * An entry is a string, or a small function where the words depend on a
 * number or a name ("3 matching ideas", "Saved John 3:16."). There is no
 * message syntax to learn and nothing is parsed at run time.
 *
 * Read them with `getT` on the server (i18n/server.ts) and `useT` in the
 * browser (i18n/client.tsx). There is no server code in this file.
 */
export type Dictionaries = typeof en;
export type Feature = keyof Dictionaries;

/** A dictionary with any of its entries left out, at any depth. */
export type Untranslated<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly unknown[]
    ? T
    : T extends object
      ? { [K in keyof T]?: Untranslated<T[K]> }
      : T;

function isBranch(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The translation laid over the English, so every entry is there in one or the other. */
function over<T>(base: T, translation: unknown): T {
  if (!isBranch(base) || !isBranch(translation)) return (translation ?? base) as T;
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(translation)) {
    // Only what English has: a stray key in a translation is never shown.
    if (key in base && value !== undefined) merged[key] = over(base[key], value);
  }
  return merged as T;
}

const all: Record<Locale, Dictionaries> = { en, es: over(en as Dictionaries, es) };

/** One feature's strings in a language. An unknown language reads as English. */
export function dictionary<F extends Feature>(locale: Locale, feature: F): Dictionaries[F] {
  return (all[locale] ?? all[defaultLocale])[feature];
}

/** A number as the language writes it: 1,234 in English, 1.234 in Spanish. */
export function formatNumber(locale: Locale, value: number): string {
  return value.toLocaleString(locale === "es" ? "es" : "en");
}
