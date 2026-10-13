import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  sql,
  type SQL,
} from "drizzle-orm";

import { ideas, outlineEntries, sermonOutlines, type Idea, type SermonOutline } from "@/db/schema";
import type { Database } from "@/db/types";
import { containing, statusAsRead } from "@/features/ideas/ideas";
import { searchTerms } from "@/features/ideas/library-query";
import type { ArchiveView } from "@/features/ideas/model";
import { listEntries, type PlacedEntry } from "./entries";
import { outlinePageSize, type OutlineSort } from "./model";
import { readNumbering, type NumberingConfig } from "./numbering";

/*
 * Sermon outlines: one to a sermon, made for a sermon that already exists.
 *
 * As in ideas.ts, every function takes the owner and puts it in the WHERE
 * clause of each statement, so someone else's outline is indistinguishable
 * from one that does not exist. The database repeats the rule: the outline's
 * foreign key carries the owner.
 *
 * Nothing here writes to `ideas`. Making, numbering, or deleting an outline
 * leaves the sermon's status, its classifications, `updated_at`, and
 * `last_developed_at` exactly as they were: an empty outline is not yet work
 * on the sermon. What is put in it is (see entries.ts). An outline has no
 * status of its own: it is there or it is not.
 */

/** An outline as it is read: how it is numbered, and how often its shape has changed. */
export type OutlineRecord = {
  id: string;
  sermonId: string;
  numbering: NumberingConfig;
  /** Moves when an entry is added, moved, or removed. */
  revision: number;
  createdAt: Date;
  updatedAt: Date;
};

/** The sermon an outline is of, as it is now. It may since have been archived or filed as something else. */
export type OutlineSermon = Pick<Idea, "id" | "title" | "kind" | "archivedAt">;

/** An outline with its sermon and every entry, in the order they are shown. */
export type OutlineWithEntries = OutlineRecord & {
  sermon: OutlineSermon;
  entries: PlacedEntry[];
};

/** An outline as a list shows it. */
export type OutlineSummary = OutlineRecord & {
  /** With the sermon's own status: an outline has none. */
  sermon: OutlineSermon & Pick<Idea, "status">;
  /** Every entry, sections included. An outline with none is still an outline. */
  entryCount: number;
};

export type OutlinePage = {
  items: OutlineSummary[];
  /** Every outline that matches, not only the ones on this page. */
  total: number;
  /** The page returned, which is the last page when a later one was asked for. */
  page: number;
  pageSize: number;
  totalPages: number;
};

type Reader = Pick<Database, "select">;

/** The most a caller may ask for on one page. */
const maxPageSize = 100;

function asOutline(row: SermonOutline): OutlineRecord {
  return {
    id: row.id,
    sermonId: row.sermonId,
    numbering: readNumbering(row.numberingConfig),
    revision: row.revision,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const sermon = {
  id: ideas.id,
  title: ideas.title,
  kind: ideas.kind,
  archivedAt: ideas.archivedAt,
};

/** What became of an attempt to make an outline. */
export type CreateOutlineOutcome =
  | { status: "created"; outline: OutlineRecord }
  /** The sermon has one already: that outline, exactly as it stands. */
  | { status: "exists"; outline: OutlineRecord }
  /** No such idea among the owner's. */
  | { status: "missing" }
  /** The idea is the owner's but is not, at this moment, a sermon. */
  | { status: "not_sermon" }
  /** The ID could not be used. Nothing says why, and nothing was written. */
  | { status: "unavailable" };

/**
 * Makes the outline of one of the owner's sermons, with no entries and the
 * default numbering. A sermon has one outline: asking again, or twice at
 * once, makes none and answers with the one there is.
 *
 * Only an idea that is a sermon now can be given one. That is checked with
 * the idea's row locked, as recording an occasion checks it, which also puts
 * two requests for the same sermon one after the other. The table's own
 * UNIQUE (sermon_id) refuses a second whatever this misses.
 */
export async function createOutline(
  db: Database,
  ownerId: string,
  sermonId: string,
  id?: string,
): Promise<CreateOutlineOutcome> {
  return db.transaction(async (tx): Promise<CreateOutlineOutcome> => {
    const [idea] = await tx
      .select({ id: ideas.id, kind: ideas.kind })
      .from(ideas)
      .where(and(eq(ideas.id, sermonId), eq(ideas.ownerId, ownerId)))
      .for("update");
    if (!idea) return { status: "missing" };

    const ofSermon = and(eq(sermonOutlines.sermonId, idea.id), eq(sermonOutlines.ownerId, ownerId));
    const [before] = await tx.select().from(sermonOutlines).where(ofSermon).limit(1);
    if (before) return { status: "exists", outline: asOutline(before) };
    if (idea.kind !== "sermon") return { status: "not_sermon" };

    const [created] = await tx
      .insert(sermonOutlines)
      .values({ ...(id ? { id } : {}), ownerId, sermonId: idea.id })
      .onConflictDoNothing()
      .returning();
    if (created) return { status: "created", outline: asOutline(created) };

    // Refused by the table: the sermon was given one a moment ago, or the ID is taken.
    const [after] = await tx.select().from(sermonOutlines).where(ofSermon).limit(1);
    return after ? { status: "exists", outline: asOutline(after) } : { status: "unavailable" };
  });
}

async function withEntries(
  db: Reader,
  ownerId: string,
  row: { outline: SermonOutline; sermon: OutlineSermon } | undefined,
): Promise<OutlineWithEntries | null> {
  if (!row) return null;
  return {
    ...asOutline(row.outline),
    sermon: row.sermon,
    entries: await listEntries(db, ownerId, row.outline.id),
  };
}

function outlineRows(db: Reader) {
  return db
    .select({ outline: sermonOutlines, sermon })
    .from(sermonOutlines)
    .innerJoin(
      ideas,
      and(eq(ideas.id, sermonOutlines.sermonId), eq(ideas.ownerId, sermonOutlines.ownerId)),
    );
}

/**
 * One of the owner's outlines with its entries, or null. It is returned
 * whatever has become of its sermon since: archived, or filed as a point.
 */
export async function getOutline(
  db: Reader,
  ownerId: string,
  id: string,
): Promise<OutlineWithEntries | null> {
  const [row] = await outlineRows(db)
    .where(and(eq(sermonOutlines.id, id), eq(sermonOutlines.ownerId, ownerId)))
    .limit(1);
  return withEntries(db, ownerId, row);
}

/**
 * One of the owner's outlines and the sermon it is of, without its entries:
 * enough to name it, for a page that only leads back to it.
 */
export async function getOutlineSermon(
  db: Reader,
  ownerId: string,
  id: string,
): Promise<{ id: string; sermon: OutlineSermon } | null> {
  const [row] = await outlineRows(db)
    .where(and(eq(sermonOutlines.id, id), eq(sermonOutlines.ownerId, ownerId)))
    .limit(1);
  return row ? { id: row.outline.id, sermon: row.sermon } : null;
}

/** The outline of one of the owner's sermons with its entries, or null when it has none. */
export async function getOutlineForSermon(
  db: Reader,
  ownerId: string,
  sermonId: string,
): Promise<OutlineWithEntries | null> {
  const [row] = await outlineRows(db)
    .where(and(eq(sermonOutlines.sermonId, sermonId), eq(sermonOutlines.ownerId, ownerId)))
    .limit(1);
  return withEntries(db, ownerId, row);
}

/**
 * The outlines of these sermons, by sermon: one query, for a page that shows
 * several sermons and says of each whether it has an outline. A sermon that
 * has none, or is not the owner's, is simply not in the answer.
 */
export async function outlineIdsForSermons(
  db: Reader,
  ownerId: string,
  sermonIds: string[],
): Promise<Map<string, string>> {
  if (sermonIds.length === 0) return new Map();
  const rows = await db
    .select({ id: sermonOutlines.id, sermonId: sermonOutlines.sermonId })
    .from(sermonOutlines)
    .where(and(eq(sermonOutlines.ownerId, ownerId), inArray(sermonOutlines.sermonId, sermonIds)));
  return new Map(rows.map((row) => [row.sermonId, row.id]));
}

/** What a list of sermons says of each one's outline: that it is there, how much it holds, and when it was worked on. */
export type SermonOutlineSummary = { id: string; entryCount: number; updatedAt: Date };

/**
 * The outlines of these sermons, by sermon, each with how many entries it
 * has: one query, and no entry of any is read. For the dashboard, which says
 * of each sermon being worked on whether it has an outline and what is in it.
 * A sermon that has none, or is not the owner's, is simply not in the answer.
 */
export async function outlinesForSermons(
  db: Reader,
  ownerId: string,
  sermonIds: string[],
): Promise<Map<string, SermonOutlineSummary>> {
  if (sermonIds.length === 0) return new Map();
  const rows = await db
    .select({
      id: sermonOutlines.id,
      sermonId: sermonOutlines.sermonId,
      updatedAt: sermonOutlines.updatedAt,
      // Counted over the join: an outline with no entry has one row here, with no entry in it.
      entryCount: sql<number>`count(${outlineEntries.id})::int`,
    })
    .from(sermonOutlines)
    .leftJoin(
      outlineEntries,
      and(
        eq(outlineEntries.outlineId, sermonOutlines.id),
        eq(outlineEntries.ownerId, sermonOutlines.ownerId),
      ),
    )
    .where(and(eq(sermonOutlines.ownerId, ownerId), inArray(sermonOutlines.sermonId, sermonIds)))
    .groupBy(sermonOutlines.id);
  return new Map(rows.map(({ sermonId, ...outline }) => [sermonId, outline]));
}

/**
 * The orders a list of outlines may be in. A sort arrives as one of these
 * keys and never as a column name, and each ends with the ID, in the same
 * direction, so outlines that tie keep one order from page to page.
 */
const sortOrders: Record<OutlineSort, SQL[]> = {
  "updated-desc": [desc(sermonOutlines.updatedAt), desc(sermonOutlines.id)],
  "updated-asc": [asc(sermonOutlines.updatedAt), asc(sermonOutlines.id)],
  "title-asc": [asc(sql`lower(${ideas.title})`), asc(sermonOutlines.id)],
  "title-desc": [desc(sql`lower(${ideas.title})`), desc(sermonOutlines.id)],
  "created-desc": [desc(sermonOutlines.createdAt), desc(sermonOutlines.id)],
};

/**
 * One page of the owner's outlines, most recently worked on first unless
 * another order is asked for, each with its sermon and how many entries it
 * has. An empty outline is listed like any other. `q` finds outlines by their
 * sermon's title: every word must be in it, as in the library's search.
 *
 * Only the outlines on the page are read, and no entry of any: the count of
 * entries is worked out by the database.
 *
 * It is a list of sermons' outlines, so it follows the rule for lists of
 * ideas: an outline whose sermon is archived is left out unless `archive`
 * asks for it, and one whose idea is no longer filed as a sermon is left out
 * until it is filed back. Neither is deleted, and `getOutline` still returns
 * both.
 */
export async function listOutlines(
  db: Database,
  ownerId: string,
  options: {
    archive?: ArchiveView;
    q?: string;
    sort?: OutlineSort;
    page?: number;
    pageSize?: number;
  } = {},
): Promise<OutlinePage> {
  const { archive = "active", q = "", sort = "updated-desc" } = options;
  const size = Math.min(
    Math.max(Math.trunc(options.pageSize ?? outlinePageSize) || outlinePageSize, 1),
    maxPageSize,
  );
  const where = and(
    eq(sermonOutlines.ownerId, ownerId),
    eq(ideas.kind, "sermon"),
    archive === "active" ? isNull(ideas.archivedAt) : undefined,
    archive === "archived" ? isNotNull(ideas.archivedAt) : undefined,
    ...searchTerms(q).map((term) => ilike(ideas.title, containing(term))),
  );
  const joined = and(
    eq(ideas.id, sermonOutlines.sermonId),
    eq(ideas.ownerId, sermonOutlines.ownerId),
  );

  const [{ total }] = await db
    .select({ total: count() })
    .from(sermonOutlines)
    .innerJoin(ideas, joined)
    .where(where);
  const totalPages = Math.ceil(total / size);
  const page = Math.min(Math.max(Math.trunc(options.page ?? 1) || 1, 1), Math.max(totalPages, 1));
  if (total === 0) return { items: [], total, page, pageSize: size, totalPages };

  const rows = await db
    .select({
      outline: sermonOutlines,
      sermon: { ...sermon, status: ideas.status },
      entryCount: sql<number>`(
        select count(*)::int from ${outlineEntries}
        where ${outlineEntries.outlineId} = ${sermonOutlines.id}
          and ${outlineEntries.ownerId} = ${ownerId}
      )`,
    })
    .from(sermonOutlines)
    .innerJoin(ideas, joined)
    .where(where)
    .orderBy(...(sortOrders[sort] ?? sortOrders["updated-desc"]))
    .limit(size)
    .offset((page - 1) * size);
  return {
    items: rows.map((row) => ({
      ...asOutline(row.outline),
      sermon: { ...row.sermon, status: statusAsRead(row.sermon.status) },
      entryCount: row.entryCount,
    })),
    total,
    page,
    pageSize: size,
    totalPages,
  };
}

/**
 * Changes how an outline is numbered, and nothing else: no entry, title,
 * note, parent, or position is read or written, and the shape's revision
 * does not move. Returns the outline, or null when it is not the owner's.
 */
export async function setNumbering(
  db: Database,
  ownerId: string,
  id: string,
  numbering: NumberingConfig,
): Promise<OutlineRecord | null> {
  const [updated] = await db
    .update(sermonOutlines)
    .set({ numberingConfig: numbering })
    .where(and(eq(sermonOutlines.id, id), eq(sermonOutlines.ownerId, ownerId)))
    .returning();
  return updated ? asOutline(updated) : null;
}

/**
 * Deletes the owner's outline with every entry of it. The sermon is kept
 * exactly as it was, and so are the saved points any entry was made from.
 * Returns the sermon it was the outline of, or null when there was nothing
 * to delete.
 */
export async function deleteOutline(
  db: Database,
  ownerId: string,
  id: string,
): Promise<{ sermonId: string } | null> {
  const [deleted] = await db
    .delete(sermonOutlines)
    .where(and(eq(sermonOutlines.id, id), eq(sermonOutlines.ownerId, ownerId)))
    .returning({ sermonId: sermonOutlines.sermonId });
  return deleted ?? null;
}
