import { Suspense } from "react";
import type { Metadata } from "next";

import { getT } from "@/i18n/server";
import { isAuthConfigured } from "@/lib/env";
import { AuthFormFallback, AuthNotice } from "../../auth-notice";
import { SignUpForm } from "../../clerk-forms";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: (await getT("auth")).invitation.metaTitle,
    robots: { index: false, follow: false },
  };
}

type PageProps = {
  params: Promise<{ rest?: string[] }>;
  searchParams: Promise<{ __clerk_ticket?: string | string[] }>;
};

/**
 * Where an invitation email lands. Clerk's form appears only for a visitor
 * arriving with an invitation ticket (or continuing a flow that started with
 * one); open registration is `/sign-up`. Clerk itself rejects a ticket that
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
    const t = await getT("auth");
    return (
      <AuthNotice eyebrow={t.beta} title={t.invitation.requiredTitle}>
        {t.invitation.required}
      </AuthNotice>
    );
  }

  // Clerk's form supplies the page's h1.
  return <SignUpForm />;
}
