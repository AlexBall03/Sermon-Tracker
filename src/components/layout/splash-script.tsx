"use client";

import { splashCookie } from "@/lib/splash";

/** If the page's script never runs, the splash lets go by itself after this long. */
const lastResortMs = 10_000;

/** Set for the life of one launch of the installed application, once its splash has been shown. */
export const launchedKey = "st-launched";

/*
 * Runs before the first paint. The splash is turned on when the proxy
 * signalled one (a first visit, or the first page after signing in), or when
 * this is the first page of a launch of the installed application, signed in
 * or not: the proxy cannot tell a launch from a page, because the installed
 * window keeps the browser session's cookies between launches, while its
 * session storage starts empty with each. It notes the time so the controller
 * knows when its opening has played. Otherwise the splash stays
 * `display: none` and is never seen.
 */
export const splashScript = `(function(){try{var d=document.documentElement,on=false;if(/(?:^|; )${splashCookie}=1/.test(document.cookie)){document.cookie="${splashCookie}=; Max-Age=0; path=/";on=true}try{if((navigator.standalone===true||matchMedia("(display-mode: standalone)").matches)&&!sessionStorage.getItem("${launchedKey}")){sessionStorage.setItem("${launchedKey}","1");on=true}}catch(e){}if(on){d.dataset.splash="on";window.__splashAt=performance.now();setTimeout(function(){if(!window.__splashManaged)delete d.dataset.splash},${lastResortMs})}}catch(e){}})()`;

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
      dangerouslySetInnerHTML={{ __html: splashScript }}
    />
  );
}
