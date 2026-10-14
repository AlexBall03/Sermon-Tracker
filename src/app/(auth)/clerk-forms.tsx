"use client";

import { SignIn, SignUp, useAuth } from "@clerk/nextjs";

import { routes } from "@/lib/site";
import { AuthFormFallback } from "./auth-notice";

/**
 * Clerk's forms, held in place once they have done their work. The moment a
 * person is signed in, Clerk's form draws nothing, and for the second before
 * the application opens the card would fold to a line with the links under it
 * riding up. The form stays mounted, so Clerk still sends the person on, and
 * the card it leaves is filled with the same placeholder that stood there
 * before the form loaded.
 */
function Held({ children }: { children: React.ReactNode }) {
  const { isSignedIn } = useAuth();
  return (
    <>
      {/* Hidden, not removed: Clerk finishes the redirect from inside its own form. */}
      <div hidden={isSignedIn}>{children}</div>
      {isSignedIn && <AuthFormFallback />}
    </>
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
