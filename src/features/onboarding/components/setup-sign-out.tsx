"use client";

import { useAccountActions } from "@/components/layout/account-menu";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";

/**
 * The way out of first-time setup for someone who will finish it later. What
 * they have done so far is kept, and they come back to the same step.
 */
export function SetupSignOut() {
  const { signOut } = useAccountActions();
  const t = useT("navigation");
  return (
    <Button variant="ghost" size="sm" className="-mr-3" onClick={signOut}>
      {t.signOut}
    </Button>
  );
}
