"use client";

import { Suspense, useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/** Dispatched on `window` by src/instrumentation-client.ts when the router starts a navigation. */
export const navigationStartEvent = "app:navigation-start";

/**
 * Timings. A bar that has started is shown for at least `visibleMs`, so a
 * quick navigation is still seen; `finishMs` is the run to full width and the
 * fade, and must cover the transition in globals.css. `giveUpMs` ends a bar
 * whose navigation never arrived.
 */
export const progressTiming = {
  visibleMs: 300,
  finishMs: 600,
  sameUrlMs: 400,
  giveUpMs: 15_000,
} as const;

const here = () => window.location.pathname + window.location.search;

/**
 * The slim bar at the very top of the window, above the header. It runs
 * while a page is loading (a first visit, a refresh) and during every
 * navigation within the app: links, Back and Forward, and navigation from
 * code. It is in the server's HTML already running, so a loading page shows
 * it before any script has arrived.
 *
 * Its whole state is `data-state` on the element (`idle`, `loading`, `done`)
 * and the styles in globals.css under "Navigation progress"; React state is
 * not involved, so nothing here can fall out of step with a render.
 */
export function NavigationProgress() {
  const bar = useRef<HTMLDivElement>(null);
  const control = useRef({ finish: () => {} });

  useEffect(() => {
    const element = bar.current;
    if (!element) return;
    let startedAt = performance.now();
    let timers: number[] = [];
    const clear = () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      timers = [];
    };
    const later = (run: () => void, ms: number) => timers.push(window.setTimeout(run, ms));

    const finish = () => {
      if (element.dataset.state !== "loading") return;
      clear();
      const arrive = () => {
        element.dataset.state = "done";
        later(() => (element.dataset.state = "idle"), progressTiming.finishMs);
      };
      const remaining = progressTiming.visibleMs - (performance.now() - startedAt);
      if (remaining <= 0) arrive();
      else later(arrive, remaining);
    };

    const start = (event: Event) => {
      clear();
      // Back to nothing, and let the browser see it, so the run begins from the left again.
      element.dataset.state = "idle";
      void element.offsetWidth;
      element.dataset.state = "loading";
      startedAt = performance.now();

      const url = (event as CustomEvent<string>).detail;
      const target = new URL(url, window.location.href);
      // Going where we already are changes no address, so nothing will announce the arrival.
      const sameUrl = target.pathname + target.search === here();
      later(finish, sameUrl ? progressTiming.sameUrlMs : progressTiming.giveUpMs);
    };

    control.current.finish = finish;
    window.addEventListener(navigationStartEvent, start);

    // The page's own load: the bar came from the server already running.
    if (document.readyState === "complete") finish();
    else window.addEventListener("load", finish, { once: true });
    later(finish, progressTiming.giveUpMs);

    return () => {
      clear();
      window.removeEventListener(navigationStartEvent, start);
      window.removeEventListener("load", finish);
    };
  }, []);

  return (
    <>
      <div
        ref={bar}
        data-nav-progress
        data-state="loading"
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 z-[70] h-px"
      >
        <div className="h-full origin-left bg-primary shadow-[0_0_4px_color-mix(in_oklab,var(--lamp)_30%,transparent)]" />
      </div>
      {/* Reading the query string suspends during prerendering, so it sits in its own boundary. */}
      <Suspense fallback={null}>
        <Arrival onArrive={() => control.current.finish()} />
      </Suspense>
    </>
  );
}

/** Reports each time the address the router is showing changes. */
function Arrival({ onArrive }: { onArrive: () => void }) {
  const pathname = usePathname();
  const query = useSearchParams().toString();
  const first = useRef(true);
  useEffect(() => {
    // The first run is the page's own load, which `load` ends.
    if (first.current) {
      first.current = false;
      return;
    }
    onArrive();
    // Only the address matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, query]);
  return null;
}
