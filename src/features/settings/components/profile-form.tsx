"use client";

import { useState } from "react";
import { LoaderCircle } from "lucide-react";

import { ActionStatus } from "@/components/ui/action-status";
import { Button } from "@/components/ui/button";
import { useAccountAction, type AccountUser } from "../hooks/use-account-action";
import { useProfile } from "../hooks/use-profile";
import { fieldErrors, nameSchema } from "../schemas";
import { TextField } from "./text-field";

export function ProfileForm({ user }: { user: AccountUser }) {
  const profile = useProfile(user);
  const { busy, result, run } = useAccountAction();
  const [errors, setErrors] = useState<Record<string, string>>({});

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
    void run(() => profile.saveName(parsed.data), "", "Your name could not be saved. Try again.");
  }

  return (
    <form onSubmit={onSubmit} noValidate>
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
  );
}
