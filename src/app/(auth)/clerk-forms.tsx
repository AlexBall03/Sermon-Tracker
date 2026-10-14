"use client";

import { useLayoutEffect, useRef } from "react";
import { SignIn, SignUp, useAuth } from "@clerk/nextjs";

import { holdSplash } from "@/components/layout/splash-controller";
import { routes } from "@/lib/site";
import { AuthFormFallback } from "./auth-notice";

/** Shorter than this, Clerk's form is not drawn: not yet, or no longer. */
const drawnPx = 48;

/**
 * Clerk's forms, with the card held at its full size before and after them,
 * so it never folds to a line, whenever Clerk chooses to draw or to clear it.
 *
 * The holder's `data-form` is `loading` (Clerk has drawn nothing yet: its
 * script arrives from its servers about a second after the page), `shown`, or
 * `done` (the form emptied itself, which Clerk does as a sign-in finishes, or
 * the person is signed in). Only while `shown` is the form seen; otherwise the
 * placeholder stands in the card's place and the form is laid out unseen
 * beneath it. At `done` the loading screen goes up and stays until the
 * application's first page is there (`holdSplash`). The form stays mounted
 * throughout, so Clerk still finishes the sign-in and sends the person on.
 *
 * The state is set on the element from a `ResizeObserver`, not through React:
 * its callbacks run after layout and before the frame is painted, so a form
 * that has just emptied is never painted empty. React renders the attribute
 * once and never changes it, so it never puts back an older value.
 */
function Held({ children }: { children: React.ReactNode }) {
  const { isSignedIn } = useAuth();
  const holder = useRef<HTMLDivElement>(null);
  const form = useRef<HTMLDivElement>(null);

  // Signed in, by whatever path: done, before the next paint.
  useLayoutEffect(() => {
    if (!isSignedIn || !holder.current) return;
    holder.current.dataset.form = "done";
    holdSplash();
  }, [isSignedIn]);

  useLayoutEffect(() => {
    const box = holder.current;
    const element = form.current;
    if (!box || !element) return;
    const observer = new ResizeObserver(() => {
      const tall = element.getBoundingClientRect().height >= drawnPx;
      const state = box.dataset.form;
      if (state === "loading" && tall) box.dataset.form = "shown";
      else if (state === "shown" && !tall) {
        // Clerk clears its form only as a sign-in completes: the next thing seen is the splash.
        box.dataset.form = "done";
        holdSplash();
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={holder} data-form="loading" className="group/held relative">
      {/* Laid out but unseen until it is drawn, so it appears whole, in one frame. */}
      <div
        ref={form}
        className="invisible absolute inset-x-0 top-0 group-data-[form=shown]/held:visible group-data-[form=shown]/held:static"
      >
        {children}
      </div>
      <div className="group-data-[form=shown]/held:hidden">
        <AuthFormFallback />
      </div>
    </div>
  );
}

/** Sign-in only: the sign-up half of Clerk's combined flow is switched off. */
export function SignInForm() {
  return (
    <Held>
      <SignIn withSignUp={false} fallbackRedirectUrl={routes.dashboard} />
    </Held>
  );
}

/** Creating an account from an invitation. */
export function SignUpForm() {
  return (
    <Held>
      <SignUp signInUrl={routes.signIn} fallbackRedirectUrl={routes.dashboard} />
    </Held>
  );
}
