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
 * The language a browser asks for, from its `Accept-Language` header: the
 * first it lists, in its own order of preference, that the interface is
 * written in ("es-MX" is Spanish). English when it lists none of them.
 */
export function preferredLocale(acceptLanguage: string | null | undefined): Locale {
  const asked = (acceptLanguage ?? "")
    .split(",")
    .map((entry) => {
      const [tag, ...parameters] = entry.trim().split(";");
      const quality = parameters
        .map((parameter) => parameter.trim())
        .find((p) => p.startsWith("q="));
      const weight = quality ? Number(quality.slice(2)) : 1;
      return { language: tag.trim().toLowerCase().split("-")[0], weight };
    })
    .filter((entry) => entry.weight > 0)
    // Stable, so languages of equal weight keep the order they were listed in.
    .sort((a, b) => b.weight - a.weight);
  return asked.map((entry) => entry.language).find(isLocale) ?? defaultLocale;
}

/**
 * The cookie that carries the interface language to the pages shown before
 * signing in, where there is no account to read it from. It is written when
 * the preference is saved, holds a language code and nothing else, and grants
 * nothing.
 */
export const localeCookie = "st_locale";
