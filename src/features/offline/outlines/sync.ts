import type { SyncOutcome } from "@/features/sync/model";
import {
  entryOf,
  outlineShapeTypes,
  type OfflineOutline,
  type OutlinePayload,
} from "@/features/sync/outlines";
import type { MutationRecord } from "../model";
import {
  listMutations,
  rebaseFollowing,
  removeMutation,
  resolveMutation,
  type Resolution,
} from "../queue";
import { getKeptOutline, rewriteOutline } from "./store";

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

/** Drops queued changes, leaving one on its way to finish. */
async function drop(owner: string, records: MutationRecord[]) {
  for (const record of records) {
    if (record.status !== "sending") await removeMutation(owner, record.opId);
  }
}

/**
 * After changes were dropped: with nothing left queued the copy is the
 * server's again (behind, until the next download), and otherwise it keeps
 * what is left. Either way an editor open on it starts again from it.
 */
async function afterDropping(
  owner: string,
  outlineId: string,
  change?: (outline: OfflineOutline) => OfflineOutline,
) {
  const left = await listMutations(owner, { entityId: outlineId });
  await rewriteOutline(
    owner,
    outlineId,
    (kept) =>
      left.length === 0 || !kept.local
        ? kept.server
          ? { server: kept.server, local: null, behind: true }
          : null
        : { ...kept, local: change ? change(kept.local) : kept.local, behind: true },
    { restart: true },
  );
}

/**
 * The person drops every change made here to one outline. The copy is then
 * the last one downloaded, read again by the next download; an outline gone
 * from the account is forgotten.
 */
export async function discardOutlineChanges(owner: string, outlineId: string, forget = false) {
  await drop(owner, await listMutations(owner, { entityId: outlineId }));
  await rewriteOutline(
    owner,
    outlineId,
    (kept) => (forget || !kept.server ? null : { server: kept.server, local: null, behind: true }),
    { restart: true },
  );
}

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

/** The choices that make sense for this conflict, in the order offered. */
export function outlineChoicesFor(record: MutationRecord): OutlineChoice[] {
  const conflict = record.conflict;
  if (!conflict) return [];
  switch (conflict.reason) {
    case "outlineStale":
      return ["applyMine", "useAccount"];
    case "entryStale":
      return ["keepMine", "useAccount"];
    case "entryMissing":
      return isWords(record) ? ["addAsPoint", "discard"] : ["discard"];
    case "placement":
      return record.type === "outline.entry.add" ? ["addAtEnd", "discard"] : ["discard"];
    default:
      return ["discard"];
  }
}

/** The changes queued after `record` about the same entry. */
async function behind(
  owner: string,
  record: MutationRecord,
  which: (other: MutationRecord) => boolean,
) {
  const entryId = entryOf(record.payload);
  const queued = await listMutations(owner, { entityId: record.entityId });
  const at = queued.findIndex((other) => other.opId === record.opId);
  return queued.slice(at + 1).filter((other) => entryOf(other.payload) === entryId && which(other));
}

/**
 * Applies the person's choice. Returns the resolution to send again, or null
 * when the change was dropped.
 */
export async function settleOutline(owner: string, record: MutationRecord, choice: OutlineChoice) {
  const conflict = record.conflict;
  if (!conflict) return null;
  const outlineId = record.entityId;
  const entryId = entryOf(record.payload);
  let resolution: Resolution | null = null;

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
        await drop(owner, [
          record,
          ...(await behind(owner, record, (other) => other.type === record.type)),
        ]);
        await afterDropping(owner, outlineId, (outline) => ({
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
        }));
      } else {
        await discardOutlineChanges(owner, outlineId);
      }
      return null;

    case "addAsPoint": {
      if (!entryId) return null;
      const kept = await getKeptOutline(owner, outlineId);
      const row = (kept?.local ?? kept?.server)?.entries.find((entry) => entry.id === entryId);
      const id = crypto.randomUUID();
      await drop(owner, await behind(owner, record, () => true));
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
      // Shown here under its new ID, where it was, until the server's copy is read again.
      await afterDropping(owner, outlineId, (outline) => ({
        ...outline,
        entries: outline.entries.map((other) => ({
          ...other,
          id: other.id === entryId ? id : other.id,
          parentId: other.parentId === entryId ? id : other.parentId,
        })),
      }));
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
      await drop(owner, [record, ...(entryId ? await behind(owner, record, () => true) : [])]);
      await afterDropping(owner, outlineId);
      return null;
  }
  if (resolution) await resolveMutation(owner, record.opId, resolution);
  return resolution;
}
