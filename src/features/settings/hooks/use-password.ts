"use client";

import { useReverification } from "@clerk/nextjs";

import type { AccountUser } from "./use-account-action";

type PasswordChange = {
  /** Required by the provider when the account already has a password. */
  currentPassword?: string;
  newPassword: string;
  signOutOfOtherSessions: boolean;
};

/**
 * Sets or changes the password through the provider, which checks the current
 * password, its strength rules, and whether the session must be re-verified.
 */
export function usePassword(user: AccountUser) {
  const update = useReverification((change: PasswordChange) => user.updatePassword(change));

  return {
    hasPassword: user.passwordEnabled,
    async change(change: PasswordChange) {
      await update(change);
      await user.reload();
    },
  };
}
