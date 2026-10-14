import { and, eq, inArray } from "drizzle-orm";

import { ideas as ideaRows, syncOperations, tags } from "@/db/schema";
import type { Database } from "@/db/types";
import * as ideas from "@/features/ideas/ideas";
import { ideaSchemas } from "@/features/ideas/schemas";
import { UnknownTagError } from "@/features/ideas/tags";
import { outlineIdsForSermons } from "@/features/outlines/outlines";
import type { Locale } from "@/i18n/locales";
import {
  ideaDeletePayloadSchema,
  type SyncEnvelope,
  type SyncOutcome,
  type SyncType,
} from "./model";
import { offlineIdeas } from "./snapshot";

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
 * Each type has a handler. A change to an idea that already exists (Phase
 * 5D.1) is checked against `ideas.revision` inside this transaction, with the
 * row locked: an edit or a deletion made on an older revision is a `stale`
 * conflict carrying the server's copy, never an overwrite. Archiving and
 * restoring say what the idea should be and need no revision. A deletion
 * keeps every server rule (preaching history, an outline the person was not
 * told of), each answered as a conflict for the person to settle.
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

/** The answer to a change naming tags that are not (or no longer) the owner's. */
async function missingTags(tx: Database, ownerId: string, wanted: string[]): Promise<SyncOutcome> {
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

/** The idea as the server holds it now, for a `stale` conflict. */
async function stale(tx: Database, ownerId: string, id: string): Promise<SyncOutcome> {
  const [server] = await offlineIdeas(tx, ownerId, [id]);
  return server
    ? { status: "conflict", conflict: { reason: "stale", server } }
    : { status: "conflict", conflict: { reason: "missing" } };
}

const missing: SyncOutcome = { status: "conflict", conflict: { reason: "missing" } };

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
      return { status: "applied", entityId: idea.id, revision: idea.revision };
    } catch (error) {
      if (!(error instanceof UnknownTagError)) throw error;
      return missingTags(tx, ownerId, parsed.data.tagIds ?? []);
    }
  },

  // The whole draft, made against `baseRevision`: written only while the idea is still there.
  async "idea.update"(tx, ownerId, change, locale) {
    const parsed = ideaSchemas(locale).ideaInput.safeParse(change.payload);
    if (!parsed.success || change.baseRevision === undefined) {
      return {
        status: "rejected",
        reason: "validation",
        message: parsed.success ? "baseRevision" : parsed.error.issues[0]?.message,
      };
    }
    try {
      const outcome = await ideas.updateIdeaAt(
        tx,
        ownerId,
        change.entityId,
        parsed.data,
        change.baseRevision,
      );
      if (outcome.status === "missing") return missing;
      if (outcome.status === "stale") return stale(tx, ownerId, change.entityId);
      return { status: "applied", entityId: change.entityId, revision: outcome.idea.revision };
    } catch (error) {
      if (!(error instanceof UnknownTagError)) throw error;
      return missingTags(tx, ownerId, parsed.data.tagIds ?? []);
    }
  },

  // Archiving and restoring say what the idea should be, so saying it twice, or late, is harmless.
  async "idea.archive"(tx, ownerId, change) {
    const idea = await ideas.archiveIdea(tx, ownerId, change.entityId);
    return idea ? { status: "applied", entityId: idea.id, revision: idea.revision } : missing;
  },
  async "idea.restore"(tx, ownerId, change) {
    const idea = await ideas.restoreIdea(tx, ownerId, change.entityId);
    return idea ? { status: "applied", entityId: idea.id, revision: idea.revision } : missing;
  },

  // Never erases what the person did not see: a change made since, or an outline they were not told of.
  async "idea.delete"(tx, ownerId, change) {
    const payload = ideaDeletePayloadSchema.safeParse(change.payload ?? undefined);
    if (!payload.success || change.baseRevision === undefined) {
      return { status: "rejected", reason: "validation" };
    }
    const [row] = await tx
      .select({ revision: ideaRows.revision })
      .from(ideaRows)
      .where(and(eq(ideaRows.id, change.entityId), eq(ideaRows.ownerId, ownerId)))
      .for("update");
    // Gone already: there is nothing left to delete, and nothing to lose.
    if (!row) return { status: "applied", entityId: change.entityId };
    if (row.revision !== change.baseRevision) return stale(tx, ownerId, change.entityId);
    if (!payload.data.outline) {
      const outlines = await outlineIdsForSermons(tx, ownerId, [change.entityId]);
      if (outlines.size > 0) return { status: "conflict", conflict: { reason: "outline" } };
    }
    const outcome = await ideas.deleteIdea(tx, ownerId, change.entityId);
    if (outcome === "preached") return { status: "conflict", conflict: { reason: "preached" } };
    return { status: "applied", entityId: change.entityId };
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
