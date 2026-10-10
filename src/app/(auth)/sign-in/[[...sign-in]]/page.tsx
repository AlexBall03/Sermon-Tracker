import { Suspense } from "react";
import type { Metadata } from "next";
import { SignIn } from "@clerk/nextjs";

import { isAuthConfigured } from "@/lib/env";
import { routes } from "@/lib/site";
import { AuthFormFallback, AuthNotice } from "../../auth-notice";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

/**
 * Sign-in only. Accounts are created by accepting an invitation, so the
 * sign-up half of Clerk's combined flow is switched off here and registration
 * is restricted in the Clerk dashboard (see docs/ENVIRONMENTS.md).
 */
export default function SignInPage() {
  if (!isAuthConfigured()) {
    return (
      <AuthNotice eyebrow="Invitation-only beta" title="Sign-in is not available here">
        Authentication has not been configured for this environment, so nobody can sign in yet.
      </AuthNotice>
    );
  }

  // Clerk's form supplies the page's h1. It reads the URL, which is only known per request.
  return (
    <Suspense fallback={<AuthFormFallback />}>
      <SignIn withSignUp={false} fallbackRedirectUrl={routes.dashboard} />
    </Suspense>
  );
}
