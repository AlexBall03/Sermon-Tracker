import { Suspense } from "react";

import { BackToTop } from "@/components/layout/back-to-top";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { getPreferences } from "@/features/preferences/current";
import { LeavePublicPage } from "@/features/pwa/components/leave-public-page";
import { I18nProvider } from "@/i18n/client";

/**
 * Public, indexable pages for visitors who are not signed in.
 *
 * There is no account to read a language from, so the shell follows the
 * language cookie, or the browser's own language where there is none
 * (features/preferences). That is known only per request, so the shell waits
 * behind a boundary and the page beneath it is rendered with it.
 *
 * The installed application never shows these pages: it is sent to sign-in
 * (`LeavePublicPage`, features/pwa).
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Ahead of the boundary, so it runs before anything is painted. */}
      <LeavePublicPage />
      <Suspense fallback={null}>
        <Shell>{children}</Shell>
      </Suspense>
    </>
  );
}

async function Shell({ children }: { children: React.ReactNode }) {
  const { locale, spanishEnabled } = await getPreferences();
  return (
    <I18nProvider locale={locale}>
      <SiteHeader locale={locale} />
      <main id="main" className="flex-1 pt-bar">
        {children}
      </main>
      <SiteFooter locale={locale} languageChoice={spanishEnabled} />
      <BackToTop />
    </I18nProvider>
  );
}
