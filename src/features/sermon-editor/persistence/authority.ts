import { and, eq, sql, type AnyColumn, type SQL } from "drizzle-orm";

import { sermonOutlineDocuments } from "@/db/schema";
import type { Database } from "@/db/types";

/*
 * Content authority (A2.2): once an outline has a row in
 * `sermon_outline_documents`, that document is what the outline says, and
 * legacy entry writes no longer change it. Nothing else decides it: no flag,
 * no setting, no column.
 *
 * This is the one read of that table outside documents.ts, and it reads only
 * whether a row is there (`hasDocument`; and `documentExistsFor`, inside the
 * offline outline manifest's own statement, A2.3D). It loads no document and no editor schema, so the
 * legacy outline writes that ask it stay light.
 *
 * Callers ask it only after they hold the outline's row `FOR UPDATE`, in a
 * statement of its own: under READ COMMITTED that statement sees a document
 * committed while they waited for the lock, which a condition inside the
 * write itself would not.
 */

type Reader = Pick<Database, "select">;

/** True when the owner's outline has a sermon document, readable or not. */
export async function hasDocument(db: Reader, ownerId: string, outlineId: string) {
  const [row] = await db
    .select({ outlineId: sermonOutlineDocuments.outlineId })
    .from(sermonOutlineDocuments)
    .where(
      and(
        eq(sermonOutlineDocuments.outlineId, outlineId),
        eq(sermonOutlineDocuments.ownerId, ownerId),
      ),
    )
    .limit(1);
  return row !== undefined;
}

/**
 * Whether the outline these columns name has a sermon document, as a
 * condition inside another statement: the offline outline manifest asks it of
 * every outline at once (A2.3D), in its own statement and so its own
 * snapshot, by the table's primary key. It reads no content.
 */
export function documentExistsFor(outlineId: AnyColumn, ownerId: AnyColumn): SQL<boolean> {
  return sql<boolean>`exists (select 1 from ${sermonOutlineDocuments} where ${sermonOutlineDocuments.outlineId} = ${outlineId} and ${sermonOutlineDocuments.ownerId} = ${ownerId})`.mapWith(
    (value: unknown) => value === true || value === "t" || value === "true",
  );
}
