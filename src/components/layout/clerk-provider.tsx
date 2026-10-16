"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { ClerkProvider } from "@clerk/nextjs";

import { clerkAppearance } from "@/lib/clerk-appearance";
import { routes } from "@/lib/site";

type Localization = React.ComponentProps<typeof ClerkProvider>["localization"];

/** Whether the document says it is in Spanish, and when that changes. */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
  return () => observer.disconnect();
}
const inSpanish = () => document.documentElement.lang === "es";

/**
 * Clerk for the whole application, with its own forms (sign-in, and creating
 * an account, openly or from an invitation) in the page's language.
 *
 * Clerk takes its language here and nowhere else: a second provider around
 * one form is ignored. The root layout is static and cannot know the
 * language, so this follows what each shell says the document is in
 * (`I18nProvider` sets `<html lang>` from the language in force, with the
 * administrator's Spanish switch already applied) and hands Clerk its Spanish
 * when that is Spanish. The translations are fetched only then; English is
 * what Clerk has built in.
 */
export function AppClerkProvider({ children }: { children: React.ReactNode }) {
  const spanish = useSyncExternalStore(subscribe, inSpanish, () => false);
  const [es, setEs] = useState<Localization>();

  useEffect(() => {
    if (!spanish || es) return;
    let current = true;
    void import("@clerk/localizations").then(({ esMX }) => {
      if (current) setEs(esMX);
    });
    return () => {
      current = false;
    };
  }, [spanish, es]);

  return (
    <ClerkProvider
      appearance={clerkAppearance}
      localization={spanish ? es : undefined}
      signInUrl={routes.signIn}
      signUpUrl={routes.signUp}
      signInFallbackRedirectUrl={routes.dashboard}
      signUpFallbackRedirectUrl={routes.dashboard}
      afterSignOutUrl={routes.home}
    >
      {children}
    </ClerkProvider>
  );
}
