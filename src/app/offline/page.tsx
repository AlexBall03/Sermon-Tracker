import type { Metadata } from "next";

import { OfflineShell } from "@/features/offline/components/offline-shell";
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
 * its own bar. Everything it offers (the Bible kept on this device, captures
 * kept here) comes from the device, in the browser (features/offline).
 */
export default function Offline() {
  return <OfflineShell />;
}
