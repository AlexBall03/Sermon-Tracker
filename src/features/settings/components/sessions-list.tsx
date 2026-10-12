"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";

import { ActionStatus } from "@/components/ui/action-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, type Confirmation } from "@/components/ui/confirm-dialog";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { attempt, useAccountAction, type AccountUser } from "../hooks/use-account-action";
import { useSessions, type SessionEntry } from "../hooks/use-sessions";

// Sessions load in the browser, so the reader's own locale and zone are safe here.
const lastActiveFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

/** This device and the three used most recently; the rest wait behind "Show more". */
const visibleCount = 4;

/** Where the account is signed in, with a way to sign out of the other devices. */
export function SessionsList({ user }: { user: AccountUser }) {
  const t = useT("settings").devices;
  const { status, sessions, retry, revoke, revokeOthers } = useSessions(user);
  const { busy, result, run } = useAccountAction();
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [expanded, setExpanded] = useState(false);
  const restId = useId();

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

  const shown = sessions.slice(0, visibleCount);
  const rest = sessions.slice(visibleCount);
  const others = sessions.filter((entry) => !entry.current).length;

  const row = (entry: SessionEntry) => (
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
  );

  return (
    <>
      {/* One card: the rows past the first few open and close inside it. */}
      <div className="overflow-hidden rounded-xl border bg-surface shadow-card">
        <ul className="divide-y">{shown.map(row)}</ul>
        {rest.length > 0 && (
          <div
            id={restId}
            inert={!expanded}
            className={cn(
              "grid transition-[grid-template-rows] duration-300 ease-in-out motion-reduce:transition-none",
              expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
            )}
          >
            {/* Each row carries its own line, so nothing shows while the list is shut. */}
            <ul className="min-h-0 overflow-hidden [&>li]:border-t">{rest.map(row)}</ul>
          </div>
        )}
      </div>
      {others > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          {rest.length > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={expanded}
              aria-controls={restId}
              onClick={() => setExpanded((open) => !open)}
            >
              <ChevronDown
                aria-hidden
                className={cn(
                  "transition-transform duration-300 motion-reduce:transition-none",
                  expanded && "rotate-180",
                )}
              />
              {expanded ? t.showFewer : t.showMore(rest.length)}
            </Button>
          ) : (
            <span />
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() =>
              setConfirmation({
                title: t.signOutOthersTitle,
                description: t.signOutOthersDescription(others),
                confirmLabel: t.signOutOthersConfirm,
                destructive: true,
                run: () => attempt(revokeOthers, t.signedOutOthers, t.signOutOthersFailed),
              })
            }
          >
            {t.signOutOthers}
          </Button>
        </div>
      )}
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
