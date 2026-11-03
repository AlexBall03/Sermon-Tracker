import type { SyncConflict, SyncOutcome } from "@/features/sync/model";
import {
  entryOf,
  outlineShapeTypes,
  type OfflineOutline,
  type OutlinePayload,
} from "@/features/sync/outlines";
import { openOfflineDb } from "../db";
import type { MutationRecord } from "../model";
import {
  announceQueueChange,
  byAge,
  listMutations,
  rebaseFollowing,
  resolveMutation,
  type Alongside,
  type Resolution,
} from "../queue";
import {
  announceOutlinesChange,
  authorityOnly,
  getKeptOutline,
  isAuthoritative,
  outlineKind,
  outlineRecord,
  rewriteOutline,
  withAuthority,
  type KeptOutline,
} from "./store";

/*
 * What happens to the device's copy of an outline when the server has
 * answered a change to it (Phase 5D.2): once acknowledged (`afterApplied`,
 * called by the engine), and when the person settles a conflict (`settle`).
 *
 * An outline counts two things apart, as the server does: its shape (the
 * outline's revision) and each entry's words and passages (the entry's).
 * A change acknowledged at a revision moves only the changes behind it that
 * the same revision counts.
 */

const isShape = (record: MutationRecord) => outlineShapeTypes.includes(record.type as never);
const isWords = (record: MutationRecord) =>
  record.type === "outline.entry.update" || record.type === "outline.entry.references";

/**
 * A change was acknowledged. The changes queued behind it that it counts are
 * made against the revision it produced; when it was the last one, what the
 * device showed is what the server holds, and the copy becomes the server's,
 * to be read again in full by the next download (its exact revisions and
 * dates are the server's to say).
 */
export async function afterApplied(owner: string, record: MutationRecord, outcome: SyncOutcome) {
  if (record.entityType !== "outline") return;
  const revision = outcome.status === "applied" ? outcome.revision : undefined;
  if (revision !== undefined) {
    if (isShape(record)) {
      await rebaseFollowing(owner, record.entityId, revision, isShape);
    } else if (isWords(record)) {
      const entryId = entryOf(record.payload);
      await rebaseFollowing(
        owner,
        record.entityId,
        revision,
        (other) => isWords(other) && entryOf(other.payload) === entryId,
      );
    }
  }
  const left = await listMutations(owner, { entityId: record.entityId });
  if (left.length > 0) return;
  await rewriteOutline(owner, record.entityId, (kept) => ({
    server: kept.local ?? kept.server,
    local: null,
    behind: true,
  }));
}

/**
 * A `documentAuthoritative` answer to a queued change to an outline (A2.3D):
 * what it teaches the device, written in the same transaction as the record's
 * conflict (queue.ts, `Alongside`). The outline is marked a sermon document,
 * its copies and every queued change kept as they are; other tabs are told
 * only once both are committed.
 */
export function authorityAlongside(
  owner: string,
  record: MutationRecord,
  conflict: SyncConflict,
): Alongside | undefined {
  if (record.entityType !== "outline" || conflict.reason !== "documentAuthoritative") return;
  if (record.owner !== owner) return;
  return {
    write: async (data) => {
      const stored = await data.get([owner, outlineKind, record.entityId]);
      const kept = stored && stored.owner === owner ? (stored.data as KeptOutline) : null;
      if (isAuthoritative(kept)) return;
      await data.put(
        outlineRecord(
          owner,
          record.entityId,
          kept ? { ...kept, documentAuthoritative: true } : authorityOnly(),
        ),
      );
    },
    committed: announceOutlinesChange,
  };
}

/** Why changes could not be dropped: one of them is on its way to the server. */
export type DropResult = "dropped" | "sending";

/**
 * Drops some of an outline's queued changes and rewrites its copy, in ONE
 * transaction over the queue and the copy, so another tab or the sync engine
 * never sees one without the other. `which` picks the changes from the
 * outline's queue as it is inside that transaction (oldest first); if any of
 * them is on its way, nothing at all is written (`sending`): its answer may
 * still come, and dropping it now could leave the copy saying what the server
 * holds differently. `rewrite` is given the copy and how many changes are
 * left; what the device knows of the outline's authority is kept
 * (`withAuthority`), and an editor open on it starts again from it.
 */
async function dropChanges(
  owner: string,
  outlineId: string,
  which: (queued: MutationRecord[]) => MutationRecord[],
  rewrite: (kept: KeptOutline, left: number) => KeptOutline | null,
): Promise<DropResult> {
  const db = await openOfflineDb();
  const tx = db.transaction(["mutations", "accountData"], "readwrite");
  const mutations = tx.objectStore("mutations");
  const data = tx.objectStore("accountData");
  try {
    const queued = (await mutations.index("owner").getAll(owner))
      .filter((record) => record.entityId === outlineId && record.status !== "done")
      .sort(byAge);
    const chosen = which(queued);
    if (chosen.some((record) => record.status === "sending")) {
      await tx.done;
      return "sending";
    }
    for (const record of chosen) await mutations.delete(record.opId);
    const stored = await data.get([owner, outlineKind, outlineId]);
    if (stored && stored.owner === owner) {
      const kept = stored.data as KeptOutline;
      const written = withAuthority(kept, rewrite(kept, queued.length - chosen.length));
      if (written) {
        await data.put(
          outlineRecord(owner, outlineId, { ...written, generation: (kept.generation ?? 0) + 1 }),
        );
      } else {
        await data.delete([owner, outlineKind, outlineId]);
      }
    }
    await tx.done;
  } catch (error) {
    try {
      tx.abort();
    } catch {
      // Already finished or aborted: nothing was written past the failure.
    }
    await tx.done.catch(() => {});
    throw error;
  }
  announceQueueChange();
  announceOutlinesChange();
  return "dropped";
}

/**
 * The copy once changes were dropped: with nothing left queued it is the
 * server's again (behind, until the next download), and otherwise it keeps
 * what is left.
 */
const afterDropping =
  (change?: (outline: OfflineOutline) => OfflineOutline) =>
  (kept: KeptOutline, left: number): KeptOutline | null =>
    left === 0 || !kept.local
      ? kept.server
        ? { server: kept.server, local: null, behind: true }
        : null
      : { ...kept, local: change ? change(kept.local) : kept.local, behind: true };

/**
 * The person drops every change made here to one outline, in one transaction
 * (`dropChanges`): all of them and the copy's changes, or nothing while one is
 * on its way (`sending`). The copy is then the last one downloaded, read again
 * by the next download; an outline gone from the account is forgotten. One
 * known to be a sermon document stays known (A2.3D): discarding never opens
 * its legacy copy to editing again.
 */
export function discardOutlineChanges(
  owner: string,
  outlineId: string,
  forget = false,
): Promise<DropResult> {
  return dropChanges(
    owner,
    outlineId,
    (queued) => queued,
    (kept) => (forget || !kept.server ? null : { server: kept.server, local: null, behind: true }),
  );
}

/** The changes queued after `record` about the same entry, from the outline's queue. */
function behindIn(
  queued: MutationRecord[],
  record: MutationRecord,
  which: (other: MutationRecord) => boolean,
) {
  const entryId = entryOf(record.payload);
  const at = queued.findIndex((other) => other.opId === record.opId);
  return queued.slice(at + 1).filter((other) => entryOf(other.payload) === entryId && which(other));
}

/** `record` itself, while it is still queued, and those of `behind` picked. */
const itAnd =
  (record: MutationRecord, behind?: (other: MutationRecord) => boolean) =>
  (queued: MutationRecord[]) => {
    const self = queued.filter((other) => other.opId === record.opId);
    return behind ? [...self, ...behindIn(queued, record, behind)] : self;
  };

/** The person's choices in a conflict about an outline. */
export type OutlineChoice =
  /** A change of shape made on an older outline: make it on the outline as it is now. */
  | "applyMine"
  /** Words or passages changed in both places: send these over the others. */
  | "keepMine"
  /** Keep the account's version and drop what was changed here that it disagreed with. */
  | "useAccount"
  /** Words or passages for an entry removed elsewhere: add them as a new point, last. */
  | "addAsPoint"
  /** An addition with nowhere to go: add it as a point, last. */
  | "addAtEnd"
  /** Drop this change, and the changes behind it made on top of it. */
  | "discard";

/**
 * The choices that make sense for this conflict, in the order offered. Once
 * the device knows the outline is a sermon document (`authoritative`,
 * A2.3D), nothing may be sent to its legacy copy again: discarding is the one
 * choice left, whatever the conflict was.
 */
export function outlineChoicesFor(record: MutationRecord, authoritative = false): OutlineChoice[] {
  const conflict = record.conflict;
  if (!conflict) return [];
  if (authoritative) return ["discard"];
  switch (conflict.reason) {
    case "outlineStale":
      return ["applyMine", "useAccount"];
    case "entryStale":
      return ["keepMine", "useAccount"];
    case "entryMissing":
      return isWords(record) ? ["addAsPoint", "discard"] : ["discard"];
    case "placement":
      return record.type === "outline.entry.add" ? ["addAtEnd", "discard"] : ["discard"];
    // The outline is a sermon document now (A2.2). Carrying the change into it
    // is A2.3's; until then the change is kept, with its text, until discarded.
    case "documentAuthoritative":
      return ["discard"];
    default:
      return ["discard"];
  }
}

/**
 * Applies the person's choice. Returns the resolution to send again, or null
 * when the change was dropped or the choice is not open any more. Once the
 * device knows the outline is a sermon document (A2.3D), only "discard" is:
 * no choice puts a legacy change back in line. (The server still refuses one
 * that raced past this check, as it refuses every legacy write then.)
 */
export async function settleOutline(owner: string, record: MutationRecord, choice: OutlineChoice) {
  const conflict = record.conflict;
  if (!conflict) return null;
  const outlineId = record.entityId;
  const entryId = entryOf(record.payload);
  let resolution: Resolution | null = null;
  if (choice !== "discard" && isAuthoritative(await getKeptOutline(owner, outlineId))) {
    return null;
  }

  switch (choice) {
    case "applyMine":
      if (conflict.reason !== "outlineStale") return null;
      resolution = { baseRevision: conflict.revision };
      break;

    case "keepMine": {
      if (conflict.reason !== "entryStale") return null;
      const { entry } = conflict;
      // Made now against what the server holds, so nothing there is mistaken for unchanged.
      if (record.type === "outline.entry.references") {
        const payload = record.payload as OutlinePayload<"outline.entry.references">;
        resolution = {
          payload: { ...payload, base: entry.references },
          baseRevision: entry.revision,
        };
      } else {
        const payload = record.payload as OutlinePayload<"outline.entry.update">;
        resolution = {
          payload: {
            ...payload,
            base: {
              ...("title" in payload ? { title: entry.title } : {}),
              ...("notes" in payload ? { notes: entry.notes } : {}),
            },
          },
          baseRevision: entry.revision,
        };
      }
      break;
    }

    case "useAccount":
      if (conflict.reason === "entryStale") {
        const { entry, fields } = conflict;
        await dropChanges(
          owner,
          outlineId,
          itAnd(record, (other) => other.type === record.type),
          afterDropping((outline) => ({
            ...outline,
            entries: outline.entries.map((row) =>
              row.id !== entryId
                ? row
                : {
                    ...row,
                    ...(fields.includes("title") ? { title: entry.title } : {}),
                    ...(fields.includes("notes") ? { notes: entry.notes } : {}),
                    ...(fields.includes("references") ? { references: entry.references } : {}),
                  },
            ),
          })),
        );
      } else {
        await discardOutlineChanges(owner, outlineId);
      }
      return null;

    case "addAsPoint": {
      if (!entryId) return null;
      const kept = await getKeptOutline(owner, outlineId);
      const row = (kept?.local ?? kept?.server)?.entries.find((entry) => entry.id === entryId);
      const id = crypto.randomUUID();
      resolution = {
        type: "outline.entry.add",
        baseRevision: null,
        payload: {
          entryId: id,
          type: "point",
          parentId: null,
          title: row?.title ?? "",
          notes: row?.notes ?? null,
          references: row?.references ?? [],
        } satisfies OutlinePayload<"outline.entry.add">,
      };
      // The changes behind it go; it is shown here under its new ID, where it was, until the
      // server's copy is read again.
      const dropped = await dropChanges(
        owner,
        outlineId,
        (queued) => behindIn(queued, record, () => true),
        afterDropping((outline) => ({
          ...outline,
          entries: outline.entries.map((other) => ({
            ...other,
            id: other.id === entryId ? id : other.id,
            parentId: other.parentId === entryId ? id : other.parentId,
          })),
        })),
      );
      if (dropped === "sending") return null;
      break;
    }

    case "addAtEnd": {
      const payload = record.payload as OutlinePayload<"outline.entry.add">;
      resolution = {
        payload: { ...payload, type: "point", parentId: null, position: undefined },
        baseRevision: null,
      };
      break;
    }

    case "discard":
      if (conflict.reason === "missing") {
        await discardOutlineChanges(owner, outlineId, true);
        return null;
      }
      // Only this change: each one behind it is the person's to discard in its
      // turn, and the copy keeps what they say while any is left.
      if (conflict.reason === "documentAuthoritative") {
        await dropChanges(owner, outlineId, itAnd(record), afterDropping());
        return null;
      }
      await dropChanges(
        owner,
        outlineId,
        itAnd(record, entryId ? () => true : undefined),
        afterDropping(),
      );
      return null;
  }
  if (resolution) await resolveMutation(owner, record.opId, resolution);
  return resolution;
}
