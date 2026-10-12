import { Suspense } from "react";
import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { getPreferences } from "@/features/preferences/current";
import { dictionary } from "@/i18n";
import { I18nProvider } from "@/i18n/client";
import { routes } from "@/lib/site";
import { GuestLanguage } from "./guest-language";

/**
 * Minimal centred shell for sign-in, invitation acceptance, and access
 * notices: the logo above one card (an AuthNotice or Clerk's form). The
 * wrapper gives whichever card it holds the lit edge and a faint glow.
 *
 * These pages have no account to read a language from, so they follow the
 * language cookie (features/preferences), and offer the choice beneath the
 * card. Clerk's own form is Clerk's, and is in English.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center overflow-x-clip px-5 py-12 sm:py-16">
      {/* 25rem is the width of Clerk's card. */}
      <div className="w-full max-w-[25rem]">
        <div className="mb-8 flex justify-center">
          <Link
            href={routes.home}
            aria-label="Sermon Tracker home"
            className="flex items-center rounded-md transition-opacity duration-150 hover:opacity-80"
          >
            <Logo />
          </Link>
        </div>
        <main id="main" className="hero-glow lit-edge rounded-xl">
          {children}
        </main>
        {/* Decided per request, so it waits behind its own boundary and holds nothing else up. */}
        <Suspense fallback={null}>
          <Language />
        </Suspense>
      </div>
    </div>
  );
}

/** The language choice, where there is one to make: not while Spanish is switched off. */
async function Language() {
  const { locale, spanishEnabled } = await getPreferences();
  if (!spanishEnabled) return null;
  return (
    <I18nProvider locale={locale}>
      <GuestLanguage current={locale} label={dictionary(locale, "auth").language} />
    </I18nProvider>
  );
}
