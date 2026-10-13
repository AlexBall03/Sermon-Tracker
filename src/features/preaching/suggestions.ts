import { dictionary } from "@/i18n";
import { defaultLocale, type Locale } from "@/i18n/locales";
import { suggestedContexts, type SuggestedContext } from "./model";

/**
 * The contexts offered to choose from, named in one language. They are
 * suggestions and not rows: an account has a context only once it picks one
 * here (`createContext` with this name) or writes its own. There is no server
 * code here, so a form in the browser reads the same list.
 *
 * Preaching Class is suggested only to an account that said it attends one
 * (`attendsPreachingClass`, from its preferences). That is all the preference
 * does here: a context of that name an account already has is its own and is
 * offered like any other, and anyone may still write the name themselves.
 */
export function suggestedContextOptions(
  locale: Locale = defaultLocale,
  { attendsPreachingClass = false }: { attendsPreachingClass?: boolean } = {},
): { key: SuggestedContext; name: string }[] {
  const names = dictionary(locale, "preaching").suggestedContexts;
  return suggestedContexts
    .filter((key) => attendsPreachingClass || key !== "preaching_class")
    .map((key) => ({ key, name: names[key] }));
}
