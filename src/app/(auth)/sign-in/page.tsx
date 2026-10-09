import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { routes } from "@/lib/site";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

/**
 * Interim page. Authentication is not implemented in Phase 1A, so this
 * states that plainly instead of showing a non-working form.
 * Phase 1B replaces the body with Clerk's sign-in.
 */
export default function SignInPage() {
  return (
    <div className="rounded-3xl glass p-8 text-center shadow-xl shadow-black/5 sm:p-10">
      <p className="text-xs font-semibold tracking-[0.24em] text-primary uppercase">
        Invitation-only beta
      </p>
      <h1 className="mt-4 font-display text-3xl leading-tight font-semibold tracking-tight">
        Sign-in is not open yet
      </h1>
      <p className="mt-4 leading-relaxed text-muted-foreground">
        Sermon Tracker is still in development. Invited preachers will be able to sign in here once
        accounts are enabled.
      </p>
      <Link
        href={routes.home}
        className={buttonVariants({ variant: "outline", className: "mt-8" })}
      >
        <ArrowLeft />
        Back to home
      </Link>
    </div>
  );
}
