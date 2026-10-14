"use client";

import { useEffect, useSyncExternalStore } from "react";
import { WifiOff } from "lucide-react";

import { StatusPage } from "@/components/layout/status-page";
import { Button } from "@/components/ui/button";
import { dictionary } from "@/i18n";
import { lastLocaleKey } from "@/i18n/client";
import { isLocale, preferredLocale, type Locale } from "@/i18n/locales";

/**
 * The language to show the offline page in: the last one the interface was
 * shown in on this device, or else the browser's.
 */
export function offlineLocale(): Locale {
  try {
    const stored = localStorage.getItem(lastLocaleKey);
    if (isLocale(stored)) return stored;
  } catch {
    // Storage refused: the browser's language.
  }
  return preferredLocale(navigator.languages?.join(",") || navigator.language);
}

const subscribe = () => () => {};

/**
 * What the offline page says. It is kept by the service worker and shown
 * for a page that could not be reached, so the server cannot choose its
 * language: it is chosen here, and nothing is drawn until it has been, so a
 * Spanish reader never sees English first. It claims nothing about the
 * account, and its one way on is to try again; it also tries again by itself
 * as soon as the browser says it is back online.
 */
export function OfflineMessage() {
  const locale = useSyncExternalStore<Locale | null>(subscribe, offlineLocale, () => null);

  useEffect(() => {
    if (!locale) return;
    document.documentElement.lang = locale;
    document.title = `${dictionary(locale, "pwa").offline.pageTitle} · Sermon Tracker`;
    const retry = () => window.location.reload();
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [locale]);

  if (!locale) return null;
  const t = dictionary(locale, "pwa").offline;
  return (
    <StatusPage icon={WifiOff} title={t.title} body={t.body} note={t.waiting}>
      <Button onClick={() => window.location.reload()}>{t.retry}</Button>
    </StatusPage>
  );
}
