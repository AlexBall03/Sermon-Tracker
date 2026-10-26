import type { JSONContent } from "@tiptap/core";
import { and, eq, sql } from "drizzle-orm";

import { sermonOutlineDocuments, type SermonOutlineDocument } from "@/db/schema";
import { isForeignKeyViolation } from "@/db/types";
import type { Database } from "@/db/types";
import { restoreSermonDocument } from "@/features/sermon-editor/document";
import {
  documentLimits,
  utf8Bytes,
  type CreateDocumentOutcome,
  type DocumentRefusal,
  type GetDocumentOutcome,
  type StoredDocument,
  type UpdateDocumentOutcome,
} from "./model";

/*
 * Sermon document persistence (A2.1): one schema v4 document to an outline,
 * in `sermon_outline_documents`, and nothing else reads or writes that table.
 *
 * - Every statement has the owner in its WHERE clause, so another account's
 *   document and one that does not exist are the same answer. The owner is
 *   the caller's to give from the session (actions.ts), never from input.
 * - Every document written is first accepted by `restoreSermonDocument`, and
 *   what is stored is its `doc.toJSON()`. A refused document is never stored
 *   or repaired.
 * - The document's revision is its own. `sermon_outlines` is never read or
 *   written here (its rows are `src/features/outlines`'s): the outline's
 *   existence and owner are checked by the foreign key, in the insert itself.
 * - Nothing here touches the outline's entries, its revision, the sermon, or
 *   `markDeveloped`. What document work counts as development is still open.
 * - Each write is one statement, atomic by itself: no read before a write
 *   decides what is written. A failure of the database is thrown.
 */

const ofOutline = (ownerId: string, outlineId: string) =>
  and(eq(sermonOutlineDocuments.outlineId, outlineId), eq(sermonOutlineDocuments.ownerId, ownerId));

function asStored(row: SermonOutlineDocument): StoredDocument {
  return {
    outlineId: row.outlineId,
    content: row.content,
    revision: row.revision,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * What would be stored for `json`: its canonical form, or why it is refused.
 * The size is checked before the document is (so a huge one is not parsed),
 * and the canonical form again after, since that is what is stored. An older
 * document is migrated by the core, so what is stored is always v4.
 */
export function prepareDocument(
  json: unknown,
): { ok: true; content: JSONContent } | ({ ok: false } & DocumentRefusal) {
  const limit = documentLimits.bytes;
  let raw: string | undefined;
  try {
    raw = JSON.stringify(json);
  } catch {
    // A cycle or a BigInt: not JSON, so not a document.
  }
  if (raw === undefined) {
    return { ok: false, status: "invalid", problems: [{ code: "not_a_document" }] };
  }
  const rawBytes = utf8Bytes(raw);
  if (rawBytes > limit) return { ok: false, status: "too_large", bytes: rawBytes, limit };

  const restored = restoreSermonDocument(json);
  if (!restored.ok) return { ok: false, status: "invalid", problems: restored.problems };
  const content = restored.doc.toJSON() as JSONContent;
  const bytes = utf8Bytes(JSON.stringify(content));
  if (bytes > limit) return { ok: false, status: "too_large", bytes, limit };
  return { ok: true, content };
}

const refusal = (refused: { ok: false } & DocumentRefusal): DocumentRefusal =>
  refused.status === "invalid"
    ? { status: "invalid", problems: refused.problems }
    : { status: "too_large", bytes: refused.bytes, limit: refused.limit };

/** The current revision of the owner's document for an outline, or null. */
async function currentRevision(db: Database, ownerId: string, outlineId: string) {
  const [row] = await db
    .select({ revision: sermonOutlineDocuments.revision })
    .from(sermonOutlineDocuments)
    .where(ofOutline(ownerId, outlineId))
    .limit(1);
  return row?.revision ?? null;
}

/**
 * The owner's document for an outline. What is stored is checked again as it
 * is read; one that is no longer accepted is `unreadable`, with its problems,
 * and is neither repaired nor returned as a document.
 */
export async function getDocument(
  db: Database,
  ownerId: string,
  outlineId: string,
): Promise<GetDocumentOutcome> {
  const [row] = await db
    .select()
    .from(sermonOutlineDocuments)
    .where(ofOutline(ownerId, outlineId))
    .limit(1);
  if (!row) return { status: "missing" };
  const restored = restoreSermonDocument(row.content);
  if (!restored.ok) {
    return { status: "unreadable", revision: row.revision, problems: restored.problems };
  }
  return {
    status: "found",
    document: { ...asStored(row), content: restored.doc.toJSON() as JSONContent },
  };
}

/**
 * Gives one of the owner's outlines its first document, at revision 0. An
 * outline has one: asking again, or twice at once, writes nothing and
 * answers `exists` with the revision there is, leaving that document exactly
 * as it was. Creating is never a way to replace a document.
 *
 * The outline is not read first. The insert's foreign key, which carries the
 * owner, refuses an outline that is missing or another account's, and both
 * are `missing`.
 */
export async function createDocument(
  db: Database,
  ownerId: string,
  outlineId: string,
  json: unknown,
): Promise<CreateDocumentOutcome> {
  const prepared = prepareDocument(json);
  if (!prepared.ok) return refusal(prepared);

  let created: SermonOutlineDocument | undefined;
  try {
    [created] = await db
      .insert(sermonOutlineDocuments)
      .values({ outlineId, ownerId, content: prepared.content, revision: 0 })
      .onConflictDoNothing({ target: sermonOutlineDocuments.outlineId })
      .returning();
  } catch (error) {
    if (isForeignKeyViolation(error)) return { status: "missing" };
    throw error;
  }
  if (created) return { status: "created", document: asStored(created) };

  // Refused by the key: the outline has a document already, perhaps from a moment ago.
  const revision = await currentRevision(db, ownerId, outlineId);
  return revision === null ? { status: "missing" } : { status: "exists", revision };
}

/**
 * Saves the owner's document for an outline, made against `expectedRevision`.
 * The comparison and the write are one statement: when the stored revision
 * is not the one named, nothing is written and the answer is `stale` with
 * the revision there is. Newer content is never overwritten.
 *
 * An accepted save always writes and moves the revision on by one, even when
 * the document is the same as the one stored (as `updateEntry` does for an
 * entry's words). Not sending an unchanged document is the caller's to do.
 */
export async function updateDocument(
  db: Database,
  ownerId: string,
  outlineId: string,
  json: unknown,
  expectedRevision: number,
): Promise<UpdateDocumentOutcome> {
  const prepared = prepareDocument(json);
  if (!prepared.ok) return refusal(prepared);

  const [updated] = await db
    .update(sermonOutlineDocuments)
    .set({
      content: prepared.content,
      revision: sql`${sermonOutlineDocuments.revision} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(ofOutline(ownerId, outlineId), eq(sermonOutlineDocuments.revision, expectedRevision)),
    )
    .returning({
      revision: sermonOutlineDocuments.revision,
      updatedAt: sermonOutlineDocuments.updatedAt,
    });
  if (updated) return { status: "updated", ...updated };

  // Nothing was written; say why.
  const revision = await currentRevision(db, ownerId, outlineId);
  return revision === null ? { status: "missing" } : { status: "stale", revision };
}
