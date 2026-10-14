import { referenceKey } from "@/features/scripture/reference";
import type { IdeaInput } from "@/features/ideas/schemas";
import type { OfflineIdea } from "@/features/sync/ideas";
import { openOfflineDb } from "../db";
import type { MutationRecord } from "../model";
import { announceQueueChange, putMutation, type NewMutation } from "../queue";
import { announceIdeasChange, ideaKind, ideaRecord, shown, type KeptIdea } from "./store";

/*
 * Changes to an account's ideas made on this device (Phase 5D.1): offline,
 * or when the server gave no answer. Each writes the device's copy of the
 * idea (`local`, store.ts) and queues the change for the sync engine in ONE
 * IndexedDB transaction, so the copy never says something the queue will not
 * send, and the queue never holds a change the copy does not show.
 *
 * A change names the revision it was made on (`baseRevision`); the server
 * refuses it as a conflict if the idea has changed since (features/sync/apply.ts).
 * Nothing here is ever said to be saved to the account: it is kept on the
 * device until the engine has sent it.
 */

export type OfflineChange =
  | { status: "queued"; record: MutationRecord; idea: OfflineIdea | null }
  /** Nothing to change: the idea is not kept here and nothing was given to start from. */
  | { status: "missing" }
  /** A sermon with preaching history is never deleted. */
  | { status: "preached" };

const newId = () => crypto.randomUUID();
const now = () => new Date().toISOString();

const developed = (before: OfflineIdea, input: IdeaInput) =>
  input.title !== before.title ||
  (input.subject ?? null) !== before.subject ||
  (input.notes ?? null) !== before.notes ||
  input.references.map((r) => `${referenceKey(r)}:${r.isPrimary}`).join("|") !==
    before.references.map((r) => `${referenceKey(r)}:${r.isPrimary}`).join("|");

/** The idea with `input` written over it, as `updateIdea` would write it. */
function withInput(before: OfflineIdea, input: IdeaInput): OfflineIdea {
  const at = now();
  return {
    ...before,
    kind: input.kind,
    title: input.title,
    notes: input.notes ?? null,
    status: input.status,
    intendedFormat: input.intendedFormat,
    sermonType: input.sermonType,
    subject: input.subject ?? null,
    references: input.references,
    tagIds: input.tagIds ?? before.tagIds,
    updatedAt: at,
    lastDevelopedAt: developed(before, input) ? at : before.lastDevelopedAt,
  };
}

/**
 * Writes the copy and the queued change together. `next` receives what is
 * kept (or null) and returns the new copy, `null` to forget the idea, or
 * `undefined` to refuse.
 */
async function change(
  owner: string,
  id: string,
  next: (kept: KeptIdea | null) => { kept: KeptIdea | null; change: NewMutation } | undefined,
): Promise<OfflineChange> {
  if (!owner) throw new Error("A change needs its owner.");
  const db = await openOfflineDb();
  const tx = db.transaction(["accountData", "mutations"], "readwrite");
  const data = tx.objectStore("accountData");
  try {
    const stored = await data.get([owner, ideaKind, id]);
    const kept = stored && stored.owner === owner ? (stored.data as KeptIdea) : null;
    const planned = next(kept);
    if (!planned) {
      await tx.done;
      return { status: "missing" };
    }
    if (planned.kept) await data.put(ideaRecord(owner, id, planned.kept));
    else await data.delete([owner, ideaKind, id]);
    const { record } = await putMutation(tx.objectStore("mutations"), owner, planned.change);
    await tx.done;
    announceQueueChange();
    announceIdeasChange();
    return { status: "queued", record, idea: shown(planned.kept) };
  } catch (error) {
    try {
      tx.abort();
    } catch {
      // Already finished or aborted: nothing was written past the failure.
    }
    await tx.done.catch(() => {});
    throw error;
  }
}

/**
 * The server's copy as best known: the page's own (`base`) when it is at
 * least as new as the device's, which it is when the page was just read.
 */
function serverCopy(kept: KeptIdea | null, base?: OfflineIdea) {
  if (base && (!kept?.server || base.revision >= kept.server.revision)) return base;
  return kept?.server ?? null;
}

/** What a change starts from: the copy changed here, if any, and otherwise the server's. */
function current(kept: KeptIdea | null, base?: OfflineIdea) {
  if (kept?.local) return shown(kept);
  return serverCopy(kept, base);
}

/**
 * A new idea, under its own ID (quick capture kept on the device). Its
 * change is the capture itself, with the idea's ID as the change's, as in
 * Phase 5B, so a capture sent twice is one idea.
 */
export function createIdeaOffline(owner: string, id: string, input: IdeaInput) {
  const at = now();
  const idea: OfflineIdea = {
    id,
    kind: input.kind,
    title: input.title,
    notes: input.notes ?? null,
    status: input.status,
    intendedFormat: input.intendedFormat,
    sermonType: input.sermonType,
    subject: input.subject ?? null,
    references: input.references,
    tagIds: input.tagIds ?? [],
    revision: 0,
    createdAt: at,
    updatedAt: at,
    lastDevelopedAt: null,
    archivedAt: null,
    hasOutline: false,
    preached: false,
  };
  return change(owner, id, (kept) => ({
    kept: { server: kept?.server ?? null, local: idea },
    change: { opId: id, type: "idea.create", entityType: "idea", entityId: id, payload: input },
  }));
}

/** A save of the whole draft, as the editor makes one. */
export function saveIdeaOffline(owner: string, id: string, input: IdeaInput, base?: OfflineIdea) {
  return change(owner, id, (kept) => {
    const before = current(kept, base);
    if (!before) return undefined;
    return {
      kept: { server: serverCopy(kept, base), local: withInput(before, input) },
      change: {
        opId: newId(),
        type: "idea.update",
        entityType: "idea",
        entityId: id,
        payload: input,
        baseRevision: before.revision,
      },
    };
  });
}

function archiving(owner: string, id: string, archived: boolean, base?: OfflineIdea) {
  return change(owner, id, (kept) => {
    const before = current(kept, base);
    if (!before) return undefined;
    return {
      // Putting an idea away is not an edit: its dates stay as they were.
      kept: {
        server: serverCopy(kept, base),
        local: { ...before, archivedAt: archived ? (before.archivedAt ?? now()) : null },
      },
      change: {
        opId: newId(),
        type: archived ? "idea.archive" : "idea.restore",
        entityType: "idea",
        entityId: id,
        payload: null,
        baseRevision: before.revision,
      },
    };
  });
}

export const archiveIdeaOffline = (owner: string, id: string, base?: OfflineIdea) =>
  archiving(owner, id, true, base);
export const restoreIdeaOffline = (owner: string, id: string, base?: OfflineIdea) =>
  archiving(owner, id, false, base);

/**
 * Deletes an idea, hidden here at once and sent like any change. One with
 * preaching history is refused here as it is on the server. The change says
 * whether the person was told of its outline (the editor's confirmation says
 * so when there is one); the server refuses it if an outline appeared since.
 */
export async function deleteIdeaOffline(
  owner: string,
  id: string,
  base?: OfflineIdea,
): Promise<OfflineChange> {
  let preached = false;
  const outcome = await change(owner, id, (kept) => {
    const before = current(kept, base);
    if (!before) return undefined;
    if (before.preached) {
      preached = true;
      return undefined;
    }
    return {
      kept: { server: serverCopy(kept, base), local: { ...before, deleted: true } },
      change: {
        opId: newId(),
        type: "idea.delete",
        entityType: "idea",
        entityId: id,
        payload: { outline: before.hasOutline },
        baseRevision: before.revision,
      },
    };
  });
  return preached ? { status: "preached" } : outcome;
}
