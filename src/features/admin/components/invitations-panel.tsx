"use client";

import { useActionState, useState, useTransition } from "react";
import { LoaderCircle } from "lucide-react";

import { ActionStatus } from "@/components/ui/action-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, type Confirmation } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocale, useT } from "@/i18n/client";
import type { ActionResult } from "@/lib/action-result";
import { formatDate } from "@/lib/format";
import { inviteUser, resendUserInvitation, revokeUserInvitation } from "../actions";
import type { PendingInvitation } from "../clerk";

type InvitationsPanelProps = {
  /** Null when Clerk could not be reached; the form still works. */
  invitations: PendingInvitation[] | null;
};

export function InvitationsPanel({ invitations }: InvitationsPanelProps) {
  const t = useT("admin").invitations;
  const locale = useLocale();
  const [inviteResult, invite, inviting] = useActionState(inviteUser, null);
  const [rowResult, setRowResult] = useState<ActionResult | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [busy, startTransition] = useTransition();

  function run(action: () => Promise<ActionResult>) {
    startTransition(async () => {
      setRowResult(await action());
      setConfirmation(null);
    });
  }

  return (
    <>
      <form action={invite} className="mt-4 flex max-w-2xl flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Label htmlFor="invite-email">{t.email}</Label>
          <Input
            id="invite-email"
            name="email"
            type="email"
            required
            autoComplete="off"
            placeholder="name@example.com"
            className="mt-2"
            aria-describedby="invite-status"
          />
        </div>
        <Button type="submit" disabled={inviting} aria-busy={inviting}>
          {inviting && <LoaderCircle className="animate-spin" aria-hidden />}
          {inviting ? t.sending : t.send}
        </Button>
      </form>
      <div id="invite-status">
        <ActionStatus result={inviteResult} />
      </div>

      <ActionStatus result={rowResult} />
      {invitations === null ? (
        <p className="mt-4 text-sm text-muted-foreground">{t.unavailable}</p>
      ) : invitations.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-input px-5 py-6 text-sm text-muted-foreground">
          {t.none}
        </p>
      ) : (
        <ul className="mt-4 divide-y rounded-xl border bg-surface shadow-card">
          {invitations.map((invitation) => (
            <li
              key={invitation.id}
              className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{invitation.email}</p>
                <p className="mt-1 flex items-center gap-2 text-[0.8125rem] text-muted-foreground tabular-nums">
                  <Badge tone="muted">{t.pending}</Badge>
                  {t.sent} {formatDate(invitation.createdAt, locale)}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  aria-label={t.resendTo(invitation.email)}
                  onClick={() => run(() => resendUserInvitation(invitation.id))}
                >
                  {t.resend}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  className="text-destructive hover:bg-destructive/10"
                  aria-label={t.revokeTo(invitation.email)}
                  onClick={() =>
                    setConfirmation({
                      title: t.revokeTitle,
                      description: t.revokeDescription(invitation.email),
                      confirmLabel: t.revokeConfirm,
                      destructive: true,
                      run: () => revokeUserInvitation(invitation.id),
                    })
                  }
                >
                  {t.revoke}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        confirmation={confirmation}
        busy={busy}
        onConfirm={(chosen) => run(chosen.run)}
        onCancel={() => setConfirmation(null)}
      />
    </>
  );
}
