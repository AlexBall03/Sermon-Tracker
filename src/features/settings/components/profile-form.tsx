"use client";

import { useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";

import { useLeaveGuard } from "@/components/layout/leave-guard";
import { ActionStatus } from "@/components/ui/action-status";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";
import { useAccountAction, type AccountUser } from "../hooks/use-account-action";
import { useProfile } from "../hooks/use-profile";
import { fieldErrors, nameSchema } from "../schemas";
import { TextField } from "./text-field";

export function ProfileForm({ user }: { user: AccountUser }) {
  const profile = useProfile(user);
  const { busy, result, run } = useAccountAction();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const form = useRef<HTMLFormElement>(null);
  // A name typed and not yet saved is held: leaving for another settings page asks first.
  const [dirty, setDirty] = useState(false);
  const guard = useLeaveGuard(dirty && !busy, useT("settings").unsaved, () => {
    form.current?.reset();
    setErrors({});
    setDirty(false);
  });

  function measure(element: HTMLFormElement) {
    const data = new FormData(element);
    setDirty(
      String(data.get("firstName") ?? "").trim() !== profile.firstName ||
        String(data.get("lastName") ?? "").trim() !== profile.lastName,
    );
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const parsed = nameSchema.safeParse({
      firstName: String(data.get("firstName") ?? ""),
      lastName: String(data.get("lastName") ?? ""),
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    void run(
      () => profile.saveName(parsed.data),
      "",
      "Your name could not be saved. Try again.",
    ).then((outcome) => outcome.ok && setDirty(false));
  }

  return (
    <>
      {guard.dialog}
      <form
        ref={form}
        onSubmit={onSubmit}
        onChange={(event) => measure(event.currentTarget)}
        noValidate
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="first-name"
            name="firstName"
            label="First name"
            autoComplete="given-name"
            defaultValue={profile.firstName}
            error={errors.firstName}
            maxLength={64}
          />
          <TextField
            id="last-name"
            name="lastName"
            label="Last name"
            autoComplete="family-name"
            defaultValue={profile.lastName}
            error={errors.lastName}
            maxLength={64}
          />
        </div>
        <Button type="submit" className="mt-5" disabled={busy} aria-busy={busy}>
          {busy && <LoaderCircle className="animate-spin" aria-hidden />}
          {busy ? "Saving…" : "Save name"}
        </Button>
        <ActionStatus result={result} />
      </form>
    </>
  );
}
