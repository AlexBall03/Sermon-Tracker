import type { JSONContent } from "@tiptap/core";
import type { IDBPObjectStore } from "idb";

import {
  openOfflineDb,
  OfflineStorageUnavailable,
  type OfflineSchema,
} from "@/features/offline/db";
import type { AccountRecord } from "@/features/offline/model";
import { isQuotaError } from "@/features/offline/storage";
import type { RecoveryRecords } from "./classify";
import { sameRecord } from "./identity";
import {
  cleanupKind,
  draftId as recordId,
  draftInputs,
  draftKind,
  draftFormat,
  lineageInput,
  lineRefusals,
  linkMatches,
  readCleanupRecord,
  readDraftRecord,
  type AdoptionLink,
  type CleanupMarkerData,
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
  /**
   * This snapshot is refused as it is (A2.3B.2B.3: over the limit, kept here
   * and never sent). Recorded in the same transaction, for this sequence, but
   * never over a `stale` or `missing` refusal, which is the line of work's.
   */
  refusal?: "too_large";
};

/**
 * Keeps a snapshot. `superseded` when the draft already holds this sequence or
 * a later one: nothing is written, so a delayed older write never replaces
 * newer work. Keeps the draft's start, what was confirmed, and any refusal
 * (unless `refusal` names this snapshot's own); the base revision never goes
 * back.
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
  if (input.refusal !== undefined && input.refusal !== "too_large") {
    throw new DraftStorageError("invalid");
  }
  return inTransaction("readwrite", async (store) => {
    const before = await stored(who, store, key);
    if (before && before.sequence >= sequence) return "superseded";
    const now = Date.now();
    const kept = before?.refusal;
    const refusal: DraftRefusal | undefined =
      input.refusal && !(kept && lineRefusals.has(kept.code))
        ? { code: input.refusal, sequence, at: now }
        : kept;
    const data: DocumentDraftData = {
      format: draftFormat,
      content: input.content,
      sequence,
      confirmedSequence: before?.confirmedSequence ?? 0,
      baseRevision: Math.max(baseRevision, before?.baseRevision ?? 0),
      createdAt: before?.createdAt ?? now,
      ...(refusal ? { refusal } : {}),
      // A restored draft keeps where it came from until a confirmation answers it (A2.3C).
      ...(before?.adoption ? { adoption: before.adoption } : {}),
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
 *
 * A restored draft (`adoption`, A2.3C): the confirmation is the evidence that
 * the server holds its work, so in the same transaction it becomes a cleanup
 * marker naming the drafts it came from, and the draft (kept or not) no
 * longer carries them. The confirmation and its evidence are recorded
 * together or not at all; removing those drafts is `settleCleanups`, a
 * transaction of its own that can be run again.
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
    if (before.adoption) {
      await recordEvidence(store, [who, cleanupKind, key[2]], who, {
        adopter: input.draftId.toLowerCase(),
        sequence,
        revision,
        ancestors: before.adoption.lineage,
      });
    }
    if (sequence === before.sequence) {
      await store.delete(key);
      return "cleared";
    }
    const next: DocumentDraftData = {
      ...before,
      confirmedSequence: sequence,
      baseRevision: Math.max(revision, before.baseRevision),
    };
    // The marker holds the lineage now.
    delete next.adoption;
    // A refusal of this snapshot or an older one is answered; one of a newer snapshot still waits.
    if (next.refusal && next.refusal.sequence <= sequence) delete next.refusal;
    await store.put(record(key, next, Date.now()));
    return "advanced";
  });
}

const sameLink = (a: AdoptionLink, b: AdoptionLink) =>
  a.draftId === b.draftId && a.sequence === b.sequence && a.updatedAt === b.updatedAt;

/** Writes (or adds to) the adopter's cleanup marker. An unreadable one in the way is left alone. */
async function recordEvidence(
  store: Store<"readwrite">,
  markerKey: [string, string, string],
  owner: string,
  evidence: Omit<CleanupMarkerData, "format" | "at">,
) {
  const existing = await store.get(markerKey);
  let ancestors = evidence.ancestors;
  if (existing) {
    const read = readCleanupRecord(owner, existing);
    // Never written over: the confirmation still counts, and its lineage stays on nothing.
    if (read.status !== "ok") throw new DraftStorageError("unreadable");
    ancestors = [
      ...read.marker.ancestors,
      ...evidence.ancestors.filter((link) => !read.marker.ancestors.some((o) => sameLink(o, link))),
    ];
  }
  const data: CleanupMarkerData = { format: draftFormat, ...evidence, ancestors, at: Date.now() };
  await store.put({
    owner: markerKey[0],
    kind: markerKey[1],
    id: markerKey[2],
    data,
    updatedAt: data.at,
  } as AccountRecord);
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
 * `unsupported`, by its `id`), when the person chooses to, and only if it is
 * still exactly the record they reviewed (`expected`, as `inspectRecoveryRecords`
 * gave it; compared by `sameRecord`, A2.3C). `changed`: another record is
 * there now, or one whose sameness cannot be established; it is kept. A
 * readable draft is never removed this way.
 */
export async function discardUnreadableDraft(
  owner: string,
  id: string,
  expected: unknown,
): Promise<"discarded" | "changed" | "ignored"> {
  const who = parse(draftInputs.owner, owner);
  if (typeof id !== "string") throw new DraftStorageError("invalid");
  const key: [string, string, string] = [who, draftKind, id];
  return inTransaction("readwrite", async (store) => {
    const existing = await store.get(key);
    if (!existing || readDraftRecord(who, existing).status === "ok") return "ignored";
    if (sameRecord(existing, expected) !== "equal") return "changed";
    await store.delete(key);
    return "discarded";
  });
}

/*
 * Recovery resolution (A2.3C). Each operation is one transaction that checks,
 * under it, that the records are exactly those the person reviewed
 * (`sameRecord`), so an approval never acts on something written since.
 * None is ever held open across a network request.
 */

/** A stored record as it was reviewed: its ID and its stored form. */
export type ReviewedRecord = { recordId: string; record: unknown };

function outlineRange(who: string, kind: string, outline: string) {
  return IDBKeyRange.bound([who, kind, `${outline}:`], [who, kind, `${outline}:￿`]);
}

/** One outline's drafts and cleanup markers, with their stored form, in one read. */
export async function inspectRecoveryRecords(
  owner: string,
  outlineId: string,
): Promise<RecoveryRecords> {
  const who = parse(draftInputs.owner, owner);
  const outline = parse(draftInputs.outlineId, outlineId);
  return inTransaction("readonly", async (store) => {
    const drafts = await store.getAll(outlineRange(who, draftKind, outline));
    const cleanups = await store.getAll(outlineRange(who, cleanupKind, outline));
    return {
      drafts: drafts.map((existing) => ({
        read: readDraftRecord(who, existing),
        record: existing,
      })),
      cleanups: cleanups.map((existing) => ({
        read: readCleanupRecord(who, existing),
        record: existing,
      })),
    };
  });
}

export type AdoptDraftInput = {
  outlineId: string;
  /** The adopting session's new draft: a UUID with no record yet. */
  draftId: string;
  /** What the editor will open: `restoreForRecovery`'s content of the head. */
  content: JSONContent;
  /** The server's revision as just read: the one the first save names. */
  baseRevision: number;
  /** Over the limit: recorded as refused (`too_large`) for this snapshot, as `writeDraft` would. */
  oversized: boolean;
  /** The head first, then the drafts it came from. */
  lineage: AdoptionLink[];
  /** The draft restored, as reviewed. */
  head: ReviewedRecord;
  /** Every draft record of the outline, as reviewed. */
  reviewed: ReviewedRecord[];
};

/**
 * Keeps a restored draft's content as a new session's first snapshot
 * (sequence 1, never confirmed), naming where it came from. In one
 * transaction:
 * - the head is still there, exactly as reviewed;
 * - every draft of the outline there now was reviewed and is unchanged (one
 *   gone since, as a late confirmation removes one, is fine);
 * - the new draft does not exist.
 * Otherwise `changed`, and nothing is written. Nothing is removed, ever: the
 * drafts it came from stay until a confirmation of this work (`confirmDraft`,
 * then `settleCleanups`). Resolves only once IndexedDB has committed it.
 */
export async function adoptDraft(
  owner: string,
  input: AdoptDraftInput,
): Promise<"adopted" | "changed"> {
  const { owner: who, key } = target(owner, input);
  const baseRevision = parse(draftInputs.revision, input.baseRevision);
  const lineage = parse(lineageInput, input.lineage);
  if (typeof input.content !== "object" || input.content === null || input.content.type !== "doc") {
    throw new DraftStorageError("invalid");
  }
  const outline = key[2].split(":")[0];
  const reviewed = new Map(input.reviewed.map((entry) => [entry.recordId, entry.record]));
  if (!input.head || reviewed.get(input.head.recordId) !== input.head.record) {
    throw new DraftStorageError("invalid");
  }
  if (lineage[0].draftId !== input.head.recordId.split(":")[1]) {
    throw new DraftStorageError("invalid");
  }
  return inTransaction("readwrite", async (store) => {
    const keys = await store.getAllKeys(outlineRange(who, draftKind, outline));
    let headFound = false;
    for (const existingKey of keys) {
      const id = (existingKey as [string, string, string])[2];
      if (id === key[2]) return "changed";
      if (!reviewed.has(id)) return "changed";
      const existing = await store.get(existingKey);
      if (sameRecord(existing, reviewed.get(id)) !== "equal") return "changed";
      if (id === input.head.recordId) headFound = true;
    }
    if (!headFound) return "changed";
    const now = Date.now();
    const data: DocumentDraftData = {
      format: draftFormat,
      content: input.content,
      sequence: 1,
      confirmedSequence: 0,
      baseRevision,
      createdAt: now,
      adoption: { lineage },
      ...(input.oversized ? { refusal: { code: "too_large" as const, sequence: 1, at: now } } : {}),
    };
    await store.put(record(key, data, now));
    return "adopted";
  });
}

/**
 * Removes a draft the person discarded, only if it is still exactly the
 * record they reviewed: `changed` when it differs or its sameness cannot be
 * established (kept), `ignored` when it is gone. Any draft record of the
 * outline, readable or not.
 */
export async function discardReviewedDraft(
  owner: string,
  input: { outlineId: string } & ReviewedRecord,
): Promise<"discarded" | "changed" | "ignored"> {
  const who = parse(draftInputs.owner, owner);
  const outline = parse(draftInputs.outlineId, input.outlineId);
  if (typeof input.recordId !== "string" || !input.recordId.startsWith(`${outline}:`)) {
    throw new DraftStorageError("invalid");
  }
  const key: [string, string, string] = [who, draftKind, input.recordId];
  return inTransaction("readwrite", async (store) => {
    const existing = await store.get(key);
    if (!existing) return "ignored";
    if (sameRecord(existing, input.record) !== "equal") return "changed";
    await store.delete(key);
    return "discarded";
  });
}

export type SettleResult = {
  /** Markers whose work is done and that were removed. */
  settled: number;
  /** Drafts removed because a confirmed restore came from them and they had not changed. */
  removed: number;
  /** Drafts named by a marker but kept: changed since, or still part of other unconfirmed work. */
  kept: number;
};

/**
 * Finishes the cleanups the server's confirmations made due (A2.3C): for
 * each readable marker of the outline, removes each draft it names that
 * still matches its link and that no other draft's unconfirmed lineage
 * still names, then removes the marker. A draft that changed since is kept
 * (it is independent work now). An unreadable marker is left alone and is
 * evidence of nothing. One transaction, idempotent: run again after a
 * failure, it finishes what is left. It sends nothing to the server.
 */
export async function settleCleanups(owner: string, outlineId: string): Promise<SettleResult> {
  const who = parse(draftInputs.owner, owner);
  const outline = parse(draftInputs.outlineId, outlineId);
  return inTransaction("readwrite", async (store) => {
    const result: SettleResult = { settled: 0, removed: 0, kept: 0 };
    const markers = await store.getAll(outlineRange(who, cleanupKind, outline));
    if (!markers.length) return result;
    const drafts = (await store.getAll(outlineRange(who, draftKind, outline))).map((existing) =>
      readDraftRecord(who, existing),
    );
    const gone = new Set<string>();
    const present = (read: DraftRead): read is Extract<DraftRead, { status: "ok" }> =>
      read.status === "ok" && !gone.has(read.draftId);
    for (const existing of markers) {
      const marker = readCleanupRecord(who, existing);
      if (marker.status !== "ok") continue;
      const find = (link: AdoptionLink) =>
        drafts.find((read) => present(read) && read.draftId === link.draftId);
      // The drafts this confirmation answers for: those still exactly as they were restored.
      const answered = new Set(
        marker.marker.ancestors
          .filter((link) => {
            const draft = find(link);
            return draft !== undefined && linkMatches(link, draft);
          })
          .map((link) => link.draftId),
      );
      for (const link of marker.marker.ancestors) {
        const draft = find(link);
        if (!draft) continue;
        // Still the protection of other restored work whose save is not confirmed: kept.
        const stillNamed = drafts.some(
          (read) =>
            present(read) &&
            read.draftId !== marker.adopter &&
            !answered.has(read.draftId) &&
            read.draft.adoption?.lineage.some((other) => sameLink(other, link)),
        );
        if (answered.has(link.draftId) && !stillNamed) {
          await store.delete([who, draftKind, recordId(outline, link.draftId)]);
          gone.add(link.draftId);
          result.removed += 1;
        } else {
          result.kept += 1;
        }
      }
      await store.delete([who, cleanupKind, recordId(outline, marker.adopter)]);
      result.settled += 1;
    }
    return result;
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
