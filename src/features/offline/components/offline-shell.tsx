"use client";

import { Suspense, useEffect, useState, useSyncExternalStore } from "react";
import { ArrowLeft, BookOpen, PenLine, RefreshCw, WifiOff } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ToastProvider } from "@/components/ui/toast";
import { CaptureButton, QuickCaptureProvider } from "@/features/ideas/components/quick-capture";
import { ReadingProvider } from "@/features/preferences/client";
import { offlineLocale } from "@/features/pwa/components/offline-message";
import { BibleReader } from "@/features/scripture/components/bible-reader";
import { ScriptureProvider } from "@/features/scripture/components/scripture-provider";
import { firstLocation, readerHref, readSavedLocation } from "@/features/scripture/reader-location";
import {
  defaultTranslationFor,
  fallbackTranslation,
  translations as allTranslations,
  type TranslationId,
} from "@/features/scripture/translations";
import { dictionary } from "@/i18n";
import { I18nProvider, useT } from "@/i18n/client";
import type { Locale } from "@/i18n/locales";
import { routes } from "@/lib/site";
import { getActiveAccount, getPermittedTranslations } from "../account";
import { localTranslations } from "../bible/local";
import type { OfflineSettings } from "../model";
import { readOfflineSettings } from "../settings";
import { OfflineAccountProvider } from "./offline-account";
import { PendingCaptures } from "./pending-captures";

/** What this device holds for the offline page, read once it is in the browser. */
type Local = {
  account: string | null;
  /** Translations kept whole here that were last on offer to this device. */
  readable: TranslationId[];
  settings: OfflineSettings;
};

async function readLocal(): Promise<Local> {
  const [account, permitted, kept, settings] = await Promise.all([
    getActiveAccount().catch(() => null),
    getPermittedTranslations().catch(() => []),
    localTranslations(),
    readOfflineSettings(),
  ]);
  // Never told what was on offer: only the text that can never be switched off.
  const allowed = permitted.length > 0 ? permitted : [fallbackTranslation];
  return { account, readable: kept.filter((id) => allowed.includes(id)), settings };
}

const subscribeNothing = () => () => {};
const onReaderPath = () => window.location.pathname.startsWith(routes.bible);

/**
 * The offline page as the service worker shows it for any page the network
 * could not reach (features/pwa/service-worker.ts). It is prerendered, the
 * same for everyone, and reads nothing from the server: what it offers comes
 * from this device alone.
 *
 * - A translation kept whole on the device is read in the real Bible reader,
 *   in its local mode: no marks and nothing of the account. Arriving at a
 *   Bible address opens the reader at once, so the installed app reopened
 *   offline on the Bible is still the Bible.
 * - Where the device knows who was signed in (the signed-in shell told it;
 *   signing out made it forget), Quick Capture keeps thoughts here, under
 *   that account, and lists what is waiting. Nothing claims to be saved to
 *   the account, and nothing else of the account is shown.
 *
 * The address stays the one that was asked for, so trying again, or the
 * connection returning, opens the real page there.
 */
export function OfflineShell() {
  const locale = useSyncExternalStore<Locale | null>(subscribeNothing, offlineLocale, () => null);
  const [local, setLocal] = useState<Local | null>(null);
  const [reading, setReading] = useState(false);
  const [online, setOnline] = useState(false);

  useEffect(() => {
    void readLocal().then((value) => {
      setLocal(value);
      const reader = onReaderPath() && value.readable.length > 0;
      // A Bible address with no place in it is given the last one here, in the address
      // itself, so the reader never asks the router (and so the server) for one.
      if (reader && !window.location.search) {
        const place = readSavedLocation() ?? firstLocation;
        window.history.replaceState(null, "", readerHref(place));
      }
      setReading(reader);
    });
    const back = () => setReading(onReaderPath());
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);

  useEffect(() => {
    if (!locale) return;
    document.documentElement.lang = locale;
    document.title = `${dictionary(locale, "pwa").offline.pageTitle} · Sermon Tracker`;
    // The browser's word is only a hint: the page is asked for again, and the
    // service worker shows this page once more if the server is still out of reach.
    const returned = () => setOnline(true);
    window.addEventListener("online", returned);
    return () => window.removeEventListener("online", returned);
  }, [locale]);

  // Back on the first screen with nothing open, the page is simply tried again.
  useEffect(() => {
    if (online && !reading && !document.querySelector('[role="dialog"]')) window.location.reload();
  }, [online, reading]);

  if (!locale || !local) return null;
  const preferred = defaultTranslationFor(locale);
  const translation = local.readable.includes(preferred) ? preferred : local.readable[0];
  const canCapture = Boolean(local.account) && local.settings.captureOffline;

  function openBible() {
    const place = readSavedLocation() ?? firstLocation;
    window.history.pushState(null, "", readerHref({ ...place, translation }));
    setReading(true);
  }
  function leaveBible() {
    // A reload from here, once online, goes to the dashboard rather than this page.
    window.history.pushState(null, "", routes.dashboard);
    setReading(false);
  }

  return (
    <I18nProvider locale={locale}>
      <ReadingProvider
        translation={translation ?? fallbackTranslation}
        translations={local.readable.length ? local.readable : [fallbackTranslation]}
      >
        <OfflineAccountProvider account={local.account}>
          <ToastProvider>
            <ScriptureProvider>
              <QuickCaptureProvider>
                <Bar reading={reading} online={online} onBack={leaveBible} />
                <main id="main" className="flex-1 pt-bar">
                  {reading && translation ? (
                    <Suspense>
                      <BibleReader local />
                    </Suspense>
                  ) : (
                    <Hub
                      readable={local.readable}
                      canCapture={canCapture}
                      signedOut={!local.account}
                      onRead={openBible}
                    />
                  )}
                </main>
              </QuickCaptureProvider>
            </ScriptureProvider>
          </ToastProvider>
        </OfflineAccountProvider>
      </ReadingProvider>
    </I18nProvider>
  );
}

function Bar({
  reading,
  online,
  onBack,
}: {
  reading: boolean;
  online: boolean;
  onBack: () => void;
}) {
  const t = useT("offline").shell;
  const retry = useT("pwa").offline.retry;
  return (
    <header className="fixed inset-x-0 top-0 z-50 glass-settle border-b glass">
      <div className="container-page flex h-bar items-center gap-3">
        {reading && (
          <Button variant="ghost" size="sm" className="-ml-2 px-2" onClick={onBack}>
            <ArrowLeft aria-hidden />
            {t.back}
          </Button>
        )}
        {/* Not a link: there is nowhere to go without the server. */}
        <Logo />
        <span className="ml-auto flex items-center gap-2">
          {online && (
            <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
              <RefreshCw aria-hidden />
              {retry}
            </Button>
          )}
          <Badge tone="muted">{t.readerBadge}</Badge>
        </span>
      </div>
    </header>
  );
}

function Hub({
  readable,
  canCapture,
  signedOut,
  onRead,
}: {
  readable: TranslationId[];
  canCapture: boolean;
  signedOut: boolean;
  onRead: () => void;
}) {
  const t = useT("offline").shell;
  const message = useT("pwa").offline;
  const names = readable.map((id) => allTranslations[id].short).join(" · ");

  return (
    <div className="container-page max-w-3xl py-10 lg:py-14">
      <div className="flex items-start gap-4">
        <span
          aria-hidden
          className="grid size-11 shrink-0 place-items-center rounded-full border border-input bg-surface text-muted-foreground shadow-card"
        >
          <WifiOff className="size-5" />
        </span>
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-semibold tracking-[-0.02em]">{t.title}</h1>
          <p className="mt-2 leading-relaxed text-muted-foreground">{t.body}</p>
          <p className="mt-1 text-sm text-muted-foreground">{message.waiting}</p>
          <Button className="mt-4" variant="outline" onClick={() => window.location.reload()}>
            <RefreshCw aria-hidden />
            {message.retry}
          </Button>
        </div>
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <section className="lit-edge rounded-xl border bg-surface p-5 shadow-card">
          <div className="flex items-center gap-2.5">
            <BookOpen className="size-5 text-primary" aria-hidden />
            <h2 className="text-lg font-semibold tracking-[-0.015em]">{t.readTitle}</h2>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {readable.length ? t.readBody(names) : t.noBible}
          </p>
          {readable.length > 0 && (
            <Button className="mt-4" onClick={onRead}>
              {t.read}
            </Button>
          )}
        </section>

        <section className="lit-edge rounded-xl border bg-surface p-5 shadow-card">
          <div className="flex items-center gap-2.5">
            <PenLine className="size-5 text-primary" aria-hidden />
            <h2 className="text-lg font-semibold tracking-[-0.015em]">{t.captureTitle}</h2>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {canCapture ? t.captureBody : signedOut ? t.signedOut : t.captureBody}
          </p>
          {canCapture && <CaptureButton className="mt-4">{t.capture}</CaptureButton>}
        </section>
      </div>

      {!signedOut && <Waiting />}
    </div>
  );
}

function Waiting() {
  const t = useT("offline").pending;
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold tracking-[-0.015em]">{t.title}</h2>
      <p className="mt-1 mb-4 text-sm leading-relaxed text-muted-foreground">{t.description}</p>
      <PendingCaptures />
    </section>
  );
}
