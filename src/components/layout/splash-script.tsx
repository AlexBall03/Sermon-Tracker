"use client";

import { splashCookie } from "@/lib/splash";

/** If the page's script never runs, the splash lets go by itself after this long. */
const lastResortMs = 10_000;

/*
 * Runs before the first paint. If the proxy signalled a splash (a first visit,
 * or the first page after signing in), it takes the signal, turns the splash
 * on, and notes the time so the controller can keep it up for long enough.
 * With no signal the splash stays `display: none` and is never seen.
 */
const script = `(function(){try{var d=document.documentElement;if(/(?:^|; )${splashCookie}=1/.test(document.cookie)){document.cookie="${splashCookie}=; Max-Age=0; path=/";d.dataset.splash="on";window.__splashAt=performance.now();setTimeout(function(){if(!window.__splashManaged)delete d.dataset.splash},${lastResortMs})}}catch(e){}})()`;

/**
 * The splash's inline script. It only means anything in the server's HTML,
 * where the browser runs it as it parses. React never runs a script it
 * renders in the browser and says so loudly, so there it is given a type
 * that marks it as inert data.
 */
export function SplashScript() {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: script }}
    />
  );
}
