"use client";

import { useReverification } from "@clerk/nextjs";

import { initialsOf } from "@/components/layout/account-menu";
import { updateProfileName } from "../actions";
import type { NameInput } from "../schemas";
import type { AccountUser } from "./use-account-action";

/** Name and picture. The name is saved on the server; the picture is uploaded to the provider. */
export function useProfile(user: AccountUser) {
  const setProfileImage = useReverification((file: File | null) => user.setProfileImage({ file }));
  const email = user.primaryEmailAddress?.emailAddress ?? "";

  return {
    firstName: user.firstName ?? "",
    lastName: user.lastName ?? "",
    imageUrl: user.hasImage ? user.imageUrl : null,
    initials: initialsOf(user.fullName || email || "Account"),
    async saveName(input: NameInput) {
      const result = await updateProfileName(input);
      if (result.ok) await user.reload();
      return result;
    },
    async setPicture(file: File) {
      await setProfileImage(file);
      await user.reload();
    },
    async removePicture() {
      await setProfileImage(null);
      await user.reload();
    },
  };
}
