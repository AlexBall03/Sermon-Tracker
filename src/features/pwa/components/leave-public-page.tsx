"use client";

import { useLayoutEffect } from "react";

import { routes } from "@/lib/site";
import { isStandalone } from "../standalone";

/*
 * The installed application is only for people who are signed in, so it never
 * shows the public page: arriving there (after signing out from a notice, say)
 * it goes to sign-in, which in turn sends someone signed in to the dashboard.
 *
 * In the server's HTML an inline script does it before the page is painted;
 * after a move inside the application, where no script in the HTML runs, the
 * layout effect does. In a browser tab neither does anything.
 */
const script = `(function(){try{if(navigator.standalone===true||["standalone","minimal-ui","window-controls-overlay"].some(function(m){return matchMedia("(display-mode: "+m+")").matches}))location.replace(${JSON.stringify(routes.signIn)})}catch(e){}})()`;

export function LeavePublicPage() {
  useLayoutEffect(() => {
    if (isStandalone()) window.location.replace(routes.signIn);
  }, []);
  return (
    <script
      // React never runs a script it renders in the browser; there it is inert data.
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: script }}
    />
  );
}
