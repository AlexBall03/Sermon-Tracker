import type { IDBPObjectStore, StoreNames } from "idb";

import { openOfflineDb, type OfflineSchema } from "./db";
import {
  mutationSchemaVersions,
  type MutationErrorKind,
  type MutationRecord,
  type MutationType,
} from "./model";
import type { SyncConflict } from "@/features/sync/model";

/*
 * Changes made on this device and not yet acknowledged by the server, each
 * under its owner. Every function takes the owner and touches only that
 * owner's records: one account never reads, sends, or deletes another's.
 *
 * Nothing here deletes a record on its own. A record goes only when the
 * server has acknowledged it (`settleMutation` with `done`) or when its owner
 * chooses to delete it; a failure, signing out, switching accounts, and
 * clearing downloads leave every one in place.
 *
 * The records are sent by the sync engine (sync/engine.ts), which moves them
 * through these states and nothing else. A queued record is durable: it is
 * never unsaved work (lib/unsaved-work.ts), even while it is being sent.
 */

/** Passing failures in a row before a change stops being sent by itself. */
export const maxAutoAttempts = 6;

/** How long to wait after the `n`th passing failure: doubling from 2 s to 10 min, give or take a fifth. */
export function retryDelay(n: number, random = Math.random) {
  const base = Math.min(2_000 * 2 ** Math.max(0, n - 1), 600_000);
  return Math.round(base * (0.8 + 0.4 * random()));
}

type Listener = () => void;
const listeners = new Set<Listener>();
const channelName = "sermon-tracker-queue";
let channel: BroadcastChannel | null | undefined;

/** The other tabs of this application, told of every change so their lists and engines follow. */
function tabs() {
  if (channel !== undefined) return channel;
  channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(channelName);
  channel?.addEventListener("message", () => listeners.forEach((listener) => listener()));
  return channel;
}

const changed = () => {
  listeners.forEach((listener) => listener());
  tabs()?.postMessage("changed");
};

/** For a change written beside other stores (ideas/operations.ts): tells this tab and the others, once committed. */
export const announceQueueChange = changed;

/** Called after any change to the queue, in this tab or another. */
export function onQueueChange(listener: Listener) {
  tabs();
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

export type MutationStore = IDBPObjectStore<
  OfflineSchema,
  ArrayLike<StoreNames<OfflineSchema>>,
  "mutations",
  "readwrite"
>;

/**
 * Adds a change to the owner's queue inside a transaction the caller holds,
 * so it is written with what else that transaction writes or not at all.
 * The caller announces it (`announceQueueChange`) once the transaction is done.
 * Returns the record, and whether it is new: the same `opId` again keeps the first.
 */
export async function putMutation(
  store: MutationStore,
  owner: string,
  change: NewMutation,
): Promise<{ record: MutationRecord; added: boolean }> {
  if (!owner) throw new Error("A queued change needs its owner.");
  const existing = await store.get(change.opId);
  if (existing) {
    if (existing.owner !== owner) throw new Error("That change belongs to another account.");
    return { record: existing, added: false };
  }
  const record: MutationRecord = {
    ...change,
    owner,
    schemaVersion: mutationSchemaVersions[change.type],
    createdAt: Date.now(),
    attempts: 0,
    status: "pending",
  };
  await store.add(record);
  return { record, added: true };
}

/**
 * Adds a change to the owner's queue. Adding the same `opId` again keeps the
 * first, so a retried write never makes two.
 */
export async function enqueue(owner: string, change: NewMutation): Promise<MutationRecord> {
  if (!owner) throw new Error("A queued change needs its owner.");
  const db = await openOfflineDb();
  const tx = db.transaction("mutations", "readwrite");
  const done = putMutation(tx.store, owner, change);
  // A refusal (another account's ID) still lets the transaction finish before it is thrown.
  const [outcome] = await Promise.allSettled([done, tx.done]);
  if (outcome.status === "rejected") throw outcome.reason;
  if (outcome.value.added) changed();
  return outcome.value.record;
}

/** The owner's queued changes, oldest first; of one type, or about one thing, when asked. */
export async function listMutations(
  owner: string,
  filter: { type?: MutationType; entityId?: string } = {},
): Promise<MutationRecord[]> {
  if (!owner) return [];
  const db = await openOfflineDb();
  const records = await db.getAllFromIndex("mutations", "owner", owner);
  return records
    .filter(
      (record) =>
        record.status !== "done" &&
        (!filter.type || record.type === filter.type) &&
        (!filter.entityId || record.entityId === filter.entityId),
    )
    .sort(byAge);
}

/** Oldest first; the opId settles a tie, so the order is the same in every tab. */
export const byAge = (a: MutationRecord, b: MutationRecord) =>
  a.createdAt - b.createdAt || (a.opId < b.opId ? -1 : a.opId > b.opId ? 1 : 0);

/**
 * The records that may be sent now: those with no older record about the same
 * thing still queued. A change is made on top of the ones before it, so it is
 * never sent past one that has not been acknowledged (waiting, failed, or in
 * conflict); it waits behind it.
 */
export function sendable(records: MutationRecord[]): MutationRecord[] {
  const ahead = new Set<string>();
  const free: MutationRecord[] = [];
  for (const record of [...records].sort(byAge)) {
    if (!ahead.has(record.entityId)) free.push(record);
    ahead.add(record.entityId);
  }
  return free;
}

/**
 * Changes one of the owner's records in one transaction. `change` returns the
 * new record, `null` to delete it, or `undefined` to leave it as it is.
 */
async function update(
  owner: string,
  opId: string,
  change: (record: MutationRecord) => MutationRecord | null | undefined,
): Promise<MutationRecord | null> {
  const db = await openOfflineDb();
  const tx = db.transaction("mutations", "readwrite");
  const record = await tx.store.get(opId);
  if (!record || record.owner !== owner) {
    await tx.done;
    return null;
  }
  const next = change(record);
  if (next === undefined) {
    await tx.done;
    return null;
  }
  if (next === null) await tx.store.delete(opId);
  else await tx.store.put(next);
  await tx.done;
  changed();
  return next;
}

/** Marks a waiting change as on its way. `null` if it is not the owner's or not waiting. */
export function claimMutation(owner: string, opId: string) {
  return update(owner, opId, (record) =>
    record.status === "pending"
      ? { ...record, status: "sending", lastAttemptAt: Date.now() }
      : undefined,
  );
}

export type Settlement =
  /** The server has it: the record goes. */
  | { outcome: "done" }
  /** Passing (no answer, a server error): wait and try again, until `maxAutoAttempts`. */
  | { outcome: "retry"; kind: MutationErrorKind; message?: string }
  /** It can never be applied as it is: kept, failed, for the person. */
  | { outcome: "failed"; kind: MutationErrorKind; message?: string }
  /** The server disagrees: kept until the person chooses. */
  | { outcome: "conflict"; conflict: SyncConflict }
  /** Not now and not its fault (signed out, another account): back as it was. */
  | { outcome: "release" };

/** Records how one attempt to send a change ended. */
export function settleMutation(owner: string, opId: string, settlement: Settlement) {
  return update(owner, opId, (record) => {
    const now = Date.now();
    switch (settlement.outcome) {
      case "done":
        return null;
      case "release":
        return record.status === "sending" ? { ...record, status: "pending" } : undefined;
      case "retry": {
        const autoAttempts = (record.autoAttempts ?? 0) + 1;
        const stop = autoAttempts >= maxAutoAttempts;
        return {
          ...record,
          attempts: record.attempts + 1,
          autoAttempts,
          lastAttemptAt: now,
          status: stop ? "failed" : "pending",
          nextAttemptAt: stop ? undefined : now + retryDelay(autoAttempts),
          error: { kind: settlement.kind, message: settlement.message },
        };
      }
      case "failed":
        return {
          ...record,
          attempts: record.attempts + 1,
          lastAttemptAt: now,
          status: "failed",
          nextAttemptAt: undefined,
          error: { kind: settlement.kind, message: settlement.message },
        };
      case "conflict":
        return {
          ...record,
          attempts: record.attempts + 1,
          lastAttemptAt: now,
          status: "conflict",
          nextAttemptAt: undefined,
          conflict: settlement.conflict,
          error: { kind: "conflict" },
        };
    }
  });
}

/** The person asks to send a change again: it waits its turn as if new, keeping what it says. */
export function retryMutation(owner: string, opId: string) {
  return update(owner, opId, (record) =>
    record.status === "sending"
      ? undefined
      : {
          ...record,
          status: "pending",
          autoAttempts: 0,
          nextAttemptAt: undefined,
          error: undefined,
          conflict: undefined,
        },
  );
}

/** What a person's choice in a conflict makes of the change; what it leaves out stays. */
export type Resolution = {
  payload?: unknown;
  baseRevision?: number;
  type?: MutationType;
  entityId?: string;
};

/**
 * The person settles a conflict by choosing what the change should say
 * (a capture without the tags that are gone, an edit made over the server's
 * newer copy, a deletion turned into archiving). It is sent again under the
 * same ID: the server wrote nothing for it, so that is still its first time.
 */
export function resolveMutation(owner: string, opId: string, resolution: Resolution) {
  return update(owner, opId, (record) =>
    record.status === "conflict"
      ? {
          ...record,
          ...("payload" in resolution ? { payload: resolution.payload } : {}),
          ...(resolution.baseRevision !== undefined
            ? { baseRevision: resolution.baseRevision }
            : {}),
          ...(resolution.type
            ? { type: resolution.type, schemaVersion: mutationSchemaVersions[resolution.type] }
            : {}),
          ...(resolution.entityId ? { entityId: resolution.entityId } : {}),
          status: "pending",
          autoAttempts: 0,
          nextAttemptAt: undefined,
          error: undefined,
          conflict: undefined,
        }
      : undefined,
  );
}

/**
 * After the server acknowledged a change to one thing at `revision`, the
 * changes queued behind it, which were made on top of it, are made against
 * that revision: the server then checks them against what they really follow.
 */
export async function rebaseFollowing(owner: string, entityId: string, revision: number) {
  const db = await openOfflineDb();
  const tx = db.transaction("mutations", "readwrite");
  const records = await tx.store.index("owner").getAll(owner);
  let moved = 0;
  for (const record of records) {
    if (record.entityId !== entityId || record.status === "sending") continue;
    if (record.type === "idea.create" || record.baseRevision === revision) continue;
    await tx.store.put({ ...record, baseRevision: revision });
    moved++;
  }
  await tx.done;
  if (moved) changed();
}

/**
 * Points the owner's changes about one thing at another (an edit to an idea
 * deleted elsewhere, saved as a new idea instead). Never one being sent.
 */
export async function retargetMutations(owner: string, from: string, to: string) {
  const db = await openOfflineDb();
  const tx = db.transaction("mutations", "readwrite");
  const records = await tx.store.index("owner").getAll(owner);
  for (const record of records) {
    if (record.entityId === from && record.status !== "sending") {
      await tx.store.put({ ...record, entityId: to });
    }
  }
  await tx.done;
  changed();
}

/**
 * Changes left `sending` by a run that never finished (a closed tab, a
 * reload). Only the engine calls this, holding the lock that says no other
 * run is sending; the server makes sending one twice harmless.
 */
export async function recoverInterrupted(owner: string) {
  const db = await openOfflineDb();
  const stuck = await db.getAllFromIndex("mutations", "ownerStatus", [owner, "sending"]);
  for (const record of stuck) {
    await update(owner, record.opId, (current) =>
      current.status === "sending" ? { ...current, status: "pending" } : undefined,
    );
  }
  return stuck.length;
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
