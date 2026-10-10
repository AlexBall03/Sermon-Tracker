"use client";

import { useState } from "react";

import { ActionStatus } from "@/components/ui/action-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, type Confirmation } from "@/components/ui/confirm-dialog";
import { attempt, useAccountAction, type AccountUser } from "../hooks/use-account-action";
import { useConnectedAccounts } from "../hooks/use-connected-accounts";

/** Sign-in providers linked to the account. Linking happens on the provider's own screens. */
export function ConnectedAccounts({ user }: { user: AccountUser }) {
  const connected = useConnectedAccounts(user);
  const { busy, result, run } = useAccountAction();
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  return (
    <>
      <ul className="divide-y rounded-xl border bg-surface shadow-card">
        {connected.accounts.map((account) => (
          <li
            key={account.id}
            className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5"
          >
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                {account.title}
                <Badge tone={account.verified ? "muted" : "danger"}>
                  {account.verified ? "Connected" : "Not finished"}
                </Badge>
              </p>
              {account.email && (
                <p className="mt-1 truncate text-[0.8125rem] text-muted-foreground">
                  {account.email}
                </p>
              )}
              {!account.canDisconnect && (
                <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted-foreground">
                  This is your only way to sign in. Set a password before disconnecting it.
                </p>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy || !account.canDisconnect}
              className="shrink-0 self-start text-destructive hover:bg-destructive/10 sm:self-auto"
              aria-label={`Disconnect ${account.title}`}
              onClick={() =>
                setConfirmation({
                  title: `Disconnect ${account.title}?`,
                  description: `You will no longer be able to sign in to Sermon Tracker with ${account.title}. You can connect it again later.`,
                  confirmLabel: "Disconnect",
                  destructive: true,
                  run: () =>
                    attempt(
                      () => connected.disconnect(account.id),
                      `${account.title} was disconnected.`,
                      `${account.title} could not be disconnected. Try again.`,
                    ),
                })
              }
            >
              Disconnect
            </Button>
          </li>
        ))}
        {connected.available.map((option) => (
          <li
            key={option.strategy}
            className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold">{option.title}</p>
              <p className="mt-1 text-[0.8125rem] text-muted-foreground">Not connected</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              aria-label={`Connect ${option.title}`}
              onClick={() =>
                void run(
                  () => connected.connect(option.strategy),
                  `Taking you to ${option.title}…`,
                  `${option.title} could not be connected. It may not be available yet.`,
                )
              }
            >
              Connect
            </Button>
          </li>
        ))}
      </ul>
      <ActionStatus result={result} />

      <ConfirmDialog
        confirmation={confirmation}
        busy={busy}
        onConfirm={(chosen) => void run(chosen.run).then(() => setConfirmation(null))}
        onCancel={() => setConfirmation(null)}
      />
    </>
  );
}
