"use client";

import { useRef } from "react";
import { LoaderCircle } from "lucide-react";

import { ActionStatus } from "@/components/ui/action-status";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAccountAction, type AccountUser } from "../hooks/use-account-action";
import { useProfile } from "../hooks/use-profile";
import { avatarTypes, validateAvatar } from "../schemas";

export function AvatarField({ user }: { user: AccountUser }) {
  const profile = useProfile(user);
  const { busy, result, run, setResult } = useAccountAction();
  const input = useRef<HTMLInputElement>(null);

  function onChoose(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Cleared so choosing the same file again still fires a change.
    event.target.value = "";
    if (!file) return;
    const problem = validateAvatar(file);
    if (problem) {
      setResult({ ok: false, message: problem });
      return;
    }
    void run(
      () => profile.setPicture(file),
      "Your picture has been updated.",
      "Your picture could not be updated. Try again.",
    );
  }

  return (
    <div>
      <div className="flex items-center gap-5">
        <Avatar
          imageUrl={profile.imageUrl}
          initials={profile.initials}
          className="size-16 border text-lg"
        />
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              aria-busy={busy}
              onClick={() => input.current?.click()}
            >
              {busy && <LoaderCircle className="animate-spin" aria-hidden />}
              {busy ? "Working…" : profile.imageUrl ? "Change picture" : "Upload a picture"}
            </Button>
            {profile.imageUrl && (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() =>
                  void run(
                    () => profile.removePicture(),
                    "Your picture has been removed.",
                    "Your picture could not be removed. Try again.",
                  )
                }
              >
                Remove
              </Button>
            )}
          </div>
          <p className="mt-2 text-[0.8125rem] text-muted-foreground">
            PNG, JPEG, WebP, or GIF, up to 10 MB.
          </p>
        </div>
      </div>
      <input
        ref={input}
        type="file"
        hidden
        accept={avatarTypes.join(",")}
        onChange={onChoose}
        data-testid="avatar-input"
      />
      <ActionStatus result={result} />
    </div>
  );
}
