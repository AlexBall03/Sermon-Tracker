"use client";

import { Suspense, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowLeft, BookOpen, Lightbulb, List, PenLine, RefreshCw, WifiOff } from "lucide-react";

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
import { listLocalIdeas } from "../ideas/store";
import { listLocalOutlines } from "../outlines/store";
import type { OfflineSettings } from "../model";
import { readOfflineSettings } from "../settings";
import { OfflineAccountProvider } from "./offline-account";
import { OfflineIdea, OfflineLibrary, type Go } from "./offline-ideas";
import { OfflineOutline, OfflineOutlines } from "./offline-outlines";
import { PendingChanges } from "./pending-changes";

/** What this device holds for the offline page, read once it is in the browser. */
type Local = {
  account: string | null;
  /** Translations kept whole here that were last on offer to this device. */
  readable: TranslationId[];
  settings: OfflineSettings;
  /** How many of the account's ideas are kept here. */
  ideas: number;
  /** How many of the account's outlines are kept here. */
  outlines: number;
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
  const [ideas, outlines] = account
    ? await Promise.all([
        listLocalIdeas(account).then(
          (list) => list.length,
          () => 0,
        ),
        listLocalOutlines(account).then(
          (list) => list.length,
          () => 0,
        ),
      ])
    : [0, 0];
  return {
    account,
    readable: kept.filter((id) => allowed.includes(id)),
    settings,
    ideas,
    outlines,
  };
}

const subscribeNothing = () => () => {};
const onReaderPath = () => window.location.pathname.startsWith(routes.bible);
const ideaPath = /^\/library\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const outlinePath = /^\/outlines\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** The addresses this page draws by itself, from the device. */
type Place =
  | { view: "hub" }
  | { view: "bible" }
  | { view: "library"; search: string }
  | { view: "idea"; id: string; search: string }
  | { view: "outlines"; search: string }
  | { view: "outline"; id: string };

function placeOf(): Place {
  const { pathname, search } = window.location;
  if (pathname.startsWith(routes.bible)) return { view: "bible" };
  if (pathname === routes.sermonIdeas) return { view: "library", search };
  const idea = ideaPath.exec(pathname);
  if (idea) return { view: "idea", id: idea[1].toLowerCase(), search };
  if (pathname === routes.outlines) return { view: "outlines", search };
  const outline = outlinePath.exec(pathname);
  if (outline) return { view: "outline", id: outline[1].toLowerCase() };
  return { view: "hub" };
}

/** True for an address this page draws itself: followed here rather than asked of the server. */
const drawnHere = (url: URL) =>
  url.origin === window.location.origin &&
  (url.pathname === routes.sermonIdeas ||
    ideaPath.test(url.pathname) ||
    url.pathname === routes.outlines ||
    outlinePath.test(url.pathname));

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
  const [place, setPlace] = useState<Place>({ view: "hub" });
  const [online, setOnline] = useState(false);
  const main = useRef<HTMLElement>(null);

  /** Moves between this page's own addresses, with no request; null state, as Next needs. */
  const go = useCallback<Go>((href, options) => {
    if (options?.replace) window.history.replaceState(null, "", href);
    else window.history.pushState(null, "", href);
    setPlace(placeOf());
    setReading(onReaderPath());
    if (!options?.replace) window.scrollTo({ top: 0 });
  }, []);

  // A link to an address drawn here (a result, the pager, a way back) is followed here.
  // One something else already took (the leave guard asking first) is left alone.
  useEffect(() => {
    const element = main.current;
    if (!element) return;
    const follow = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank") return;
      const url = new URL(anchor.href);
      if (!drawnHere(url)) return;
      event.preventDefault();
      event.stopPropagation();
      go(url.pathname + url.search);
    };
    element.addEventListener("click", follow, true);
    return () => element.removeEventListener("click", follow, true);
  }, [go, local]);

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
      setPlace(placeOf());
    });
    const back = () => {
      setReading(onReaderPath());
      setPlace(placeOf());
    };
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
  // Anywhere else something may be half written: the bar offers to try again instead.
  useEffect(() => {
    if (online && !reading && place.view === "hub" && !document.querySelector('[role="dialog"]')) {
      window.location.reload();
    }
  }, [online, reading, place.view]);

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
    go(routes.dashboard);
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
                <Bar
                  reading={reading || place.view !== "hub"}
                  online={online}
                  onBack={leaveBible}
                />
                <main id="main" ref={main} className="flex-1 pt-bar">
                  {reading && translation ? (
                    <Suspense>
                      <BibleReader local />
                    </Suspense>
                  ) : place.view === "library" ? (
                    <OfflineLibrary account={local.account} search={place.search} go={go} />
                  ) : place.view === "idea" ? (
                    <OfflineIdea
                      account={local.account}
                      id={place.id}
                      search={place.search}
                      go={go}
                    />
                  ) : place.view === "outlines" ? (
                    <OfflineOutlines account={local.account} search={place.search} go={go} />
                  ) : place.view === "outline" ? (
                    <OfflineOutline account={local.account} id={place.id} />
                  ) : (
                    <Hub
                      readable={local.readable}
                      canCapture={canCapture}
                      signedOut={!local.account}
                      ideas={local.settings.ideasOffline ? local.ideas : 0}
                      outlines={local.outlines}
                      onRead={openBible}
                      onIdeas={() => go(routes.sermonIdeas)}
                      onOutlines={() => go(routes.outlines)}
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
  ideas,
  outlines,
  onRead,
  onIdeas,
  onOutlines,
}: {
  readable: TranslationId[];
  canCapture: boolean;
  signedOut: boolean;
  /** How many ideas are kept here for the account; none hides the card. */
  ideas: number;
  /** How many outlines are kept here for the account; none hides the card. */
  outlines: number;
  onRead: () => void;
  onIdeas: () => void;
  onOutlines: () => void;
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

        {ideas > 0 && (
          <section className="lit-edge rounded-xl border bg-surface p-5 shadow-card sm:col-span-2">
            <div className="flex items-center gap-2.5">
              <Lightbulb className="size-5 text-primary" aria-hidden />
              <h2 className="text-lg font-semibold tracking-[-0.015em]">{t.ideasTitle}</h2>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {t.ideasBody(ideas)}
            </p>
            <Button className="mt-4" onClick={onIdeas}>
              {t.openIdeas}
            </Button>
          </section>
        )}

        {outlines > 0 && (
          <section className="lit-edge rounded-xl border bg-surface p-5 shadow-card sm:col-span-2">
            <div className="flex items-center gap-2.5">
              <List className="size-5 text-primary" aria-hidden />
              <h2 className="text-lg font-semibold tracking-[-0.015em]">{t.outlinesTitle}</h2>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {t.outlinesBody(outlines)}
            </p>
            <Button className="mt-4" onClick={onOutlines}>
              {t.openOutlines}
            </Button>
          </section>
        )}
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
      <PendingChanges />
    </section>
  );
}
