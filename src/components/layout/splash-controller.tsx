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
 * Timings. The splash's bar fills while the page loads, quickly at first and
 * then ever more slowly, never reaching the end by itself. Once the page has
 * finished loading, and its opening sequence has played (`introMs` from the
 * moment it went up, by when the last word of the tagline has arrived), the
 * bar runs the rest of the way and is seen full: `finishMs` in all, the same
 * whether the page came quickly or slowly. Only then does the screen lift, for
 * `fadeMs`. A page that loads slowly keeps the bar short of the end for as
 * long as it takes; `giveUpMs` is how long it waits for a page that never
 * finishes loading.
 *
 * With reduced motion there is no sequence to wait for: the picture is whole
 * at once, is shown for `reducedMs` so that it is seen and not a flash, the
 * bar is shown full without moving for `reducedFinishMs`, and it goes in
 * `reducedFadeMs`.
 *
 * `introMs`, `fadeMs`, and `reducedFadeMs` must match globals.css ("Splash").
 */
export const splashTiming = {
  introMs: 1200,
  finishMs: 420,
  fadeMs: 480,
  reducedMs: 500,
  reducedFinishMs: 150,
  reducedFadeMs: 200,
  giveUpMs: 8000,
} as const;

/** Of `finishMs`, the part the bar spends running to the end; the rest it is seen full. */
const runMs = 300;

const splashBar = () => document.querySelector<HTMLElement>("[data-splash-bar]");

/** How far the bar has filled, 0 to 1, from its transform while it animates. */
function filled(bar: HTMLElement) {
  const match = /matrix\(([-\d.e]+)/.exec(getComputedStyle(bar).transform);
  return match ? Number(match[1]) : 0;
}

/** Runs the bar from where it is to the end (at once, with reduced motion). */
function fillBar(reduced: boolean) {
  const bar = splashBar();
  if (!bar) return;
  const from = filled(bar);
  bar.style.animation = "none";
  bar.style.transform = `scaleX(${from})`;
  if (!reduced) {
    // Read the layout, so the starting point is drawn before the transition begins.
    void bar.getBoundingClientRect();
    bar.style.transition = `transform ${runMs}ms cubic-bezier(0.3, 0.6, 0.2, 1)`;
  }
  bar.style.transform = "scaleX(1)";
}

/** Gives the bar back to the stylesheet, so a splash raised again fills from the start. */
function resetBar() {
  const bar = splashBar();
  bar?.style.removeProperty("animation");
  bar?.style.removeProperty("transform");
  bar?.style.removeProperty("transition");
}

/** Asked each time the splash is taken down, so a preference changed meanwhile is the one obeyed. */
const prefersReducedMotion = () =>
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/*
 * The whole state is one attribute on <html>: `data-splash="on"`, then
 * `"leaving"` while it fades, then absent. There is one splash per document,
 * so its timers are kept here, once, and not in a component. Every change
 * goes through `takeDown`, which cancels whatever was scheduled before it:
 * a splash raised again while an earlier one is leaving simply starts over,
 * and there is never more than one timer chain alive.
 */
let cancel = () => {};

/** Schedules the splash's exit: after its opening sequence, and once the page has loaded. */
function takeDown() {
  cancel();
  const root = document.documentElement;
  const timers: number[] = [];
  let settled = false;
  const reduced = prefersReducedMotion();
  const shownMs = reduced ? splashTiming.reducedMs : splashTiming.introMs;
  const finishMs = reduced ? splashTiming.reducedFinishMs : splashTiming.finishMs;
  const fadeMs = reduced ? splashTiming.reducedFadeMs : splashTiming.fadeMs;

  const leave = () => {
    root.dataset.splash = "leaving";
    timers.push(
      window.setTimeout(() => {
        delete root.dataset.splash;
        resetBar();
      }, fadeMs),
    );
  };
  // The bar runs to the end and is seen full; then the screen goes.
  const finish = () => {
    fillBar(reduced);
    timers.push(window.setTimeout(leave, finishMs));
  };
  // The page is ready (or we have stopped waiting for it): let the opening finish, then finish.
  const ready = () => {
    if (settled) return;
    settled = true;
    const shownFor = performance.now() - (window.__splashAt ?? performance.now());
    const remaining = shownMs - shownFor;
    if (remaining <= 0) finish();
    else timers.push(window.setTimeout(finish, remaining));
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

/** True while a sign-in has put the splash up and the next page has not arrived. */
let held = false;

/**
 * Puts the splash up the moment a sign-in succeeds, and keeps it there until
 * the next page arrives (a change of address takes it down as usual), so what
 * is seen goes straight from the sign-in form to the loading screen, with
 * nothing of the form folding away between. A next page that never comes is
 * let go after `giveUpMs`, as a page that never loads is.
 */
export function holdSplash() {
  if (held) return;
  cancel();
  held = true;
  const root = document.documentElement;
  if (root.dataset.splash !== "on") {
    resetBar();
    root.dataset.splash = "on";
    window.__splashAt = performance.now();
  }
  const timer = window.setTimeout(() => {
    held = false;
    takeDown();
  }, splashTiming.giveUpMs);
  cancel = () => window.clearTimeout(timer);
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
 * signal arrives with that navigation, and a splash held since the sign-in
 * (`holdSplash`) is let go by it. A layout effect, so the splash is up before
 * the new page is painted.
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
    const signalled = takeSignal();
    if (!signalled && !held) return;
    held = false;
    const root = document.documentElement;
    // Already up since the sign-in: its opening has been playing, and is not started again.
    if (root.dataset.splash !== "on") {
      resetBar();
      root.dataset.splash = "on";
      window.__splashAt = performance.now();
    }
    takeDown();
  }, [pathname]);
  return null;
}
