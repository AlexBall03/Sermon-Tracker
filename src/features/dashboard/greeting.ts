import { dictionary } from "@/i18n";
import { defaultLocale, type Locale } from "@/i18n/locales";

/** The dashboard's greeting, by first name where one is known. */
export function welcomeTitle(firstName?: string | null, locale: Locale = defaultLocale) {
  const t = dictionary(locale, "dashboard");
  const name = firstName?.trim();
  return name ? t.welcomeNamed(name) : t.welcome;
}
