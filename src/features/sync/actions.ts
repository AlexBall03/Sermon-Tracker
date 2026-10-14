"use server";

import { revalidatePath } from "next/cache";

import { getDb } from "@/db";
import { describeDatabaseError } from "@/db/types";
import { authorize } from "@/features/auth/access";
import { getLocale } from "@/i18n/server";
import { routes } from "@/lib/site";
import { applyMutation } from "./apply";
import { syncEnvelopeSchema, type SyncOutcome } from "./model";

/**
 * Applies one change from this device's queue (Phase 5C). The session decides
 * the owner: a change queued under another account is answered
 * `wrongAccount` and nothing is written, and a session that has ended, or an
 * account that may not write, is answered `auth`, so the device waits instead
 * of failing the change. A database error is thrown, which the device treats
 * as passing and tries again.
 */
export async function syncMutation(change: unknown): Promise<SyncOutcome> {
  const actor = await authorize("active");
  if (!actor.ok) return { status: "auth" };
  const parsed = syncEnvelopeSchema.safeParse(change);
  if (!parsed.success) return { status: "rejected", reason: "unsupported" };
  if (parsed.data.owner !== actor.user.id) return { status: "wrongAccount" };

  try {
    const outcome = await applyMutation(getDb(), actor.user.id, parsed.data, await getLocale());
    if (outcome.status === "applied") {
      revalidatePath(routes.sermonIdeas);
      revalidatePath(routes.dashboard);
      if (parsed.data.type !== "idea.create") {
        revalidatePath(`${routes.library}/${parsed.data.entityId}`);
      }
    }
    return outcome;
  } catch (error) {
    console.error("Sync failed:", describeDatabaseError(error));
    throw new Error("Sync failed");
  }
}
