import type { JSONContent } from "@tiptap/core";
import { and, eq, sql } from "drizzle-orm";

import {
  ideas,
  sermonOutlineDocuments,
  sermonOutlines,
  type SermonOutlineDocument,
} from "@/db/schema";
import { isForeignKeyViolation } from "@/db/types";
import type { Database } from "@/db/types";
import { markDeveloped } from "@/features/ideas/ideas";
import { restoreSermonDocument } from "@/features/sermon-editor/document";
import { prepareDocument } from "./canonical";
import {
  type CreateDocumentOutcome,
  type DocumentRefusal,
  type GetDocumentOutcome,
  type StoredDocument,
  type UpdateDocumentOutcome,
} from "./model";

/*
 * Sermon document persistence (A2.1): one schema v4 document to an outline,
 * in `sermon_outline_documents`, and nothing else reads or writes that table
 * (but for `authority.ts`, which only asks whether a row is there).
 *
 * Since A2.2 a row is the outline's content authority: an outline with one
 * takes no more legacy entry writes. An outline's first document is made by
 * converting its entries (`conversion.ts`); `createDocument` stays for that
 * module's tests and internal use, and no action calls it.
 *
 * - Every statement has the owner in its WHERE clause, so another account's
 *   document and one that does not exist are the same answer. The owner is
 *   the caller's to give from the session (actions.ts), never from input.
 * - Every document written is first accepted by `restoreSermonDocument`, and
 *   what is stored is its `doc.toJSON()`. A refused document is never stored
 *   or repaired.
 * - The document's revision is its own. `sermon_outlines` is never written
 *   here (its rows are `src/features/outlines`'s): the outline's existence
 *   and owner are checked by the foreign key, in the insert itself. A save
 *   reads it only to find, and hold, the outline's sermon.
 * - Nothing here touches the outline's entries or its revision. A save that
 *   changes what the document says calls `markDeveloped` on its sermon in
 *   the save's own transaction (A3, the owner's decision); nothing else here
 *   writes to the sermon.
 * - A create is one statement. A save is one transaction: the sermon's row,
 *   then the document's row, then the conditional write, whose revision check
 *   stays in its own WHERE clause. A failure of the database is thrown.
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

// What would be stored for a JSON (canonical.ts, pure since A2.3B.2A so the browser predicts with the same function).
export { prepareDocument };

const refusal = (refused: { ok: false } & DocumentRefusal): DocumentRefusal =>
  refused.status === "invalid"
    ? { status: "invalid", problems: refused.problems }
    : { status: "too_large", bytes: refused.bytes, limit: refused.limit };

/** The current revision of the owner's document for an outline, or null. */
async function currentRevision(db: Pick<Database, "select">, ownerId: string, outlineId: string) {
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
 * Inserts an outline's first document inside a transaction that already holds
 * the outline's locks and has checked it is the owner's (A2.2,
 * `conversion.ts`). `content` must be what `prepareDocument` returned. A
 * document already there is left exactly as it is, and the answer is null.
 * Nothing is caught: a failure aborts the caller's transaction, which then
 * writes nothing at all.
 */
export async function insertPreparedDocument(
  tx: Database,
  ownerId: string,
  outlineId: string,
  content: JSONContent,
): Promise<StoredDocument | null> {
  const [created] = await tx
    .insert(sermonOutlineDocuments)
    .values({ outlineId, ownerId, content, revision: 0 })
    .onConflictDoNothing({ target: sermonOutlineDocuments.outlineId })
    .returning();
  return created ? asStored(created) : null;
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

  return db.transaction(async (tx): Promise<UpdateDocumentOutcome> => {
    // The sermon's row first, then the document's: the order every other
    // write takes (`lockOutlineRows`: idea, then outline; deleting a sermon:
    // idea, outline, document), so a save and a sermon's deletion never
    // deadlock. Every save takes it, whether or not it changes anything.
    const [sermon] = await tx
      .select({ id: ideas.id })
      .from(ideas)
      .innerJoin(sermonOutlines, eq(sermonOutlines.sermonId, ideas.id))
      .where(
        and(
          eq(sermonOutlines.id, outlineId),
          eq(sermonOutlines.ownerId, ownerId),
          eq(ideas.ownerId, ownerId),
        ),
      )
      .limit(1)
      .for("no key update", { of: ideas });
    if (!sermon) return { status: "missing" };

    // Whether the save says something different from what is stored, compared
    // by the database (jsonb equality) on the row about to be written, which
    // stays locked to the end.
    const [current] = await tx
      .select({
        same: sql<boolean>`${sermonOutlineDocuments.content} = ${JSON.stringify(prepared.content)}::jsonb`,
      })
      .from(sermonOutlineDocuments)
      .where(
        and(ofOutline(ownerId, outlineId), eq(sermonOutlineDocuments.revision, expectedRevision)),
      )
      .for("update");

    if (current) {
      const [updated] = await tx
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
      if (updated) {
        // Work on the sermon's outline develops the sermon (A3, the owner's
        // decision), counted only when what the document says changed, and in
        // this transaction, so it commits or rolls back with the save.
        if (!current.same) await markDeveloped(tx, ownerId, sermon.id);
        return { status: "updated", ...updated };
      }
    }

    // Nothing was written; say why.
    const revision = await currentRevision(tx, ownerId, outlineId);
    return revision === null ? { status: "missing" } : { status: "stale", revision };
  });
}
