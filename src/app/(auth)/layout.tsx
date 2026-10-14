import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { GuestLanguage } from "@/components/layout/guest-language";
import { ForgetOfflineAccount } from "@/features/offline/components/offline-account";
import { getPreferences } from "@/features/preferences/current";
import { dictionary } from "@/i18n";
import { I18nProvider } from "@/i18n/client";
import { routes } from "@/lib/site";

/**
 * Minimal centred shell for sign-in, invitation acceptance, and access
 * notices: the logo above one card (an AuthNotice or Clerk's form). The
 * wrapper gives whichever card it holds the lit edge and a faint glow.
 *
 * These pages have no account to read a language from, so they follow the
 * language cookie (features/preferences), and offer the choice beneath the
 * card. Clerk's own form follows it too (components/layout/clerk-provider.tsx).
 *
 * The logo leads home, and so does a link in words under the card: a logo is
 * not something everyone knows to press. The installed application shows
 * neither (`standalone:`): it is for signed-in use only and has no public page.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center overflow-x-clip px-5 py-12 sm:py-16">
      {/* No one is signed in here: the offline page stops offering anyone's work (features/offline). */}
      <ForgetOfflineAccount />
      {/* 25rem is the width of Clerk's card. */}
      <div className="w-full max-w-[25rem]">
        <div className="mb-8 flex justify-center">
          <Link
            href={routes.home}
            aria-label="Sermon Tracker home"
            className="flex items-center rounded-md transition-opacity duration-150 hover:opacity-80 standalone:hidden"
          >
            <Logo />
          </Link>
          {/* The installed application has no public page to lead to: the logo is only the logo. */}
          <div className="hidden items-center standalone:flex">
            <Logo />
          </div>
        </div>
        <main id="main" className="hero-glow lit-edge rounded-xl">
          {children}
        </main>
        {/*
         * Decided per request, so it waits behind its own boundary and holds nothing else up.
         * Its place is kept while it does: the column is centred, and a block arriving
         * under the card would otherwise move the logo and the card up the screen.
         */}
        <Suspense fallback={<BeneathSpace />}>
          <Beneath />
        </Suspense>
      </div>
    </div>
  );
}

/** The room `Beneath` takes, row for row, held empty until it arrives. */
function BeneathSpace() {
  return (
    <div aria-hidden className="mt-6 flex flex-col items-center gap-2">
      <span className="min-h-8 pointer-coarse:min-h-11 standalone:hidden" />
      <span className="min-h-[1.96875rem] pointer-coarse:min-h-11" />
    </div>
  );
}

/**
 * Under the card: the way back to the home page, and the language choice
 * where there is one to make (not while Spanish is switched off).
 */
async function Beneath() {
  const { locale, spanishEnabled } = await getPreferences();
  const t = dictionary(locale, "auth");
  return (
    <I18nProvider locale={locale}>
      <div className="mt-6 flex flex-col items-center gap-2">
        <Link
          href={routes.home}
          className="group/back inline-flex min-h-8 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground active:text-foreground pointer-coarse:min-h-11 standalone:hidden"
        >
          <ArrowLeft
            className="size-4 transition-transform duration-150 group-hover/back:-translate-x-0.5"
            aria-hidden
          />
          {t.backHome}
        </Link>
        {spanishEnabled && (
          <GuestLanguage current={locale} label={t.language} className="justify-center" />
        )}
      </div>
    </I18nProvider>
  );
}
