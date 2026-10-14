"use client";

import { useSyncExternalStore } from "react";

import { hasUnsavedWork } from "@/lib/unsaved-work";
import { storeInstallNotice } from "./install-notice";
import { isStandalone } from "./standalone";

/*
 * The installed application's state in the browser, outside React so it can
 * be listened for from the first page on: the browser's install prompt fires
 * once, early, wherever the person happens to be, and is used later, from
 * Settings. Started once by `PwaRuntime` in the root layout; read with
 * `usePwa()`.
 *
 * The service worker is registered in production builds only: in development
 * it would keep files the developer is changing.
 */

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type PwaState = {
  /** This window is the installed application. */
  standalone: boolean;
  /** The browser offered its own install prompt, and it has not been used. */
  canPrompt: boolean;
  /** The application was installed from this window. */
  justInstalled: boolean;
  /** The last install prompt was declined. */
  declined: boolean;
  /** A version newer than this page is installed and waiting. */
  updateReady: boolean;
};

const initial: PwaState = {
  standalone: false,
  canPrompt: false,
  justInstalled: false,
  declined: false,
  updateReady: false,
};

let state = initial;
const listeners = new Set<() => void>();
let deferred: BeforeInstallPromptEvent | null = null;
let registration: ServiceWorkerRegistration | null = null;
let started = false;

function set(change: Partial<PwaState>) {
  state = { ...state, ...change };
  listeners.forEach((notify) => notify());
}

/** The version this page was built as; the worker is served with the same one (app/sw.js). */
const pageVersion = process.env.APP_VERSION ?? "development";

/** How long a waiting worker is given to say which version it is. */
export const versionReplyMs = 3000;

/**
 * Whether a waiting worker brings anything this page does not already have.
 * Pages always come from the network, so a page opened after a deployment is
 * already the new version while the worker that arrived with it still waits:
 * that is not an update, and offering one would reload into the same thing.
 * A worker that does not answer in time is taken to be an update.
 */
export function isNewVersion(worker: ServiceWorker): Promise<boolean> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = window.setTimeout(() => resolve(true), versionReplyMs);
    channel.port1.onmessage = (event: MessageEvent<{ version?: string }>) => {
      window.clearTimeout(timer);
      resolve(event.data?.version !== pageVersion);
    };
    worker.postMessage({ type: "GET_VERSION" }, [channel.port2]);
  });
}

/** How often, at most, a window that is shown again asks whether there is a new version. */
export const updateCheckMs = 30 * 60 * 1000;

async function register() {
  const reg = await navigator.serviceWorker.register("/sw.js", {
    scope: "/",
    updateViaCache: "none",
  });
  registration = reg;
  // A worker that installs while another controls the page may be an update. The first
  // worker a browser ever gets controls nothing yet, and is not one; nor is one that is
  // the version this page already is (`isNewVersion`).
  const offer = (worker: ServiceWorker) => {
    void isNewVersion(worker).then((newer) => {
      if (newer && reg.waiting === worker) set({ updateReady: true });
    });
  };
  const watch = (worker: ServiceWorker | null) => {
    worker?.addEventListener("statechange", () => {
      if (worker.state === "installed" && navigator.serviceWorker.controller) offer(worker);
    });
  };
  if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
  watch(reg.installing);
  reg.addEventListener("updatefound", () => watch(reg.installing));

  // An installed application can stay open for days. Ask again when it is looked at.
  let checked = Date.now();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || Date.now() - checked < updateCheckMs) return;
    checked = Date.now();
    reg.update().catch(() => {});
  });
}

/** Starts listening, once per page. Safe to call again. */
export function startPwa() {
  if (started || typeof window === "undefined") return;
  started = true;
  set({ standalone: isStandalone() });
  window.matchMedia?.("(display-mode: standalone)").addEventListener?.("change", () => {
    set({ standalone: isStandalone() });
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    // Kept for the install button in Settings, instead of the browser's own banner.
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    set({ canPrompt: true });
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    // A later visit in this browser cannot tell it was installed; the dashboard's notice remembers.
    storeInstallNotice("installed");
    set({ canPrompt: false, justInstalled: true, declined: false });
  });

  if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
  const go = () => {
    register().catch(() => {
      // Without a worker the application works as a website; nothing to tell anyone.
    });
  };
  if (document.readyState === "complete") go();
  else window.addEventListener("load", go, { once: true });
}

/** Shows the browser's install prompt, where it offered one. */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const event = deferred;
  if (!event) return "unavailable";
  // A prompt can be shown once.
  deferred = null;
  set({ canPrompt: false });
  await event.prompt();
  const { outcome } = await event.userChoice;
  set({ declined: outcome === "dismissed" });
  return outcome;
}

/**
 * Takes the waiting version, and reloads this tab once it has taken over.
 * Refused while anything in the tab is unsaved (lib/unsaved-work.ts): an
 * update never costs anyone their work. Other tabs are not reloaded.
 */
export function applyUpdate(): "unsaved" | "none" | "started" {
  if (hasUnsavedWork()) return "unsaved";
  const waiting = registration?.waiting;
  if (!waiting) return "none";
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });
  waiting.postMessage({ type: "SKIP_WAITING" });
  return "started";
}

const subscribe = (notify: () => void) => {
  listeners.add(notify);
  return () => listeners.delete(notify);
};

/** The installed application's state; the initial state on the server and before hydration. */
export function usePwa(): PwaState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => initial,
  );
}

/** For tests: forget everything. */
export function resetPwaForTests(change: Partial<PwaState> = {}) {
  state = { ...initial, ...change };
  deferred = null;
  registration = null;
  started = false;
  listeners.forEach((notify) => notify());
}

/** For tests: stand in a registration. */
export function setRegistrationForTests(value: ServiceWorkerRegistration | null) {
  registration = value;
}
