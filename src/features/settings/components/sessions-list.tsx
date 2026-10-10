"use client";

import { useState } from "react";

import { ActionStatus } from "@/components/ui/action-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, type Confirmation } from "@/components/ui/confirm-dialog";
import { attempt, useAccountAction, type AccountUser } from "../hooks/use-account-action";
import { useSessions } from "../hooks/use-sessions";

// Sessions load in the browser, so the reader's own locale and zone are safe here.
const lastActiveFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

/** Where the account is signed in, with a way to sign out of the other devices. */
export function SessionsList({ user }: { user: AccountUser }) {
  const { status, sessions, retry, revoke } = useSessions(user);
  const { busy, result, run } = useAccountAction();
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  if (status === "loading") {
    return (
      <div role="status" aria-live="polite">
        <span className="sr-only">Loading your devices</span>
        <div className="h-20 animate-pulse rounded-xl bg-secondary" />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Your devices could not be loaded from the sign-in provider.
        </p>
        <Button variant="outline" size="sm" className="mt-3" onClick={retry}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <>
      <ul className="divide-y rounded-xl border bg-surface shadow-card">
        {sessions.map((entry) => (
          <li
            key={entry.id}
            className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5"
          >
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                {entry.device}
                {entry.current && <Badge tone="accent">This device</Badge>}
              </p>
              <p className="mt-1 text-[0.8125rem] leading-relaxed text-muted-foreground tabular-nums">
                {[entry.location, entry.ipAddress].filter(Boolean).join(" · ")}
                {(entry.location || entry.ipAddress) && <br />}
                Last active {lastActiveFormat.format(entry.lastActiveAt)}
              </p>
            </div>
            {!entry.current && (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                className="shrink-0 self-start sm:self-auto"
                aria-label={`Sign out ${entry.device}`}
                onClick={() =>
                  setConfirmation({
                    title: "Sign out this device?",
                    description: `${entry.device} will be signed out of Sermon Tracker and will need to sign in again.`,
                    confirmLabel: "Sign out device",
                    destructive: true,
                    run: () =>
                      attempt(
                        () => revoke(entry.id),
                        `${entry.device} was signed out.`,
                        "That device could not be signed out. Try again.",
                      ),
                  })
                }
              >
                Sign out
              </Button>
            )}
          </li>
        ))}
      </ul>
      {sessions.length === 1 && sessions[0].current && (
        <p className="mt-3 text-[0.8125rem] text-muted-foreground">
          You are not signed in anywhere else.
        </p>
      )}
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
