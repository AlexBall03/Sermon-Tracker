import type { JSONContent } from "@tiptap/core";
import type { IDBPObjectStore } from "idb";

import {
  openOfflineDb,
  OfflineStorageUnavailable,
  type OfflineSchema,
} from "@/features/offline/db";
import type { AccountRecord } from "@/features/offline/model";
import { isQuotaError } from "@/features/offline/storage";
import {
  draftId as recordId,
  draftInputs,
  draftKind,
  draftFormat,
  readDraftRecord,
  type DocumentDraftData,
  type DraftRead,
  type DraftRefusal,
} from "./model";

/*
 * Recovery drafts on this device (A2.3A), in the offline database's
 * `accountData` store as `[owner, "documentDraft", "<outlineId>:<draftId>"]`.
 * Nothing else reads or writes that kind. Each operation is one IndexedDB
 * transaction that reads the stored draft and decides under it, so
 * overlapping writes and acknowledgments compare and set rather than race:
 * IndexedDB runs read-write transactions over the same store one at a time,
 * in the order they were begun.
 *
 * Every key is built from the owner the caller passes (the application user
 * ID), so one account's calls never reach another's drafts. Account deletion
 * clears them with the rest of the account's data (`forgetAccount`); signing
 * out does not. This module decides nothing about who is signed in: the
 * server authorizes every save.
 *
 * Every failure is thrown as a `DraftStorageError`, never swallowed.
 */

export type DraftStorageErrorKind =
  /** An argument this module refuses (an ID that is not a UUID, a bad sequence). Nothing was read or written. */
  | "invalid"
  /** IndexedDB is missing or refused (a private window, blocked site data). */
  | "unavailable"
  /** The browser is out of space for this site. Nothing was written. */
  | "quota"
  /** The stored record is not one this code can change. It was left as it is. */
  | "unreadable"
  /** Anything else the browser's storage reported. */
  | "failed";

export class DraftStorageError extends Error {
  constructor(
    readonly kind: DraftStorageErrorKind,
    cause?: unknown,
  ) {
    super(`Recovery draft storage failed: ${kind}.`, { cause });
    this.name = "DraftStorageError";
  }
}

function asStorageError(error: unknown): DraftStorageError {
  if (error instanceof DraftStorageError) return error;
  if (error instanceof OfflineStorageUnavailable)
    return new DraftStorageError("unavailable", error);
  if (isQuotaError(error)) return new DraftStorageError("quota", error);
  return new DraftStorageError("failed", error);
}

type Store<Mode extends IDBTransactionMode> = IDBPObjectStore<
  OfflineSchema,
  ["accountData"],
  "accountData",
  Mode
>;

/** Runs `work` in one transaction over `accountData`; a failure aborts it and is thrown as a `DraftStorageError`. */
async function inTransaction<Mode extends IDBTransactionMode, T>(
  mode: Mode,
  work: (store: Store<Mode>) => Promise<T>,
): Promise<T> {
  try {
    const db = await openOfflineDb();
    const tx = db.transaction("accountData", mode);
    try {
      const result = await work(tx.store as Store<Mode>);
      await tx.done;
      return result;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        // Already finished or aborted.
      }
      await tx.done.catch(() => undefined);
      throw error;
    }
  } catch (error) {
    throw asStorageError(error);
  }
}

function parse<T>(
  schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } },
  value: unknown,
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new DraftStorageError("invalid");
  return parsed.data;
}

type Target = { outlineId: string; draftId: string };

function target(owner: unknown, input: Target) {
  const who = parse(draftInputs.owner, owner);
  const outlineId = parse(draftInputs.outlineId, input.outlineId);
  const session = parse(draftInputs.draftId, input.draftId);
  return {
    owner: who,
    key: [who, draftKind, recordId(outlineId, session)] as [string, string, string],
  };
}

const record = (
  key: [string, string, string],
  data: DocumentDraftData,
  updatedAt: number,
): AccountRecord => ({
  owner: key[0],
  kind: key[1],
  id: key[2],
  data,
  updatedAt,
});

/** The stored draft at `key`, or null; an unreadable one throws rather than being written over. */
async function stored(owner: string, store: Store<"readwrite">, key: [string, string, string]) {
  const existing = await store.get(key);
  if (!existing) return null;
  const read = readDraftRecord(owner, existing);
  if (read.status !== "ok") throw new DraftStorageError("unreadable");
  return read.draft;
}

export type WriteDraftInput = Target & {
  content: JSONContent;
  sequence: number;
  /** The revision the controller would name in its next save of `content`. */
  baseRevision: number;
};

/**
 * Keeps a snapshot. `superseded` when the draft already holds this sequence or
 * a later one: nothing is written, so a delayed older write never replaces
 * newer work. Keeps the draft's start, what was confirmed, and any refusal;
 * the base revision never goes back.
 */
export async function writeDraft(
  owner: string,
  input: WriteDraftInput,
): Promise<"written" | "superseded"> {
  const { owner: who, key } = target(owner, input);
  const sequence = parse(draftInputs.sequence, input.sequence);
  const baseRevision = parse(draftInputs.revision, input.baseRevision);
  if (typeof input.content !== "object" || input.content === null || input.content.type !== "doc") {
    throw new DraftStorageError("invalid");
  }
  return inTransaction("readwrite", async (store) => {
    const before = await stored(who, store, key);
    if (before && before.sequence >= sequence) return "superseded";
    const now = Date.now();
    const data: DocumentDraftData = {
      format: draftFormat,
      content: input.content,
      sequence,
      confirmedSequence: before?.confirmedSequence ?? 0,
      baseRevision: Math.max(baseRevision, before?.baseRevision ?? 0),
      createdAt: before?.createdAt ?? now,
      ...(before?.refusal ? { refusal: before.refusal } : {}),
    };
    await store.put(record(key, data, now));
    return "written";
  });
}

/**
 * Records that the server saved snapshot `sequence` at `revision`.
 * - `cleared`: the draft held exactly that snapshot, so it is deleted.
 * - `advanced`: the draft holds a newer snapshot, which is kept; the next save
 *   of it names `revision`. A refusal of that snapshot or an older one is
 *   lifted; one of a newer snapshot still waits for the person.
 * - `ignored`: no draft, or an acknowledgment already counted or of a snapshot
 *   never kept. Nothing is written.
 */
export async function confirmDraft(
  owner: string,
  input: Target & { sequence: number; revision: number },
): Promise<"cleared" | "advanced" | "ignored"> {
  const { owner: who, key } = target(owner, input);
  const sequence = parse(draftInputs.sequence, input.sequence);
  const revision = parse(draftInputs.revision, input.revision);
  return inTransaction("readwrite", async (store) => {
    const before = await readable(who, store, key);
    if (!before || sequence <= before.confirmedSequence || sequence > before.sequence)
      return "ignored";
    if (sequence === before.sequence) {
      await store.delete(key);
      return "cleared";
    }
    const next: DocumentDraftData = {
      ...before,
      confirmedSequence: sequence,
      baseRevision: Math.max(revision, before.baseRevision),
    };
    // A refusal of this snapshot or an older one is answered; one of a newer snapshot still waits.
    if (next.refusal && next.refusal.sequence <= sequence) delete next.refusal;
    await store.put(record(key, next, Date.now()));
    return "advanced";
  });
}

/**
 * Records that the server refused the save of snapshot `sequence`. The
 * content is untouched; the draft waits for the person. `ignored` when there
 * is no draft, it does not hold that snapshot or a later one, or that snapshot
 * was already confirmed.
 */
export async function refuseDraft(
  owner: string,
  input: Target & { sequence: number; code: DraftRefusal["code"]; revision?: number },
): Promise<"refused" | "ignored"> {
  const { owner: who, key } = target(owner, input);
  const sequence = parse(draftInputs.sequence, input.sequence);
  const revision =
    input.revision === undefined ? undefined : parse(draftInputs.revision, input.revision);
  if (!["stale", "missing", "invalid", "too_large"].includes(input.code)) {
    throw new DraftStorageError("invalid");
  }
  return inTransaction("readwrite", async (store) => {
    const before = await readable(who, store, key);
    if (!before || before.sequence < sequence || sequence <= before.confirmedSequence) {
      return "ignored";
    }
    const refusal: DraftRefusal = {
      code: input.code,
      sequence,
      ...(revision === undefined ? {} : { revision }),
      at: Date.now(),
    };
    await store.put(record(key, { ...before, refusal }, Date.now()));
    return "refused";
  });
}

/**
 * Removes a draft the person has resolved, only if it still holds the
 * snapshot they resolved (`sequence`): a newer one written since is kept.
 */
export async function discardDraft(
  owner: string,
  input: Target & { sequence: number },
): Promise<"discarded" | "kept" | "ignored"> {
  const { owner: who, key } = target(owner, input);
  const sequence = parse(draftInputs.sequence, input.sequence);
  return inTransaction("readwrite", async (store) => {
    const before = await readable(who, store, key);
    if (!before) return "ignored";
    if (before.sequence !== sequence) return "kept";
    await store.delete(key);
    return "discarded";
  });
}

/**
 * Removes a record that could not be read as a draft (`malformed` or
 * `unsupported`, by its `id`), when the person chooses to. A readable draft is
 * never removed this way.
 */
export async function discardUnreadableDraft(
  owner: string,
  id: string,
): Promise<"discarded" | "ignored"> {
  const who = parse(draftInputs.owner, owner);
  if (typeof id !== "string") throw new DraftStorageError("invalid");
  const key: [string, string, string] = [who, draftKind, id];
  return inTransaction("readwrite", async (store) => {
    const existing = await store.get(key);
    if (!existing || readDraftRecord(who, existing).status === "ok") return "ignored";
    await store.delete(key);
    return "discarded";
  });
}

/** One draft, or null when there is none. */
export async function readDraft(owner: string, input: Target): Promise<DraftRead | null> {
  const { owner: who, key } = target(owner, input);
  return inTransaction("readonly", async (store) => {
    const existing = await store.get(key);
    return existing ? readDraftRecord(who, existing) : null;
  });
}

/** Every draft of one outline for the owner, unreadable ones included: the recovery candidates. */
export async function listDrafts(owner: string, outlineId: string): Promise<DraftRead[]> {
  const who = parse(draftInputs.owner, owner);
  const outline = parse(draftInputs.outlineId, outlineId);
  const range = IDBKeyRange.bound(
    [who, draftKind, `${outline}:`],
    [who, draftKind, `${outline}:￿`],
  );
  return inTransaction("readonly", async (store) =>
    (await store.getAll(range)).map((existing) => readDraftRecord(who, existing)),
  );
}

/** Every draft the owner has on this device, unreadable ones included. */
export async function listAccountDrafts(owner: string): Promise<DraftRead[]> {
  const who = parse(draftInputs.owner, owner);
  return inTransaction("readonly", async (store) =>
    (await store.index("ownerKind").getAll([who, draftKind])).map((existing) =>
      readDraftRecord(who, existing),
    ),
  );
}

/** The stored draft at `key` when it is readable; null when absent or unreadable (left alone). */
async function readable(owner: string, store: Store<"readwrite">, key: [string, string, string]) {
  const existing = await store.get(key);
  if (!existing) return null;
  const read = readDraftRecord(owner, existing);
  return read.status === "ok" ? read.draft : null;
}
