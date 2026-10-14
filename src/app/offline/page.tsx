import type { Metadata } from "next";

import { Logo } from "@/components/brand/logo";
import { OfflineMessage } from "@/features/pwa/components/offline-message";
import { dictionary } from "@/i18n";

export const metadata: Metadata = {
  // The page renders its words in the browser; the tab title follows once it knows the language.
  title: dictionary("en", "pwa").offline.pageTitle,
  robots: { index: false, follow: false },
};

/**
 * Shown by the service worker in place of a page the network could not reach
 * (features/pwa/service-worker.ts). It is prerendered, reads nothing of a
 * request, and is fetched by the worker without credentials, so what is kept
 * is the same for everyone. Outside every shell, like the not-found page, with
 * its own bar. The logo is not a link: the installed application has no
 * public page to go to, and the way on is trying again.
 */
export default function Offline() {
  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50 glass-settle border-b glass">
        <div className="container-page flex h-bar items-center">
          <Logo />
        </div>
      </header>
      <main id="main" className="flex-1 pt-bar">
        <OfflineMessage />
      </main>
    </>
  );
}
