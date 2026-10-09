import type { Metadata } from "next";
import Link from "next/link";
import { SignOutButton } from "@clerk/nextjs";

import { Button, buttonVariants } from "@/components/ui/button";
import { isAuthConfigured } from "@/lib/env";
import { routes } from "@/lib/site";
import { AuthNotice } from "../auth-notice";

export const metadata: Metadata = {
  title: "Access denied",
  robots: { index: false, follow: false },
};

/** Shown to a signed-in person whose account is disabled, uninvited, or lacks permission. */
export default function AccessDeniedPage() {
  return (
    <AuthNotice
      eyebrow="Access denied"
      title="You do not have access"
      actions={
        <>
          <Link href={routes.dashboard} className={buttonVariants({ variant: "outline" })}>
            Go to dashboard
          </Link>
          {isAuthConfigured() && (
            <SignOutButton redirectUrl={routes.home}>
              <Button>Sign out</Button>
            </SignOutButton>
          )}
        </>
      }
    >
      Your account cannot open this part of Sermon Tracker. If you think this is a mistake, contact
      an administrator.
    </AuthNotice>
  );
}
