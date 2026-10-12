"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { setGuestLocale } from "@/features/preferences/actions";
import { localeNames, locales, type Locale } from "@/i18n/locales";

/**
 * The language of the pages shown before signing in, chosen by whoever is
 * looking at them: there is no account yet to have saved one. It sets the
 * language cookie and nothing else. Each language is named in itself.
 */
export function GuestLanguage({ current, label }: { current: Locale; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div
      role="group"
      aria-label={label}
      aria-busy={pending}
      className="mt-6 flex justify-center gap-1 text-[0.8125rem]"
    >
      {locales.map((locale) => (
        <button
          key={locale}
          type="button"
          lang={locale}
          aria-pressed={locale === current}
          disabled={pending}
          onClick={() =>
            locale !== current &&
            startTransition(async () => {
              await setGuestLocale(locale);
              router.refresh();
            })
          }
          className="rounded-md px-2.5 py-1.5 font-medium text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground active:bg-foreground/10 aria-pressed:cursor-default aria-pressed:text-foreground aria-pressed:hover:bg-transparent pointer-coarse:min-h-11"
        >
          {localeNames[locale]}
        </button>
      ))}
    </div>
  );
}
