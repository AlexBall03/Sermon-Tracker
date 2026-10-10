"use client";

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";

import type { AccountUser } from "../hooks/use-account-action";

const slowAfterMs = 10_000;

/**
 * Renders account controls once the sign-in provider's browser SDK has the
 * identity. Until then it shows a placeholder, and says so if that never happens.
 */
export function AccountGate({ children }: { children: (user: AccountUser) => React.ReactNode }) {
  const { isLoaded, user } = useUser();
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (isLoaded) return;
    const timer = setTimeout(() => setSlow(true), slowAfterMs);
    return () => clearTimeout(timer);
  }, [isLoaded]);

  if (!isLoaded) {
    return (
      <div role="status" aria-live="polite">
        {slow ? (
          <p className="text-sm leading-relaxed text-muted-foreground">
            Your account details are taking longer than usual to load. Check your connection, then
            reload the page.
          </p>
        ) : (
          <>
            <span className="sr-only">Loading your account</span>
            <div className="h-10 w-full max-w-sm animate-pulse rounded-lg bg-secondary" />
            <div className="mt-4 h-24 animate-pulse rounded-xl bg-secondary" />
          </>
        )}
      </div>
    );
  }

  if (!user) {
    return (
      <p className="text-sm leading-relaxed text-muted-foreground">
        Your session has ended. Sign in again to manage your account.
      </p>
    );
  }

  return children(user);
}
