import type { Database } from "@/db/types";
import * as entries from "@/features/outlines/entries";
import { getOutlineSermon, setNumbering } from "@/features/outlines/outlines";
import { outlineSchemas, type EntryUpdate } from "@/features/outlines/schemas";
import { referenceKey, type ScriptureReference } from "@/features/scripture/reference";
import type { Locale } from "@/i18n/locales";
import type { SyncEnvelope, SyncOutcome } from "./model";
import { outlinePayloadSchemas, type OutlineSyncType, type ServerEntry } from "./outlines";

/*
 * The handlers for changes to an outline made on a device (Phase 5D.2), for
 * `applyMutation` (apply.ts), which runs each in one transaction with its row
 * in `sync_operations`. The outline is the change's `entityId`; the entry, if
 * any, is in its payload. Every write goes through `entries.ts` and
 * `outlines.ts`, so the locks, the two revisions, `markDeveloped`, and the
 * owner in every WHERE clause are exactly the editor's.
 *
 * - A change of shape (add, move, remove) is made against the outline's
 *   revision (`baseRevision`). Made on an older one, it is an `outlineStale`
 *   conflict, never placed over a shape the device did not see. What is
 *   already so is done: an addition already made, a removal of what is gone,
 *   a move to where the point already is.
 * - A change to an entry's words or passages is made against the entry's
 *   revision, and carries what the fields were before it (`base`). Made on an
 *   older revision, it is settled field by field: a field the device changed
 *   and nobody else did is written, a field already as the device has it is
 *   done, and a field changed in both places to different things is an
 *   `entryStale` conflict for the person, with nothing written.
 */

type Handler = (
  tx: Database,
  ownerId: string,
  change: SyncEnvelope,
  locale: Locale,
) => Promise<SyncOutcome>;

const invalid = (message?: string): SyncOutcome => ({
  status: "rejected",
  reason: "validation",
  message,
});

function payloadOf<T extends OutlineSyncType>(type: T, change: SyncEnvelope) {
  return outlinePayloadSchemas[type].safeParse(change.payload) as ReturnType<
    (typeof outlinePayloadSchemas)[T]["safeParse"]
  >;
}

/** The entry gone, or its whole outline. */
async function gone(tx: Database, ownerId: string, outlineId: string): Promise<SyncOutcome> {
  const outline = await getOutlineSermon(tx, ownerId, outlineId);
  return { status: "conflict", conflict: { reason: outline ? "entryMissing" : "missing" } };
}

/** The entry, when it is one of this outline's. */
async function entryIn(tx: Database, ownerId: string, outlineId: string, id: string) {
  const entry = await entries.getEntry(tx, ownerId, id);
  return entry && entry.outlineId === outlineId ? entry : null;
}

const serverEntry = (entry: entries.EntryRecord): ServerEntry => ({
  title: entry.title,
  notes: entry.notes,
  references: entry.references,
  revision: entry.revision,
});

const passages = (list: readonly ScriptureReference[]) => list.map(referenceKey).join("|");

const placement: SyncOutcome = { status: "conflict", conflict: { reason: "placement" } };

export const outlineHandlers: Record<OutlineSyncType, Handler> = {
  async "outline.entry.add"(tx, ownerId, change, locale) {
    const payload = payloadOf("outline.entry.add", change);
    if (!payload.success) return invalid(payload.error.issues[0]?.message);
    const schemas = outlineSchemas(locale);
    const { entryId, references, ...rest } = payload.data;
    const input = schemas.entryCreate.safeParse({
      ...rest,
      outlineId: change.entityId,
      expectedRevision: change.baseRevision,
    });
    if (!input.success) return invalid(input.error.issues[0]?.message);
    const added = references ? schemas.entryReferences.safeParse(references) : null;
    if (added && !added.success) return invalid(added.error.issues[0]?.message);

    let outcome = await entries.createEntry(tx, ownerId, input.data, entryId);
    // The saved point was deleted before this reached the server: the words the device showed stand.
    if (outcome.status === "unknown_source") {
      outcome = await entries.createEntry(
        tx,
        ownerId,
        { ...input.data, sourcePointId: null },
        entryId,
      );
    }
    switch (outcome.status) {
      case "created":
        if (added?.data.length) {
          await entries.setEntryReferences(tx, ownerId, entryId, added.data);
        }
        return { status: "applied", entityId: change.entityId, revision: outcome.revision };
      case "existing":
        return { status: "applied", entityId: change.entityId, revision: outcome.revision };
      case "stale":
        return {
          status: "conflict",
          conflict: { reason: "outlineStale", revision: outcome.revision },
        };
      case "missing":
        return { status: "conflict", conflict: { reason: "missing" } };
      case "unavailable":
        return { status: "rejected", reason: "taken" };
      default:
        return placement;
    }
  },

  async "outline.entry.update"(tx, ownerId, change, locale) {
    const payload = payloadOf("outline.entry.update", change);
    if (!payload.success) return invalid(payload.error.issues[0]?.message);
    const { entryId, base, ...fields } = payload.data;
    const mine = outlineSchemas(locale).entryUpdate.safeParse(fields);
    if (!mine.success) return invalid(mine.error.issues[0]?.message);
    if (!(await entryIn(tx, ownerId, change.entityId, entryId))) {
      return gone(tx, ownerId, change.entityId);
    }

    const first = await entries.updateEntry(tx, ownerId, entryId, {
      ...mine.data,
      expectedRevision: change.baseRevision,
    });
    if (first.status === "missing") return gone(tx, ownerId, change.entityId);
    if (first.status === "updated") {
      return { status: "applied", entityId: change.entityId, revision: first.entry.revision };
    }

    // Changed since the device read it: settled field by field.
    const theirs = first.entry;
    // As the schema keeps them: a heading on one line, notes trimmed and null when empty.
    const before = {
      title: base.title === undefined ? undefined : base.title.replace(/\s+/g, " ").trim(),
      notes: base.notes === undefined ? undefined : (base.notes ?? "").trim() || null,
    };
    const write: EntryUpdate = {};
    const conflicting: ("title" | "notes")[] = [];
    for (const field of ["title", "notes"] as const) {
      const value = mine.data[field];
      if (value === undefined || theirs[field] === value) continue;
      if (theirs[field] === before[field]) write[field] = value as never;
      else conflicting.push(field);
    }
    if (conflicting.length > 0) {
      return {
        status: "conflict",
        conflict: { reason: "entryStale", entry: serverEntry(theirs), fields: conflicting },
      };
    }
    if (write.title === undefined && write.notes === undefined) {
      return { status: "applied", entityId: change.entityId, revision: theirs.revision };
    }
    const second = await entries.updateEntry(tx, ownerId, entryId, {
      ...write,
      expectedRevision: theirs.revision,
    });
    if (second.status === "missing") return gone(tx, ownerId, change.entityId);
    if (second.status === "stale") {
      return {
        status: "conflict",
        conflict: {
          reason: "entryStale",
          entry: serverEntry(second.entry),
          fields: write.title !== undefined ? ["title"] : ["notes"],
        },
      };
    }
    return { status: "applied", entityId: change.entityId, revision: second.entry.revision };
  },

  async "outline.entry.references"(tx, ownerId, change, locale) {
    const payload = payloadOf("outline.entry.references", change);
    if (!payload.success) return invalid(payload.error.issues[0]?.message);
    const schemas = outlineSchemas(locale);
    const mine = schemas.entryReferences.safeParse(payload.data.references);
    if (!mine.success) return invalid(mine.error.issues[0]?.message);
    const { entryId } = payload.data;
    const current = await entryIn(tx, ownerId, change.entityId, entryId);
    if (!current) return gone(tx, ownerId, change.entityId);

    let outcome = await entries.setEntryReferences(
      tx,
      ownerId,
      entryId,
      mine.data,
      change.baseRevision,
    );
    if (outcome.status === "stale") {
      const theirs = outcome.entry;
      if (passages(theirs.references) === passages(mine.data)) {
        return { status: "applied", entityId: change.entityId, revision: theirs.revision };
      }
      if (passages(theirs.references) !== passages(payload.data.base)) {
        return {
          status: "conflict",
          conflict: { reason: "entryStale", entry: serverEntry(theirs), fields: ["references"] },
        };
      }
      // Only the words changed elsewhere: the passages are the device's to set.
      outcome = await entries.setEntryReferences(tx, ownerId, entryId, mine.data, theirs.revision);
    }
    if (outcome.status === "missing") return gone(tx, ownerId, change.entityId);
    if (outcome.status === "stale") {
      return {
        status: "conflict",
        conflict: {
          reason: "entryStale",
          entry: serverEntry(outcome.entry),
          fields: ["references"],
        },
      };
    }
    return { status: "applied", entityId: change.entityId, revision: outcome.entry.revision };
  },

  async "outline.entry.move"(tx, ownerId, change, locale) {
    const payload = payloadOf("outline.entry.move", change);
    if (!payload.success) return invalid(payload.error.issues[0]?.message);
    const { entryId, parentId, position } = payload.data;
    const move = outlineSchemas(locale).entryMove.safeParse({
      parentId,
      position,
      expectedRevision: change.baseRevision,
    });
    if (!move.success) return invalid(move.error.issues[0]?.message);
    if (!(await entryIn(tx, ownerId, change.entityId, entryId))) {
      return gone(tx, ownerId, change.entityId);
    }

    const outcome = await entries.moveEntry(tx, ownerId, entryId, move.data);
    switch (outcome.status) {
      case "moved":
        return { status: "applied", entityId: change.entityId, revision: outcome.revision };
      case "stale": {
        // Already where it was going (the first send was answered and the answer lost): done.
        // No revision is given, so a change behind it is still checked against the outline.
        const now = await entries.getEntry(tx, ownerId, entryId);
        if (now && now.parentId === parentId && now.position === position) {
          return { status: "applied", entityId: change.entityId };
        }
        return {
          status: "conflict",
          conflict: { reason: "outlineStale", revision: outcome.revision },
        };
      }
      case "missing":
        return gone(tx, ownerId, change.entityId);
      default:
        return placement;
    }
  },

  async "outline.entry.remove"(tx, ownerId, change) {
    const payload = payloadOf("outline.entry.remove", change);
    if (!payload.success) return invalid(payload.error.issues[0]?.message);
    const { entryId } = payload.data;
    // Gone already, or its outline is: there is nothing left to remove.
    if (!(await entryIn(tx, ownerId, change.entityId, entryId))) {
      return { status: "applied", entityId: change.entityId };
    }
    const outcome = await entries.deleteEntry(tx, ownerId, entryId, change.baseRevision);
    if (outcome.status === "missing") return { status: "applied", entityId: change.entityId };
    if (outcome.status === "stale") {
      return {
        status: "conflict",
        conflict: { reason: "outlineStale", revision: outcome.revision },
      };
    }
    return { status: "applied", entityId: change.entityId, revision: outcome.revision };
  },

  // How it is numbered is one value, and the last choice is the one that stands.
  async "outline.numbering"(tx, ownerId, change, locale) {
    const payload = payloadOf("outline.numbering", change);
    if (!payload.success) return invalid(payload.error.issues[0]?.message);
    const numbering = outlineSchemas(locale).numbering.safeParse(payload.data.numbering);
    if (!numbering.success) return invalid(numbering.error.issues[0]?.message);
    const outline = await setNumbering(tx, ownerId, change.entityId, numbering.data);
    return outline
      ? { status: "applied", entityId: change.entityId }
      : { status: "conflict", conflict: { reason: "missing" } };
  },
};
