"use client";

import { useState } from "react";
import { LoaderCircle } from "lucide-react";

import { ActionStatus } from "@/components/ui/action-status";
import { Button } from "@/components/ui/button";
import { useAccountAction, type AccountUser } from "../hooks/use-account-action";
import { usePassword } from "../hooks/use-password";
import { fieldErrors, passwordSchema } from "../schemas";
import { TextField } from "./text-field";

/** Change the password, or set a first one on an account that signs in another way. */
export function PasswordForm({ user }: { user: AccountUser }) {
  const password = usePassword(user);
  const { busy, result, run } = useAccountAction();
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { hasPassword } = password;

  function close() {
    setOpen(false);
    setErrors({});
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const parsed = passwordSchema.safeParse({
      currentPassword: String(data.get("currentPassword") ?? ""),
      newPassword: String(data.get("newPassword") ?? ""),
      confirmPassword: String(data.get("confirmPassword") ?? ""),
    });
    const problems = parsed.success ? {} : fieldErrors(parsed.error);
    if (hasPassword && !data.get("currentPassword")) {
      problems.currentPassword = "Enter your current password.";
    }
    if (!parsed.success || Object.keys(problems).length > 0) {
      setErrors(problems);
      return;
    }
    setErrors({});
    void run(
      async () => {
        await password.change({
          currentPassword: hasPassword ? parsed.data.currentPassword : undefined,
          newPassword: parsed.data.newPassword,
          signOutOfOtherSessions: data.get("signOutOthers") === "on",
        });
        close();
      },
      hasPassword ? "Your password has been changed." : "Your password has been set.",
      "Your password could not be saved. Try again.",
    );
  }

  if (!open) {
    return (
      <div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {hasPassword
            ? "A password is set on your account."
            : "You have not set a password. You sign in with a connected account, and can add a password as a second way in."}
        </p>
        <Button
          variant="outline"
          className="mt-4"
          aria-expanded={false}
          aria-controls="password-form"
          onClick={() => setOpen(true)}
        >
          {hasPassword ? "Change password" : "Set a password"}
        </Button>
        <ActionStatus result={result} />
      </div>
    );
  }

  return (
    <form id="password-form" onSubmit={onSubmit} noValidate className="max-w-sm">
      <div className="grid gap-4">
        {hasPassword && (
          <TextField
            id="current-password"
            name="currentPassword"
            type="password"
            label="Current password"
            autoComplete="current-password"
            autoFocus
            error={errors.currentPassword}
          />
        )}
        <TextField
          id="new-password"
          name="newPassword"
          type="password"
          label="New password"
          autoComplete="new-password"
          autoFocus={!hasPassword}
          error={errors.newPassword}
          hint="At least 8 characters."
        />
        <TextField
          id="confirm-password"
          name="confirmPassword"
          type="password"
          label="Confirm new password"
          autoComplete="new-password"
          error={errors.confirmPassword}
        />
        <label className="flex min-h-6 items-start gap-2.5 text-sm leading-6 pointer-coarse:min-h-11 pointer-coarse:items-center">
          <input
            type="checkbox"
            name="signOutOthers"
            defaultChecked
            className="mt-1 size-4 shrink-0 accent-primary pointer-coarse:mt-0"
          />
          Sign out of my other devices
        </label>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button type="submit" disabled={busy} aria-busy={busy}>
          {busy && <LoaderCircle className="animate-spin" aria-hidden />}
          {busy ? "Saving…" : hasPassword ? "Change password" : "Set password"}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={close}>
          Cancel
        </Button>
      </div>
      <ActionStatus result={result} />
    </form>
  );
}
