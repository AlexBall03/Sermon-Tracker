"use client";

import { useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";

import { StatusPage } from "@/components/layout/status-page";
import { Button, buttonVariants } from "@/components/ui/button";
import { dictionary } from "@/i18n";
import { defaultLocale, isLocale } from "@/i18n/locales";
import { routes } from "@/lib/site";
import { fontVariables } from "./fonts";
import "./globals.css";

/** What the page that failed looked like, read before this one replaces its document. */
function before() {
  if (typeof document === "undefined") return { locale: defaultLocale, dark: false };
  const root = document.documentElement;
  return {
    locale: isLocale(root.lang) ? root.lang : defaultLocale,
    dark: root.classList.contains("dark"),
  };
}

/**
 * Shown when the root layout itself fails, in place of the whole document, so
 * nothing above it exists: no theme, no language, no router to trust. It keeps
 * the language and the theme the failed page had, which were already the ones
 * in force, and where there was no page it follows the stored theme or the
 * device's and speaks English.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const [{ locale, dark }] = useState(before);
  const t = dictionary(locale, "navigation").error;

  useEffect(() => {
    let wantsDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    try {
      // next-themes' own key; "system" or nothing means the device decides.
      const stored = window.localStorage.getItem("theme");
      if (stored === "dark" || stored === "light") wantsDark = stored === "dark";
    } catch {
      // Storage can be blocked; the device's preference stands.
    }
    document.documentElement.classList.toggle("dark", wantsDark);
  }, []);

  return (
    <html
      lang={locale}
      className={`${fontVariables} h-full antialiased ${dark ? "dark" : ""}`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <title>{t.title}</title>
        <main id="main" className="flex-1">
          <StatusPage
            role="alert"
            icon={TriangleAlert}
            title={t.title}
            body={t.detail}
            note={
              error.digest && (
                <>
                  {t.reference}: <span className="font-mono select-all">{error.digest}</span>
                </>
              )
            }
          >
            <Button onClick={() => retry()}>{t.retry}</Button>
            {/* A full page load on purpose: the router is part of what may have failed. */}
            <a href={routes.home} className={buttonVariants({ variant: "outline" })}>
              {t.home}
            </a>
          </StatusPage>
        </main>
      </body>
    </html>
  );
}
