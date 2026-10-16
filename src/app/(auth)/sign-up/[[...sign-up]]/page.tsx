import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";

import { getT } from "@/i18n/server";
import { isAuthConfigured } from "@/lib/env";
import { AuthFormFallback, AuthNotice } from "../../auth-notice";
import { SignUpForm } from "../../clerk-forms";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: (await getT("auth")).signUp.metaTitle,
    robots: { index: false, follow: false },
  };
}

/**
 * Open registration through Clerk's own form, which verifies the email address
 * before the account exists. The application admits the new identity as an
 * ordinary user on its first request (features/auth/provisioning.ts), and
 * first-time setup takes it from there. Invitation emails still land on
 * `/accept-invitation`.
 */
export default async function SignUpPage() {
  if (!isAuthConfigured()) {
    const t = await getT("auth");
    return (
      <AuthNotice eyebrow={t.beta} title={t.signIn.unavailableTitle}>
        {t.signIn.unavailable}
      </AuthNotice>
    );
  }

  // Clerk's form supplies the page's h1. Later steps (verification, SSO) are sub-paths.
  return (
    <>
      <Suspense fallback={<AuthFormFallback />}>
        <SignUpForm />
      </Suspense>
      <Suspense>
        <PerRequest />
      </Suspense>
    </>
  );
}

/** Rendered per request, as the sign-in page is, so its title is in the visitor's language. */
async function PerRequest() {
  await connection();
  return null;
}
