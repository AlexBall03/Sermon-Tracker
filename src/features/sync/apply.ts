import { and, eq, inArray } from "drizzle-orm";

import { syncOperations, tags } from "@/db/schema";
import type { Database } from "@/db/types";
import * as ideas from "@/features/ideas/ideas";
import { ideaSchemas } from "@/features/ideas/schemas";
import { UnknownTagError } from "@/features/ideas/tags";
import type { Locale } from "@/i18n/locales";
import type { SyncEnvelope, SyncOutcome, SyncType } from "./model";

/*
 * Applies one change from a device's queue for its owner, exactly once.
 *
 * The change and its row in `sync_operations` are written in one
 * transaction: if the row is already there the change was applied before and
 * the answer is `duplicate`, with nothing written; if the change cannot be
 * applied, the transaction is rolled back and neither is written, so trying
 * again later is still possible. The owner is always the session's, never
 * the device's word for it (the action checks that the two agree).
 *
 * Each type has a handler. A handler for a change to something that already
 * exists (Phase 5D) compares the change's `baseRevision` with the stored one
 * inside this transaction, with the row locked, and answers `conflict` with
 * the server's copy rather than writing over it.
 */

type Handler = (
  tx: Database,
  ownerId: string,
  change: SyncEnvelope,
  locale: Locale,
) => Promise<SyncOutcome>;

/** Thrown inside the transaction to roll it back and answer `outcome`. */
class Refused extends Error {
  constructor(readonly outcome: SyncOutcome) {
    super(outcome.status);
  }
}

const handlers: Record<SyncType, Handler> = {
  async "idea.create"(tx, ownerId, change, locale) {
    const parsed = ideaSchemas(locale).ideaInput.safeParse(change.payload);
    if (!parsed.success) {
      return {
        status: "rejected",
        reason: "validation",
        message: parsed.error.issues[0]?.message,
      };
    }
    try {
      const idea = await ideas.createIdea(tx, ownerId, parsed.data, change.entityId);
      // The ID is someone else's idea: this capture can never be saved under it.
      if (!idea) return { status: "rejected", reason: "taken" };
      return { status: "applied", entityId: idea.id };
    } catch (error) {
      if (!(error instanceof UnknownTagError)) throw error;
      const wanted = parsed.data.tagIds ?? [];
      const found = wanted.length
        ? await tx
            .select({ id: tags.id })
            .from(tags)
            .where(and(eq(tags.ownerId, ownerId), inArray(tags.id, wanted)))
        : [];
      const kept = new Set(found.map((tag) => tag.id));
      return {
        status: "conflict",
        conflict: { reason: "missingTags", missingTagIds: wanted.filter((id) => !kept.has(id)) },
      };
    }
  },
};

export async function applyMutation(
  db: Database,
  ownerId: string,
  change: SyncEnvelope,
  locale: Locale,
): Promise<SyncOutcome> {
  const handler = handlers[change.type];
  if (!handler) return { status: "rejected", reason: "unsupported" };
  try {
    return await db.transaction(async (tx) => {
      const [recorded] = await tx
        .insert(syncOperations)
        .values({ ownerId, opId: change.opId, type: change.type, entityId: change.entityId })
        .onConflictDoNothing()
        .returning({ opId: syncOperations.opId });
      if (!recorded) {
        const [first] = await tx
          .select({ entityId: syncOperations.entityId })
          .from(syncOperations)
          .where(and(eq(syncOperations.ownerId, ownerId), eq(syncOperations.opId, change.opId)));
        return { status: "duplicate", entityId: first?.entityId ?? change.entityId };
      }
      const outcome = await handler(tx, ownerId, change, locale);
      if (outcome.status !== "applied") throw new Refused(outcome);
      return outcome;
    });
  } catch (error) {
    if (error instanceof Refused) return error.outcome;
    throw error;
  }
}
