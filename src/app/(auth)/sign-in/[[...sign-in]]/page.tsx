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
 * Signing in. Clerk's form links across to `/sign-up` for a visitor without an
 * account (see docs/ENVIRONMENTS.md for the Clerk instance's sign-up mode).
 */
export default async function SignInPage() {
  if (!isAuthConfigured()) {
    const t = await getT("auth");
    return (
      <AuthNotice eyebrow={t.beta} title={t.signIn.unavailableTitle}>
        {t.signIn.unavailable}
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
