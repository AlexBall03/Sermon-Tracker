"use client";

import { useState } from "react";
import { LoaderCircle } from "lucide-react";

import { ActionStatus } from "@/components/ui/action-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, type Confirmation } from "@/components/ui/confirm-dialog";
import { attempt, useAccountAction, type AccountUser } from "../hooks/use-account-action";
import { useEmailAddresses, type EmailEntry } from "../hooks/use-email-addresses";
import { emailSchema, verificationCodeSchema } from "../schemas";
import { TextField } from "./text-field";

export function EmailAddresses({ user }: { user: AccountUser }) {
  const email = useEmailAddresses(user);
  const { busy, result, run } = useAccountAction();
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [addError, setAddError] = useState<string>();
  const [codeError, setCodeError] = useState<string>();

  // Only an address still awaiting its code keeps the code form open.
  const verifying = email.emails.find((entry) => entry.id === verifyingId && !entry.verified);

  function onAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const parsed = emailSchema.safeParse(String(new FormData(form).get("email") ?? ""));
    if (!parsed.success) {
      setAddError(parsed.error.issues[0]?.message);
      return;
    }
    const address = parsed.data;
    if (email.emails.some((entry) => entry.address.toLowerCase() === address.toLowerCase())) {
      setAddError("That address is already on your account.");
      return;
    }
    setAddError(undefined);
    void run(
      async () => {
        setVerifyingId(await email.add(address));
        form.reset();
      },
      `We sent a 6-digit code to ${address}.`,
      "That address could not be added. Try again.",
    );
  }

  function sendCode(entry: EmailEntry) {
    setCodeError(undefined);
    void run(
      async () => {
        await email.sendCode(entry.id);
        setVerifyingId(entry.id);
      },
      `We sent a 6-digit code to ${entry.address}.`,
      "The code could not be sent. Try again.",
    );
  }

  function onVerify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!verifying) return;
    const parsed = verificationCodeSchema.safeParse(
      String(new FormData(event.currentTarget).get("code") ?? ""),
    );
    if (!parsed.success) {
      setCodeError(parsed.error.issues[0]?.message);
      return;
    }
    setCodeError(undefined);
    void run(
      async () => {
        await email.verify(verifying.id, parsed.data);
        setVerifyingId(null);
      },
      `${verifying.address} is verified.`,
      "That code could not be checked. Try again.",
    );
  }

  return (
    <>
      <ul className="divide-y rounded-xl border bg-surface shadow-card">
        {email.emails.map((entry) => (
          <li
            key={entry.id}
            className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{entry.address}</p>
              <p className="mt-1.5 flex flex-wrap gap-1.5">
                {entry.primary && <Badge tone="accent">Primary</Badge>}
                <Badge tone={entry.verified ? "muted" : "danger"}>
                  {entry.verified ? "Verified" : "Unverified"}
                </Badge>
              </p>
            </div>
            {!entry.primary && (
              <div className="flex shrink-0 gap-2">
                {entry.verified ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    aria-label={`Make ${entry.address} your primary address`}
                    onClick={() =>
                      void run(
                        () => email.makePrimary(entry.id),
                        `${entry.address} is now your primary address.`,
                        "Your primary address could not be changed. Try again.",
                      )
                    }
                  >
                    Make primary
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    aria-label={`Verify ${entry.address}`}
                    onClick={() => sendCode(entry)}
                  >
                    Verify
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  className="text-destructive hover:bg-destructive/10"
                  aria-label={`Remove ${entry.address}`}
                  onClick={() =>
                    setConfirmation({
                      title: "Remove this email address?",
                      description: `${entry.address} will be taken off your account and can no longer be used to sign in.`,
                      confirmLabel: "Remove address",
                      destructive: true,
                      run: () =>
                        attempt(
                          () => email.remove(entry.id),
                          `${entry.address} was removed.`,
                          "That address could not be removed. Try again.",
                        ),
                    })
                  }
                >
                  Remove
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {verifying ? (
        <form onSubmit={onVerify} noValidate className="mt-5">
          <TextField
            id="email-code"
            name="code"
            label={`Code sent to ${verifying.address}`}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            // The form replaces the one the person was just using, so focus follows it.
            autoFocus
            error={codeError}
            hint="The code expires after a few minutes."
            className="max-w-xs"
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="submit" disabled={busy} aria-busy={busy}>
              {busy && <LoaderCircle className="animate-spin" aria-hidden />}
              {busy ? "Working…" : "Verify address"}
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => sendCode(verifying)}>
              Send a new code
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setVerifyingId(null)}>
              Not now
            </Button>
          </div>
        </form>
      ) : (
        <form
          onSubmit={onAdd}
          noValidate
          className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-start"
        >
          <TextField
            id="new-email"
            name="email"
            type="email"
            label="Add an email address"
            autoComplete="email"
            placeholder="name@example.com"
            error={addError}
            className="flex-1"
          />
          {/* Lines the button up with the input, below the label. */}
          <Button type="submit" className="sm:mt-[1.375rem]" disabled={busy} aria-busy={busy}>
            {busy && <LoaderCircle className="animate-spin" aria-hidden />}
            {busy ? "Working…" : "Add address"}
          </Button>
        </form>
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
