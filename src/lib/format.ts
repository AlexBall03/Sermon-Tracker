import { defaultLocale, type Locale } from "@/i18n/locales";

// A fixed zone keeps server and browser output identical.
const dateFormats: Record<Locale, Intl.DateTimeFormat> = {
  en: new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }),
  es: new Intl.DateTimeFormat("es", { dateStyle: "medium", timeZone: "UTC" }),
};

/** A date as the interface language writes it: "Oct 12, 2026", "12 oct 2026". */
export function formatDate(date: Date, locale: Locale = defaultLocale) {
  return (dateFormats[locale] ?? dateFormats[defaultLocale]).format(date);
}
