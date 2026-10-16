"use server";

import { auth, reverificationError } from "@clerk/nextjs/server";

import { getDb } from "@/db";
import { authorize } from "@/features/auth/access";
import { getT } from "@/i18n/server";
import { processDeletion, requestDeletion } from "./deletion";
import { liveDeletionDeps } from "./live";

export type DeleteAccountResult = { ok: boolean; message: string; completed?: boolean };

/**
 * Deletes the caller's own account, after Clerk has confirmed it is them
 * (strict reverification: `useReverification` on the client asks and retries).
 * Once locked, the deletion carries on even if this request does not finish.
 */
export async function deleteMyAccount() {
  const caller = await authorize("active");
  if (!caller.ok) return caller satisfies DeleteAccountResult;
  const { has } = await auth();
  if (!has({ reverification: "strict" })) return reverificationError("strict");

  const t = (await getT("settings")).deleteAccount;
  const db = getDb();
  try {
    const request = await requestDeletion(db, caller.user.id);
    if (!request.ok) {
      return {
        ok: false,
        message: request.reason === "last-admin" ? t.lastAdmin : t.failed,
      } satisfies DeleteAccountResult;
    }
  } catch (error) {
    console.error(
      "Account deletion request failed:",
      error instanceof Error ? error.message : error,
    );
    return { ok: false, message: t.failed } satisfies DeleteAccountResult;
  }

  const outcome = await processDeletion(db, caller.user.id, liveDeletionDeps).catch(
    () => "retry" as const,
  );
  return (
    outcome === "retry"
      ? { ok: true, message: t.pending, completed: false }
      : { ok: true, message: t.deleted, completed: true }
  ) satisfies DeleteAccountResult;
}
