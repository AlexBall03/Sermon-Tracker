import type { OfflineIdea } from "@/features/sync/ideas";
import type { SyncOutcome } from "@/features/sync/model";
import { openOfflineDb } from "../db";
import type { MutationRecord } from "../model";
import {
  listMutations,
  rebaseFollowing,
  removeMutation,
  resolveMutation,
  retargetMutations,
  type Resolution,
} from "../queue";
import { announceIdeasChange, ideaKind, ideaRecord, withoutDeletion, type KeptIdea } from "./store";

/*
 * What happens to the device's copy of an idea when the server has answered
 * a change to it (Phase 5D.1): once acknowledged (`afterApplied`, called by
 * the engine), and when the person settles a conflict (`settle`).
 */

async function rewrite(owner: string, id: string, next: (kept: KeptIdea) => KeptIdea | null) {
  const db = await openOfflineDb();
  const tx = db.transaction("accountData", "readwrite");
  const stored = await tx.store.get([owner, ideaKind, id]);
  if (stored && stored.owner === owner) {
    const kept = next(stored.data as KeptIdea);
    if (kept) await tx.store.put(ideaRecord(owner, id, kept));
    else await tx.store.delete([owner, ideaKind, id]);
  }
  await tx.done;
  announceIdeasChange();
}

/**
 * A change was acknowledged. The changes queued behind it are made against
 * the revision it produced; when it was the last one, what the device showed
 * is what the server holds, and the copy becomes the server's (its exact
 * dates arrive with the next refresh). A duplicate gives no revision, so
 * the copy is marked to be read again in full.
 */
export async function afterApplied(owner: string, record: MutationRecord, outcome: SyncOutcome) {
  if (record.entityType !== "idea") return;
  const revision = outcome.status === "applied" ? outcome.revision : undefined;
  if (revision !== undefined) await rebaseFollowing(owner, record.entityId, revision);
  const left = await listMutations(owner, { entityId: record.entityId });
  await rewrite(owner, record.entityId, (kept) => {
    if (left.length > 0) {
      return kept.local && revision !== undefined
        ? { ...kept, local: { ...kept.local, revision } }
        : kept;
    }
    if (record.type === "idea.delete" || kept.local?.deleted) return null;
    const settled = kept.local ?? kept.server;
    if (!settled) return null;
    return { server: { ...settled, revision: revision ?? -1 }, local: null };
  });
}

/**
 * The person drops what was changed here about one idea: every change queued
 * about it (each was made on top of the ones before), and the copy that
 * showed them. The idea is then as the account has it: `server` when the
 * server just said what that is, null when it no longer has the idea, and
 * otherwise the last copy downloaded. A change on its way is left to finish.
 */
export async function discardIdeaChanges(
  owner: string,
  entityId: string,
  server?: OfflineIdea | null,
) {
  const queued = await listMutations(owner, { entityId });
  for (const record of queued) {
    if (record.status !== "sending") await removeMutation(owner, record.opId);
  }
  await rewrite(owner, entityId, (kept) => {
    const theirs = server === undefined ? kept.server : server;
    return theirs ? { server: theirs, local: null } : null;
  });
}

/** The person's choices in a conflict about an idea. */
export type Choice =
  /** Send it as it is over the server's newer copy (an edit, or a deletion). */
  | "overwrite"
  /** Keep the server's copy and drop the changes made here to this idea. */
  | "discard"
  /** An edit to an idea deleted elsewhere: save what it says as a new idea. */
  | "saveAsNew"
  /** A deletion refused for preaching history: archive the sermon instead. */
  | "archiveInstead"
  /** A deletion refused for an outline: delete it, outline and all. */
  | "deleteWithOutline"
  /** A capture or edit naming deleted tags: save it without them. */
  | "withoutTags";

/** The choices that make sense for this conflict, in the order offered. */
export function choicesFor(record: MutationRecord): Choice[] {
  const conflict = record.conflict;
  if (!conflict) return [];
  switch (conflict.reason) {
    case "missingTags":
      return ["withoutTags"];
    case "stale":
      return ["overwrite", "discard"];
    case "missing":
      return record.type === "idea.update" ? ["saveAsNew", "discard"] : ["discard"];
    case "preached":
      return ["archiveInstead", "discard"];
    case "outline":
      return ["deleteWithOutline", "discard"];
  }
}

const withoutMissingTags = (record: MutationRecord) => {
  const payload = (record.payload ?? {}) as { tagIds?: unknown };
  const missing = new Set(
    record.conflict?.reason === "missingTags" ? record.conflict.missingTagIds : [],
  );
  const tagIds = Array.isArray(payload.tagIds)
    ? payload.tagIds.filter((id) => !missing.has(id as string))
    : payload.tagIds;
  return { ...payload, tagIds };
};

/**
 * Applies the person's choice. Returns the resolution to send again, or
 * null when the change was dropped. Dropping keeps the server's copy, and
 * drops every change queued here about that idea, since each was made on top
 * of the one dropped.
 */
export async function settle(owner: string, record: MutationRecord, choice: Choice) {
  const conflict = record.conflict;
  if (!conflict) return null;
  const server: OfflineIdea | null = conflict.reason === "stale" ? conflict.server : null;
  let resolution: Resolution | null = null;

  switch (choice) {
    case "withoutTags":
      resolution = { payload: withoutMissingTags(record) };
      break;
    case "overwrite":
      if (!server) return null;
      resolution = { baseRevision: server.revision };
      await rewrite(owner, record.entityId, (kept) => ({
        server,
        local: kept.local ? { ...kept.local, revision: server.revision } : null,
      }));
      break;
    case "deleteWithOutline":
      resolution = { payload: { outline: true } };
      break;
    case "archiveInstead":
      resolution = { type: "idea.archive", payload: null };
      await rewrite(owner, record.entityId, (kept) => {
        const base = kept.local ?? kept.server;
        if (!base) return kept;
        const rest = withoutDeletion(base);
        return {
          ...kept,
          local: {
            ...rest,
            preached: true,
            archivedAt: rest.archivedAt ?? new Date().toISOString(),
          },
        };
      });
      break;
    case "saveAsNew": {
      const id = crypto.randomUUID();
      await retargetMutations(owner, record.entityId, id);
      resolution = { type: "idea.create", entityId: id };
      const db = await openOfflineDb();
      const tx = db.transaction("accountData", "readwrite");
      const stored = await tx.store.get([owner, ideaKind, record.entityId]);
      const kept = stored?.owner === owner ? (stored.data as KeptIdea) : null;
      await tx.store.delete([owner, ideaKind, record.entityId]);
      if (kept?.local) {
        const at = new Date().toISOString();
        await tx.store.put(
          ideaRecord(owner, id, {
            server: null,
            local: {
              ...kept.local,
              id,
              revision: 0,
              createdAt: at,
              updatedAt: at,
              archivedAt: null,
              hasOutline: false,
              preached: false,
            },
          }),
        );
      }
      await tx.done;
      announceIdeasChange();
      break;
    }
    case "discard":
      await discardIdeaChanges(
        owner,
        record.entityId,
        conflict.reason === "missing" ? null : server,
      );
      return null;
  }
  if (resolution) await resolveMutation(owner, record.opId, resolution);
  return resolution;
}
