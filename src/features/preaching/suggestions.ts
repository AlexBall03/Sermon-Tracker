import { dictionary } from "@/i18n";
import { defaultLocale, type Locale } from "@/i18n/locales";
import { suggestedContexts, type SuggestedContext } from "./model";

/**
 * The contexts offered to choose from, named in one language. They are
 * suggestions and not rows: an account has a context only once it picks one
 * here (`createContext` with this name) or writes its own. There is no server
 * code here, so a form in the browser reads the same list.
 */
export function suggestedContextOptions(
  locale: Locale = defaultLocale,
): { key: SuggestedContext; name: string }[] {
  const names = dictionary(locale, "preaching").suggestedContexts;
  return suggestedContexts.map((key) => ({ key, name: names[key] }));
}
