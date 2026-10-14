import { openOfflineDb } from "./db";
import {
  mutationSchemaVersions,
  type MutationErrorKind,
  type MutationRecord,
  type MutationType,
} from "./model";

/*
 * Changes made on this device and not yet acknowledged by the server, each
 * under its owner. Every function takes the owner and touches only that
 * owner's records: one account never reads, sends, or deletes another's.
 *
 * Nothing here deletes a record on its own. A record goes only when the
 * server has acknowledged it (`removeMutation` after a successful send) or
 * when its owner chooses to delete it; clearing downloads, signing out, and
 * switching accounts leave every one in place.
 *
 * Phase 5B only adds records (a quick capture the server could not take) and
 * lets the owner send one again by hand. Phase 5C sends them by itself.
 */

type Listener = () => void;
const listeners = new Set<Listener>();
const changed = () => listeners.forEach((listener) => listener());

/** Called after any change to the queue, in this tab. */
export function onQueueChange(listener: Listener) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export type NewMutation = {
  opId: string;
  type: MutationType;
  entityType: MutationRecord["entityType"];
  entityId: string;
  payload: unknown;
  baseRevision?: number;
};

/**
 * Adds a change to the owner's queue. Adding the same `opId` again keeps the
 * first, so a retried write never makes two.
 */
export async function enqueue(owner: string, change: NewMutation): Promise<MutationRecord> {
  if (!owner) throw new Error("A queued change needs its owner.");
  const db = await openOfflineDb();
  const tx = db.transaction("mutations", "readwrite");
  const existing = await tx.store.get(change.opId);
  if (existing) {
    await tx.done;
    if (existing.owner !== owner) throw new Error("That change belongs to another account.");
    return existing;
  }
  const record: MutationRecord = {
    ...change,
    owner,
    schemaVersion: mutationSchemaVersions[change.type],
    createdAt: Date.now(),
    attempts: 0,
    status: "pending",
  };
  await tx.store.add(record);
  await tx.done;
  changed();
  return record;
}

/** The owner's queued changes, oldest first; of one type when asked. */
export async function listMutations(
  owner: string,
  filter: { type?: MutationType } = {},
): Promise<MutationRecord[]> {
  if (!owner) return [];
  const db = await openOfflineDb();
  const records = await db.getAllFromIndex("mutations", "owner", owner);
  return records
    .filter((record) => record.status !== "done" && (!filter.type || record.type === filter.type))
    .sort((a, b) => a.createdAt - b.createdAt);
}

/** Records the outcome of one attempt to send a change. */
export async function markAttempt(
  owner: string,
  opId: string,
  outcome: { ok: true } | { ok: false; kind: MutationErrorKind; message?: string },
) {
  const db = await openOfflineDb();
  const tx = db.transaction("mutations", "readwrite");
  const record = await tx.store.get(opId);
  if (!record || record.owner !== owner) {
    await tx.done;
    return;
  }
  await tx.store.put({
    ...record,
    attempts: record.attempts + 1,
    lastAttemptAt: Date.now(),
    status: outcome.ok ? "done" : "failed",
    error: outcome.ok ? undefined : { kind: outcome.kind, message: outcome.message },
  });
  await tx.done;
  changed();
}

/** Removes one of the owner's changes: acknowledged by the server, or deleted by its owner. */
export async function removeMutation(owner: string, opId: string): Promise<boolean> {
  const db = await openOfflineDb();
  const tx = db.transaction("mutations", "readwrite");
  const record = await tx.store.get(opId);
  if (!record || record.owner !== owner) {
    await tx.done;
    return false;
  }
  await tx.store.delete(opId);
  await tx.done;
  changed();
  return true;
}
