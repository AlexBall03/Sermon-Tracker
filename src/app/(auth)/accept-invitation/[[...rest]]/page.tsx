import { Suspense } from "react";
import type { Metadata } from "next";
import { SignUp } from "@clerk/nextjs";

import { isAuthConfigured } from "@/lib/env";
import { routes } from "@/lib/site";
import { AuthFormFallback, AuthNotice } from "../../auth-notice";

export const metadata: Metadata = {
  title: "Accept invitation",
  robots: { index: false, follow: false },
};

type PageProps = {
  params: Promise<{ rest?: string[] }>;
  searchParams: Promise<{ __clerk_ticket?: string | string[] }>;
};

/**
 * Where an invitation email lands. Clerk's form appears only for a visitor
 * arriving with an invitation ticket (or continuing a flow that started with
 * one); there is no open registration page. Clerk itself rejects a ticket that
 * is expired, revoked, or already used.
 */
export default function AcceptInvitationPage(props: PageProps) {
  return (
    <Suspense fallback={<AuthFormFallback />}>
      <AcceptInvitation {...props} />
    </Suspense>
  );
}

async function AcceptInvitation({ params, searchParams }: PageProps) {
  const [{ rest }, { __clerk_ticket: ticket }] = await Promise.all([params, searchParams]);
  // Later steps of the same flow (verification, SSO callback) are sub-paths.
  const isContinuing = Boolean(rest?.length);

  if (!isAuthConfigured() || (!ticket && !isContinuing)) {
    return (
      <AuthNotice eyebrow="Invitation-only beta" title="An invitation is required">
        Accounts are created from an invitation email. Open the link in your invitation to continue,
        or ask an administrator to send a new one if it has expired.
      </AuthNotice>
    );
  }

  // Clerk's form supplies the page's h1.
  return <SignUp signInUrl={routes.signIn} fallbackRedirectUrl={routes.dashboard} />;
}
