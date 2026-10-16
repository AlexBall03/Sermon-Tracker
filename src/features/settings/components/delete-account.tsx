"use client";

import { useState, useTransition } from "react";
import { useClerk, useReverification } from "@clerk/nextjs";
import { isReverificationCancelledError } from "@clerk/nextjs/errors";

import { ActionStatus } from "@/components/ui/action-status";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, type Confirmation } from "@/components/ui/confirm-dialog";
import { deleteMyAccount, type DeleteAccountResult } from "@/features/account/actions";
import { forgetAccount } from "@/features/offline/account";
import { isStandalone } from "@/features/pwa/standalone";
import { useT } from "@/i18n/client";
import type { ActionResult } from "@/lib/action-result";
import { routes } from "@/lib/site";

/**
 * The Danger Zone's one action. Clerk asks the person to confirm it is them
 * when the session is not freshly verified; once the server has locked the
 * account, this device forgets what it kept for it and signs out.
 */
export function DeleteAccount({ userId }: { userId: string }) {
  const t = useT("settings").deleteAccount;
  const clerk = useClerk();
  const remove = useReverification(deleteMyAccount);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [busy, startTransition] = useTransition();

  async function run(): Promise<DeleteAccountResult> {
    try {
      return await remove();
    } catch (error) {
      if (isReverificationCancelledError(error)) return { ok: false, message: "" };
      return { ok: false, message: t.failed };
    }
  }

  function confirm(chosen: Confirmation) {
    startTransition(async () => {
      const outcome = await chosen.run();
      setConfirmation(null);
      setResult(outcome.message ? outcome : null);
      if (!outcome.ok) return;
      // The account is locked from here on, whether or not every step has finished.
      await forgetAccount(userId).catch(() => undefined);
      const home = isStandalone() ? routes.signIn : routes.home;
      await clerk.signOut({ redirectUrl: home }).catch(() => window.location.assign(home));
    });
  }

  return (
    <div>
      <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">{t.description}</p>
      <Button
        variant="destructive"
        className="mt-4"
        disabled={busy}
        onClick={() =>
          setConfirmation({
            title: t.confirmTitle,
            description: t.confirmBody,
            confirmLabel: t.confirm,
            destructive: true,
            run,
          })
        }
      >
        {t.button}
      </Button>
      <ActionStatus result={result} />
      <ConfirmDialog
        confirmation={confirmation}
        busy={busy}
        onConfirm={confirm}
        onCancel={() => setConfirmation(null)}
      />
    </div>
  );
}
