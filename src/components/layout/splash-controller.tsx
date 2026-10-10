"use client";

import { Suspense, useEffect, useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";

import { splashCookie } from "@/lib/splash";

declare global {
  interface Window {
    /** When the splash went up, by `performance.now()`. Set by the inline script. */
    __splashAt?: number;
    /** True once this controller is responsible for taking the splash down. */
    __splashManaged?: boolean;
  }
}

/**
 * Timings. The splash stays for at least `visibleMs` from the moment it went
 * up, and until the page has finished loading; then it fades for `fadeMs`.
 * `visibleMs` is the opening sequence (the last word of the tagline has
 * arrived by about 1.3s) and a short rest on the finished picture.
 * `giveUpMs` is how long it waits for a page that never finishes loading.
 * `fadeMs` must match the transition in globals.css.
 */
export const splashTiming = { visibleMs: 1800, fadeMs: 450, giveUpMs: 8000 } as const;

/*
 * The whole state is one attribute on <html>: `data-splash="on"`, then
 * `"leaving"` while it fades, then absent. There is one splash per document,
 * so its timers are kept here, once, and not in a component. Every change
 * goes through `takeDown`, which cancels whatever was scheduled before it:
 * a splash raised again while an earlier one is leaving simply starts over,
 * and there is never more than one timer chain alive.
 */
let cancel = () => {};

/** Schedules the splash's exit: after its minimum time, and once the page has loaded. */
function takeDown() {
  cancel();
  const root = document.documentElement;
  const timers: number[] = [];
  let settled = false;

  const leave = () => {
    root.dataset.splash = "leaving";
    timers.push(window.setTimeout(() => delete root.dataset.splash, splashTiming.fadeMs));
  };
  // The page is ready (or we have stopped waiting for it): honour the minimum, then go.
  const ready = () => {
    if (settled) return;
    settled = true;
    const shownFor = performance.now() - (window.__splashAt ?? performance.now());
    const remaining = splashTiming.visibleMs - shownFor;
    if (remaining <= 0) leave();
    else timers.push(window.setTimeout(leave, remaining));
  };

  if (document.readyState === "complete") ready();
  else {
    window.addEventListener("load", ready, { once: true });
    timers.push(window.setTimeout(ready, splashTiming.giveUpMs));
  }

  cancel = () => {
    window.removeEventListener("load", ready);
    timers.forEach((timer) => window.clearTimeout(timer));
  };
}

const takeSignal = () => {
  if (!new RegExp(`(?:^|; )${splashCookie}=1`).test(document.cookie)) return false;
  document.cookie = `${splashCookie}=; Max-Age=0; path=/`;
  return true;
};

/**
 * Takes the splash screen down after a page load, and puts it up for
 * sign-ins that happen without one.
 */
export function SplashController() {
  // A page load: the inline script has already put the splash up.
  useEffect(() => {
    window.__splashManaged = true;
    if (document.documentElement.dataset.splash === "on") takeDown();
    // Only the timers are cancelled on the way out. The splash itself is left
    // as it is: in development React runs this effect twice, and taking the
    // splash down in between would end it early.
    return () => cancel();
  }, []);

  // Reading the address suspends while a page is prerendered, so the part
  // that needs it sits in its own boundary; taking the splash down does not
  // wait on it.
  return (
    <Suspense fallback={null}>
      <SplashOnNavigation />
    </Suspense>
  );
}

/**
 * A sign-in that moved to the next page without loading one: the proxy's
 * signal arrives with that navigation. A layout effect, so the splash is up
 * before the new page is painted.
 */
function SplashOnNavigation() {
  const pathname = usePathname();
  const first = useRef(true);
  useLayoutEffect(() => {
    // The first run is the page's own load, which the inline script handled.
    if (first.current) {
      first.current = false;
      return;
    }
    if (!takeSignal()) return;
    document.documentElement.dataset.splash = "on";
    window.__splashAt = performance.now();
    takeDown();
  }, [pathname]);
  return null;
}
