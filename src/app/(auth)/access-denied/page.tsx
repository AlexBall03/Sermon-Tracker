import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { SignOutButton } from "@clerk/nextjs";

import { Button, buttonVariants } from "@/components/ui/button";
import { getT } from "@/i18n/server";
import { isAuthConfigured } from "@/lib/env";
import { routes } from "@/lib/site";
import { AuthFormFallback, AuthNotice } from "../auth-notice";

export const metadata: Metadata = {
  title: "Access denied",
  robots: { index: false, follow: false },
};

/** Shown to a signed-in person whose account is disabled, uninvited, or lacks permission. */
export default function AccessDeniedPage() {
  return (
    // Its language is decided per request, which needs a boundary.
    <Suspense fallback={<AuthFormFallback />}>
      <AccessDenied />
    </Suspense>
  );
}

export async function AccessDenied() {
  const t = (await getT("auth")).denied;
  return (
    <AuthNotice
      eyebrow={t.eyebrow}
      title={t.title}
      actions={
        <>
          <Link href={routes.dashboard} className={buttonVariants({ variant: "outline" })}>
            {t.dashboard}
          </Link>
          {isAuthConfigured() && (
            <SignOutButton redirectUrl={routes.home}>
              <Button>{t.signOut}</Button>
            </SignOutButton>
          )}
        </>
      }
    >
      {t.body}
    </AuthNotice>
  );
}
