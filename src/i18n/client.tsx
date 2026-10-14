"use client";

import { createContext, useContext, useEffect } from "react";

import { dictionary, type Dictionaries, type Feature } from "./index";
import { defaultLocale, type Locale } from "./locales";

const LocaleContext = createContext<Locale>(defaultLocale);

/** Where the device remembers the last language the interface was shown in. */
export const lastLocaleKey = "st-locale";

/**
 * Carries the interface language to every Client Component beneath it. Only
 * the language's code crosses from the server: each component reads its own
 * strings with `useT`, so no dictionary is passed as a prop. Without a
 * provider the language is English.
 */
export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  // The document says what language it is in, for screen readers and hyphenation. The
  // root layout is static and cannot know, so it is said here, once the shell knows.
  useEffect(() => {
    document.documentElement.lang = locale;
    // Remembered on the device for the offline page, which is kept by the service
    // worker and cannot ask the server (features/pwa). It is the language in force,
    // so the administrator's switch is already applied.
    try {
      localStorage.setItem(lastLocaleKey, locale);
    } catch {
      // Storage refused (a private window): the offline page follows the browser.
    }
  }, [locale]);
  return <LocaleContext value={locale}>{children}</LocaleContext>;
}

/** The interface language in force. */
export function useLocale(): Locale {
  return useContext(LocaleContext);
}

/** One feature's strings in the interface language. */
export function useT<F extends Feature>(feature: F): Dictionaries[F] {
  return dictionary(useContext(LocaleContext), feature);
}
