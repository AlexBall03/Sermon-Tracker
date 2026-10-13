import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import {
  ideas,
  preachingContexts,
  preachingOccurrences,
  preachingVenues,
  type Idea,
  type PreachingContext,
  type PreachingOccurrence,
  type PreachingVenue,
} from "@/db/schema";
import type { Database } from "@/db/types";
import { containing } from "@/features/ideas/ideas";
import { searchTerms } from "@/features/ideas/library-query";
import { historyPageSize, timesOfDay, type HistorySort } from "./model";
import {
  defaultHistoryQuery,
  type HistoryQuery,
  type OccurrenceInput,
  type OccurrenceUpdate,
} from "./schemas";

/** One occasion as history shows it: with the sermon it was, and where and what the occasion was. */
export type HistoryItem = PreachingOccurrence & {
  /**
   * The sermon as it is now. It may since have been archived, or filed as a
   * point or an undecided idea; the occasion is kept either way.
   */
  sermon: Pick<Idea, "id" | "title" | "kind" | "archivedAt">;
  venue: Pick<PreachingVenue, "id" | "name" | "locality"> | null;
  context: Pick<PreachingContext, "id" | "name"> | null;
};

/** One page of history, and how much there is altogether. */
export type HistoryPage = {
  items: HistoryItem[];
  /** Every occasion that matches, not only the ones on this page. */
  total: number;
  /** The page returned, which is the last page when a later one was asked for. */
  page: number;
  pageSize: number;
  totalPages: number;
};

/** What became of an attempt to record an occasion. */
export type CreateOutcome =
  | { status: "created"; occurrence: PreachingOccurrence }
  /** The ID was saved before by this account: the first one's row, exactly as it stands. */
  | { status: "existing"; occurrence: PreachingOccurrence }
  /** No such idea among the owner's. */
  | { status: "missing" }
  /** The idea is the owner's but is not, at this moment, a sermon. */
  | { status: "not_sermon" }
  | { status: "unknown_venue" }
  | { status: "unknown_context" }
  /** The ID could not be used. Nothing says why, and nothing was written or read. */
  | { status: "unavailable" };

export type UpdateOutcome =
  | { status: "updated"; occurrence: PreachingOccurrence }
  | { status: "missing" }
  | { status: "unknown_venue" }
  | { status: "unknown_context" };

/** How often a sermon has been preached, and when last. */
export type PreachingCount = { count: number; lastPreachedOn: string };

type Reader = Pick<Database, "select">;

/** The most a caller may ask for on one page. */
const maxPageSize = 100;

/*
 * Every function here takes the owner and puts it in the WHERE clause of the
 * statement that reads or writes the occasion, as ideas.ts does. Someone
 * else's occasion, sermon, venue, or context is indistinguishable from one
 * that does not exist. The database repeats the rule: all three foreign keys
 * carry the owner.
 *
 * Nothing here writes to `ideas`. Recording, changing, or removing an
 * occasion leaves the sermon's status, format, type, archive date, and
 * `updated_at` exactly as they were.
 */

async function ownsVenue(db: Reader, ownerId: string, id: string) {
  const rows = await db
    .select({ id: preachingVenues.id })
    .from(preachingVenues)
    .where(and(eq(preachingVenues.id, id), eq(preachingVenues.ownerId, ownerId)))
    .limit(1);
  return rows.length > 0;
}

async function ownsContext(db: Reader, ownerId: string, id: string) {
  const rows = await db
    .select({ id: preachingContexts.id })
    .from(preachingContexts)
    .where(and(eq(preachingContexts.id, id), eq(preachingContexts.ownerId, ownerId)))
    .limit(1);
  return rows.length > 0;
}

async function own(db: Reader, ownerId: string, id: string) {
  const [row] = await db
    .select()
    .from(preachingOccurrences)
    .where(and(eq(preachingOccurrences.id, id), eq(preachingOccurrences.ownerId, ownerId)))
    .limit(1);
  return row ?? null;
}

/**
 * Records that a sermon was preached. The ID may come from the browser, which
 * makes a repeated submission harmless: the second attempt finds the first
 * one's row and returns it unchanged, whatever the second one said. An ID
 * that belongs to another account is `unavailable`, and that row is neither
 * read nor touched.
 *
 * Only an idea that is a sermon now can be preached. That is checked with the
 * idea's row locked, so a reclassification at the same moment runs wholly
 * before this or wholly after it: before, and this is refused; after, and the
 * occasion stands, as every occasion does when its sermon is later refiled.
 * A deletion at the same moment waits the same way and is then refused.
 */
export async function createOccurrence(
  db: Database,
  ownerId: string,
  input: OccurrenceInput,
  id?: string,
): Promise<CreateOutcome> {
  return db.transaction(async (tx): Promise<CreateOutcome> => {
    const [idea] = await tx
      .select({ id: ideas.id, kind: ideas.kind })
      .from(ideas)
      .where(and(eq(ideas.id, input.sermonId), eq(ideas.ownerId, ownerId)))
      .for("update");

    // A retry is answered before anything is checked again: it changes nothing.
    const before = id ? await own(tx, ownerId, id) : null;
    if (before) return { status: "existing", occurrence: before };

    if (!idea) return { status: "missing" };
    if (idea.kind !== "sermon") return { status: "not_sermon" };
    if (input.venueId && !(await ownsVenue(tx, ownerId, input.venueId))) {
      return { status: "unknown_venue" };
    }
    if (input.contextId && !(await ownsContext(tx, ownerId, input.contextId))) {
      return { status: "unknown_context" };
    }

    const [created] = await tx
      .insert(preachingOccurrences)
      .values({
        ...(id ? { id } : {}),
        ownerId,
        sermonId: idea.id,
        preachedOn: input.preachedOn,
        timeOfDay: input.timeOfDay,
        venueId: input.venueId,
        contextId: input.contextId,
        actualFormat: input.actualFormat,
        durationMinutes: input.durationMinutes,
        notes: input.notes,
        recordingUrl: input.recordingUrl,
      })
      .onConflictDoNothing({ target: preachingOccurrences.id })
      .returning();
    if (created) return { status: "created", occurrence: created };

    // The ID was taken: by this account a moment ago, or by another.
    const mine = id ? await own(tx, ownerId, id) : null;
    return mine ? { status: "existing", occurrence: mine } : { status: "unavailable" };
  });
}

/** History's rows with the sermon, venue, and context each one names. */
function historyRows(db: Reader) {
  return db
    .select({
      occurrence: preachingOccurrences,
      sermon: {
        id: ideas.id,
        title: ideas.title,
        kind: ideas.kind,
        archivedAt: ideas.archivedAt,
      },
      venue: {
        id: preachingVenues.id,
        name: preachingVenues.name,
        locality: preachingVenues.locality,
      },
      context: { id: preachingContexts.id, name: preachingContexts.name },
    })
    .from(preachingOccurrences)
    .innerJoin(
      ideas,
      and(
        eq(ideas.id, preachingOccurrences.sermonId),
        eq(ideas.ownerId, preachingOccurrences.ownerId),
      ),
    )
    .leftJoin(
      preachingVenues,
      and(
        eq(preachingVenues.id, preachingOccurrences.venueId),
        eq(preachingVenues.ownerId, preachingOccurrences.ownerId),
      ),
    )
    .leftJoin(
      preachingContexts,
      and(
        eq(preachingContexts.id, preachingOccurrences.contextId),
        eq(preachingContexts.ownerId, preachingOccurrences.ownerId),
      ),
    );
}

type HistoryRow = Awaited<ReturnType<typeof historyRows>>[number];

const asItem = ({ occurrence, sermon, venue, context }: HistoryRow): HistoryItem => ({
  ...occurrence,
  sermon,
  venue,
  context,
});

/** One of the owner's occasions, or null. */
export async function getOccurrence(
  db: Reader,
  ownerId: string,
  id: string,
): Promise<HistoryItem | null> {
  const [row] = await historyRows(db)
    .where(and(eq(preachingOccurrences.id, id), eq(preachingOccurrences.ownerId, ownerId)))
    .limit(1);
  return row ? asItem(row) : null;
}

/**
 * Changes an occasion: the fields the change names, and no others. A field
 * given as null is cleared. The sermon cannot be changed. The occasion may be
 * edited whatever has become of its sermon since.
 */
export async function updateOccurrence(
  db: Database,
  ownerId: string,
  id: string,
  change: OccurrenceUpdate,
): Promise<UpdateOutcome> {
  return db.transaction(async (tx): Promise<UpdateOutcome> => {
    if (change.venueId && !(await ownsVenue(tx, ownerId, change.venueId))) {
      return { status: "unknown_venue" };
    }
    if (change.contextId && !(await ownsContext(tx, ownerId, change.contextId))) {
      return { status: "unknown_context" };
    }
    // An undefined column is not written, so it stays as it was.
    const [updated] = await tx
      .update(preachingOccurrences)
      .set({
        preachedOn: change.preachedOn,
        timeOfDay: change.timeOfDay,
        venueId: change.venueId,
        contextId: change.contextId,
        actualFormat: change.actualFormat,
        durationMinutes: change.durationMinutes,
        notes: change.notes,
        recordingUrl: change.recordingUrl,
      })
      .where(and(eq(preachingOccurrences.id, id), eq(preachingOccurrences.ownerId, ownerId)))
      .returning();
    return updated ? { status: "updated", occurrence: updated } : { status: "missing" };
  });
}

/** True when the owner's occasion was deleted. The sermon, the venue, the context, and every other occasion stay. */
export async function deleteOccurrence(db: Database, ownerId: string, id: string) {
  const deleted = await db
    .delete(preachingOccurrences)
    .where(and(eq(preachingOccurrences.id, id), eq(preachingOccurrences.ownerId, ownerId)))
    .returning({ id: preachingOccurrences.id });
  return deleted.length > 0;
}

/** Later in the day sorts after earlier, and an occasion that did not say sorts before both. */
const partOfDay = sql`case ${preachingOccurrences.timeOfDay} when 'pm' then 2 when 'am' then 1 else 0 end`;

/**
 * History's orderings. A sort arrives as one of these keys and never as a
 * column name. Each ends with the ID, in the same direction, so occasions
 * that tie keep one order from page to page.
 */
const sortOrders: Record<HistorySort, SQL[]> = {
  "date-desc": [
    desc(preachingOccurrences.preachedOn),
    desc(partOfDay),
    desc(preachingOccurrences.createdAt),
    desc(preachingOccurrences.id),
  ],
  "date-asc": [
    asc(preachingOccurrences.preachedOn),
    asc(partOfDay),
    asc(preachingOccurrences.createdAt),
    asc(preachingOccurrences.id),
  ],
};

/**
 * Everything a history query asks of an occasion, as conditions that must all
 * hold. Nothing here looks at whether the sermon is archived or what kind of
 * idea it is now: history is what happened, and is kept through both.
 */
function historyConditions(ownerId: string, query: HistoryQuery) {
  const conditions: (SQL | undefined)[] = [eq(preachingOccurrences.ownerId, ownerId)];

  // Every word must be found, each in any of the names.
  for (const term of searchTerms(query.q)) {
    const pattern = containing(term);
    conditions.push(
      or(
        ilike(ideas.title, pattern),
        ilike(preachingVenues.name, pattern),
        ilike(preachingVenues.locality, pattern),
        ilike(preachingContexts.name, pattern),
      ),
    );
  }

  if (query.sermonId) conditions.push(eq(preachingOccurrences.sermonId, query.sermonId));
  // Dates are compared as calendar days, both ends included.
  if (query.from) conditions.push(gte(preachingOccurrences.preachedOn, query.from));
  if (query.through) conditions.push(lte(preachingOccurrences.preachedOn, query.through));

  // Within a filter any chosen value will do; an empty filter asks nothing.
  if (query.venueIds.length > 0) {
    conditions.push(inArray(preachingOccurrences.venueId, query.venueIds));
  }
  if (query.contextIds.length > 0) {
    conditions.push(inArray(preachingOccurrences.contextId, query.contextIds));
  }
  if (query.formats.length > 0) {
    conditions.push(inArray(preachingOccurrences.actualFormat, query.formats));
  }
  if (query.timesOfDay.length > 0) {
    const said = timesOfDay.filter((value) => query.timesOfDay.includes(value));
    conditions.push(
      or(
        said.length > 0 ? inArray(preachingOccurrences.timeOfDay, said) : undefined,
        query.timesOfDay.includes("unspecified")
          ? isNull(preachingOccurrences.timeOfDay)
          : undefined,
      ),
    );
  }

  return and(...conditions);
}

/**
 * One page of the owner's preaching history: searched, filtered, ordered, and
 * counted by the database, most recently preached first unless asked
 * otherwise. A page past the end returns the last page.
 */
export async function searchHistory(
  db: Database,
  ownerId: string,
  query: HistoryQuery = defaultHistoryQuery,
  pageSize: number = historyPageSize,
): Promise<HistoryPage> {
  const size = Math.min(Math.max(Math.trunc(pageSize) || historyPageSize, 1), maxPageSize);
  const where = historyConditions(ownerId, query);

  // The same joins as the page, so a search over the names counts what it finds.
  const [{ total }] = await db
    .select({ total: count() })
    .from(preachingOccurrences)
    .innerJoin(
      ideas,
      and(
        eq(ideas.id, preachingOccurrences.sermonId),
        eq(ideas.ownerId, preachingOccurrences.ownerId),
      ),
    )
    .leftJoin(
      preachingVenues,
      and(
        eq(preachingVenues.id, preachingOccurrences.venueId),
        eq(preachingVenues.ownerId, preachingOccurrences.ownerId),
      ),
    )
    .leftJoin(
      preachingContexts,
      and(
        eq(preachingContexts.id, preachingOccurrences.contextId),
        eq(preachingContexts.ownerId, preachingOccurrences.ownerId),
      ),
    )
    .where(where);
  const totalPages = Math.ceil(total / size);
  const page = Math.min(Math.max(Math.trunc(query.page) || 1, 1), Math.max(totalPages, 1));
  if (total === 0) return { items: [], total, page, pageSize: size, totalPages };

  const rows = await historyRows(db)
    .where(where)
    .orderBy(...(sortOrders[query.sort] ?? sortOrders["date-desc"]))
    .limit(size)
    .offset((page - 1) * size);
  return { items: rows.map(asItem), total, page, pageSize: size, totalPages };
}

/** One sermon's occasions, most recent first, a page at a time. */
export async function listForSermon(
  db: Database,
  ownerId: string,
  sermonId: string,
  page: number = 1,
  pageSize: number = historyPageSize,
): Promise<HistoryPage> {
  return searchHistory(db, ownerId, { ...defaultHistoryQuery, sermonId, page }, pageSize);
}

/**
 * How often each of these ideas has been preached and when last, in one
 * query. An idea that never was has no entry. This is counted from history
 * each time: no count is kept on the idea.
 */
export async function occurrenceCounts(
  db: Reader,
  ownerId: string,
  sermonIds: string[],
): Promise<Map<string, PreachingCount>> {
  const counts = new Map<string, PreachingCount>();
  if (sermonIds.length === 0) return counts;
  const rows = await db
    .select({
      sermonId: preachingOccurrences.sermonId,
      count: count(),
      // As text, so no driver reads the date as a moment.
      lastPreachedOn: sql<string>`max(${preachingOccurrences.preachedOn})::text`,
    })
    .from(preachingOccurrences)
    .where(
      and(
        eq(preachingOccurrences.ownerId, ownerId),
        inArray(preachingOccurrences.sermonId, sermonIds),
      ),
    )
    .groupBy(preachingOccurrences.sermonId);
  for (const { sermonId, ...rest } of rows) counts.set(sermonId, rest);
  return counts;
}
