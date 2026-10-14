import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";

import { getT } from "@/i18n/server";
import { isAuthConfigured } from "@/lib/env";
import { AuthFormFallback, AuthNotice } from "../../auth-notice";
import { SignInForm } from "../../clerk-forms";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: (await getT("auth")).signIn.metaTitle,
    robots: { index: false, follow: false },
  };
}

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
    <>
      <Suspense fallback={<AuthFormFallback />}>
        <SignInForm />
      </Suspense>
      <Suspense>
        <PerRequest />
      </Suspense>
    </>
  );
}

/**
 * Says the page is rendered per request on purpose: its title is in the
 * visitor's language, which Next.js allows only where the page itself has
 * something that waits for the request.
 */
async function PerRequest() {
  await connection();
  return null;
}
