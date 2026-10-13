import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import {
  ideas,
  ideaScriptureReferences,
  ideaTags,
  preachingOccurrences,
  type Idea,
} from "@/db/schema";
import { isForeignKeyViolation, type Database } from "@/db/types";
import { referenceKey, type ScriptureReference } from "@/features/scripture/reference";
import { searchTerms, startOfDay, startOfNextDay, type LibraryQuery } from "./library-query";
import {
  classificationDefaults,
  ideaLimits,
  legacyIdeaStatus,
  libraryPageSize,
  revisitAfterDays,
  unfinishedStatuses,
  type IdeaKind,
  type LibrarySort,
} from "./model";
import type { ClassificationInput, IdeaInput, IdeaReference, IdeaUpdate } from "./schemas";
import { tagsForIdeas, writeIdeaTags, type IdeaTag } from "./tags";

/** An idea as the application reads it: a row that has passed through `asRead`. */
export type IdeaRecord = Idea;

export type IdeaWithReferences = IdeaRecord & { references: IdeaReference[]; tags: IdeaTag[] };

/** One page of the library, and how much there is altogether. */
export type LibraryPage = {
  items: IdeaWithReferences[];
  /** Every idea that matches, not only the ones on this page. */
  total: number;
  /** The page returned, which is the last page when a later one was asked for. */
  page: number;
  pageSize: number;
  totalPages: number;
};

/** The most a caller may ask for on one page. */
const maxPageSize = 100;

/**
 * A stored row as it is read. Since migration 0008 the table holds only the
 * current values, so this changes nothing. It is kept as a guard for a
 * database that migration has not reached yet (a preview deployment shares
 * the development database): there `captured` is `idea` and no sermon type is
 * `unspecified`, the two old values and no others. Nothing is guessed.
 */
export function asRead(row: Idea): IdeaRecord {
  const stored: { status: string; sermonType: string | null } = row;
  return {
    ...row,
    status: stored.status === legacyIdeaStatus ? classificationDefaults.status : row.status,
    sermonType: stored.sermonType === null ? classificationDefaults.sermonType : row.sermonType,
  };
}

type Reader = Pick<Database, "select">;
type Writer = Pick<Database, "insert" | "delete">;

/*
 * Every function here takes the owner and puts it in the WHERE clause of the
 * statement that reads or writes the idea. Someone else's idea is therefore
 * indistinguishable from one that does not exist, and no function accepts an
 * owner from anywhere but its caller's session.
 */

async function referencesFor(db: Reader, ownerId: string, ideaIds: string[]) {
  const byIdea = new Map<string, IdeaReference[]>();
  if (ideaIds.length === 0) return byIdea;
  const rows = await db
    .select({
      ideaId: ideaScriptureReferences.ideaId,
      isPrimary: ideaScriptureReferences.isPrimary,
      book: ideaScriptureReferences.book,
      chapterStart: ideaScriptureReferences.chapterStart,
      verseStart: ideaScriptureReferences.verseStart,
      chapterEnd: ideaScriptureReferences.chapterEnd,
      verseEnd: ideaScriptureReferences.verseEnd,
    })
    .from(ideaScriptureReferences)
    // Joined to the idea so ownership is checked again in this statement.
    .innerJoin(ideas, eq(ideas.id, ideaScriptureReferences.ideaId))
    .where(and(eq(ideas.ownerId, ownerId), inArray(ideaScriptureReferences.ideaId, ideaIds)))
    .orderBy(asc(ideaScriptureReferences.ideaId), asc(ideaScriptureReferences.position));
  for (const { ideaId, ...reference } of rows) {
    const list = byIdea.get(ideaId) ?? [];
    list.push(reference);
    byIdea.set(ideaId, list);
  }
  return byIdea;
}

/** References and tags for a page of ideas: two queries however many ideas there are. */
async function withReferences(db: Reader, ownerId: string, rows: Idea[]) {
  const ids = rows.map((row) => row.id);
  const [references, tags] = await Promise.all([
    referencesFor(db, ownerId, ids),
    tagsForIdeas(db, ownerId, ids),
  ]);
  return rows.map((row) => ({
    ...asRead(row),
    references: references.get(row.id) ?? [],
    tags: tags.get(row.id) ?? [],
  }));
}

async function writeReferences(db: Writer, ideaId: string, references: IdeaReference[]) {
  await db.delete(ideaScriptureReferences).where(eq(ideaScriptureReferences.ideaId, ideaId));
  if (references.length === 0) return;
  await db
    .insert(ideaScriptureReferences)
    .values(references.map((reference, position) => ({ ...reference, ideaId, position })));
}

/**
 * The columns a person may set, named one by one: nothing else reaches the
 * table. A classification an update leaves out is undefined here, and an
 * undefined column is not written, so it stays as it was.
 */
function columns(input: IdeaInput | IdeaUpdate) {
  return {
    kind: input.kind,
    title: input.title,
    notes: input.notes,
    status: input.status,
    intendedFormat: input.intendedFormat,
    sermonType: input.sermonType,
    subject: input.subject,
  };
}

/**
 * Replaces the idea's tags when the input names any, and returns the tags it
 * then has. Input without `tagIds` leaves them alone. A tag that is not the
 * owner's throws, which undoes the whole save.
 */
async function saveTags(tx: Reader & Writer, idea: Idea, input: IdeaInput | IdeaUpdate) {
  if (input.tagIds) await writeIdeaTags(tx, idea.ownerId, idea.id, input.tagIds);
  return (await tagsForIdeas(tx, idea.ownerId, [idea.id])).get(idea.id) ?? [];
}

export async function getIdea(
  db: Reader,
  ownerId: string,
  id: string,
): Promise<IdeaWithReferences | null> {
  const rows = await db
    .select()
    .from(ideas)
    .where(and(eq(ideas.id, id), eq(ideas.ownerId, ownerId)))
    .limit(1);
  const [idea] = await withReferences(db, ownerId, rows);
  return idea ?? null;
}

/**
 * The owner's few most recently changed ideas, for the dashboard. An archived
 * idea has been put away and is not among them. The library uses `searchIdeas`.
 */
export async function recentIdeas(
  db: Database,
  ownerId: string,
  limit: number,
): Promise<IdeaWithReferences[]> {
  const rows = await db
    .select()
    .from(ideas)
    .where(and(eq(ideas.ownerId, ownerId), isNull(ideas.archivedAt)))
    .orderBy(desc(ideas.updatedAt), desc(ideas.id))
    .limit(limit);
  return withReferences(db, ownerId, rows);
}

/**
 * When an idea was last worked on: its last development, or its capture when
 * there has been none. An idea from before `last_developed_at` existed is
 * therefore as old as its creation, and never looks newly active.
 */
const workedOn = sql`coalesce(${ideas.lastDevelopedAt}, ${ideas.createdAt})`;

/** The instant at or before which an idea not worked on since has waited long enough to be offered again. */
export function revisitCutoff(now: Date = new Date()) {
  return new Date(now.getTime() - revisitAfterDays * 24 * 60 * 60 * 1000);
}

/** A sermon idea that has not been worked on since it was captured, whatever its status or age. */
function neverDeveloped() {
  return and(eq(ideas.kind, "sermon"), isNull(ideas.lastDevelopedAt));
}

/**
 * An unfinished sermon idea that has gone without work since before the
 * cutoff. The dashboard's suggestions and the library's filter are this one
 * rule. It says nothing of the archive, which each caller decides.
 */
function needsAttention(now: Date) {
  return and(
    eq(ideas.kind, "sermon"),
    inArray(ideas.status, [...unfinishedStatuses]),
    sql`${workedOn} <= ${revisitCutoff(now).toISOString()}::timestamptz`,
  );
}

/**
 * The few sermon ideas most worth returning to, for the dashboard: unfinished,
 * not archived, and not worked on for `revisitAfterDays`. Fewer than `limit`,
 * or none, when no more qualify; nothing is added to fill the list.
 *
 * The order is fixed. First the ideas never worked on since they were
 * captured, then those worked on before, then those on hold, which were put
 * aside on purpose. Within each, the longest neglected first, and the ID
 * settles a tie. The database filters, orders, and limits; only the rows
 * returned are read.
 */
export async function revisitIdeas(
  db: Reader,
  ownerId: string,
  limit: number = 3,
  now: Date = new Date(),
): Promise<IdeaRecord[]> {
  const rows = await db
    .select()
    .from(ideas)
    .where(and(eq(ideas.ownerId, ownerId), isNull(ideas.archivedAt), needsAttention(now)))
    .orderBy(
      sql`case when ${ideas.status} = 'on_hold' then 2 when ${ideas.lastDevelopedAt} is null then 0 else 1 end`,
      asc(workedOn),
      asc(ideas.id),
    )
    .limit(limit);
  return rows.map(asRead);
}

/** How many of the owner's ideas are archived: what a library with nothing active in it may still hold. */
export async function archivedCount(db: Reader, ownerId: string): Promise<number> {
  const [{ total }] = await db
    .select({ total: count() })
    .from(ideas)
    .where(and(eq(ideas.ownerId, ownerId), isNotNull(ideas.archivedAt)));
  return total;
}

/**
 * The orderings the library offers. A sort arrives as one of these keys and
 * never as a column name. Each ends with the ID, in the same direction, so
 * ideas that tie keep one order from page to page.
 */
const sortOrders: Record<LibrarySort, SQL[]> = {
  "updated-desc": [desc(ideas.updatedAt), desc(ideas.id)],
  "updated-asc": [asc(ideas.updatedAt), asc(ideas.id)],
  "created-desc": [desc(ideas.createdAt), desc(ideas.id)],
  "created-asc": [asc(ideas.createdAt), asc(ideas.id)],
  "title-asc": [asc(sql`lower(${ideas.title})`), asc(ideas.id)],
  "title-desc": [desc(sql`lower(${ideas.title})`), desc(ideas.id)],
};

/** A search word as a LIKE pattern that matches it anywhere, with its own %, _ and \ taken literally. */
export function containing(term: string) {
  return `%${term.replace(/[\\%_]/g, "\\$&")}%`;
}

/** Everything a library query asks of an idea, as conditions that must all hold. */
function libraryConditions(db: Reader, ownerId: string, query: LibraryQuery, now: Date) {
  const conditions: (SQL | undefined)[] = [eq(ideas.ownerId, ownerId)];

  // Every word must be found, each in any of the fields. A subject is only
  // shown on a sermon, so only there is it searched.
  for (const term of searchTerms(query.q)) {
    const pattern = containing(term);
    conditions.push(
      or(
        ilike(ideas.title, pattern),
        ilike(ideas.notes, pattern),
        and(eq(ideas.kind, "sermon"), ilike(ideas.subject, pattern)),
      ),
    );
  }

  // Within a filter any chosen value will do; an empty filter asks nothing.
  if (query.kinds.length > 0) conditions.push(inArray(ideas.kind, query.kinds));
  if (query.statuses.length > 0) conditions.push(inArray(ideas.status, query.statuses));
  // A type kept from when an idea was a sermon does not count.
  if (query.sermonTypes.length > 0) {
    conditions.push(eq(ideas.kind, "sermon"), inArray(ideas.sermonType, query.sermonTypes));
  }

  // A format, like a type, is a sermon's: the default a point's row holds is not one.
  if (query.formats.length > 0) {
    conditions.push(eq(ideas.kind, "sermon"), inArray(ideas.intendedFormat, query.formats));
  }

  // The revisiting filters find sermon ideas only, by the rule the dashboard uses.
  if (query.revisit === "never") conditions.push(neverDeveloped());
  else if (query.revisit === "attention") conditions.push(needsAttention(now));

  // Archived ideas are left out here, in the query, unless they were asked for;
  // the count and every page therefore agree.
  if (query.archive === "active") conditions.push(isNull(ideas.archivedAt));
  else if (query.archive === "archived") conditions.push(isNotNull(ideas.archivedAt));

  // Tags are matched in a subquery, never a join, so an idea with two of them
  // is still one row. The same tag asked for twice is one tag.
  const tagIds = [...new Set(query.tagIds)];
  if (tagIds.length > 0) {
    const carried = and(
      eq(ideaTags.ideaId, ideas.id),
      eq(ideaTags.ownerId, ownerId),
      inArray(ideaTags.tagId, tagIds),
    );
    if (query.tagMode === "all") {
      // Every tag: the idea carries as many of them as were asked for. A tag
      // that is unknown, or someone else's, is on none of the owner's ideas,
      // so asking for it as well finds nothing.
      const held = db.select({ held: count() }).from(ideaTags).where(carried);
      conditions.push(sql`(${held}) = ${tagIds.length}`);
    } else {
      // Any one of the tags is enough.
      conditions.push(
        exists(
          db
            .select({ one: sql`1` })
            .from(ideaTags)
            .where(carried),
        ),
      );
    }
  }

  type DateColumn = typeof ideas.createdAt | typeof ideas.updatedAt;
  const from = (column: DateColumn, day: string | null) => {
    const start = day ? startOfDay(day) : null;
    if (start) conditions.push(gte(column, start));
  };
  const through = (column: DateColumn, day: string | null) => {
    const end = day ? startOfNextDay(day) : null;
    if (end) conditions.push(lt(column, end));
  };
  from(ideas.createdAt, query.createdFrom);
  through(ideas.createdAt, query.createdThrough);
  from(ideas.updatedAt, query.updatedFrom);
  through(ideas.updatedAt, query.updatedThrough);

  return and(...conditions);
}

/**
 * One page of the owner's library: searched, filtered, ordered, and counted
 * by the database. Only the ideas on the page are read, with their references
 * and tags. A page past the end returns the last page.
 */
export async function searchIdeas(
  db: Database,
  ownerId: string,
  query: LibraryQuery,
  pageSize: number = libraryPageSize,
  /** What "now" is for the revisiting filter. Only a test passes one. */
  now: Date = new Date(),
): Promise<LibraryPage> {
  const size = Math.min(Math.max(Math.trunc(pageSize) || libraryPageSize, 1), maxPageSize);
  const where = libraryConditions(db, ownerId, query, now);

  const [{ total }] = await db.select({ total: count() }).from(ideas).where(where);
  const totalPages = Math.ceil(total / size);
  const page = Math.min(Math.max(Math.trunc(query.page) || 1, 1), Math.max(totalPages, 1));
  if (total === 0) return { items: [], total, page, pageSize: size, totalPages };

  const rows = await db
    .select()
    .from(ideas)
    .where(where)
    .orderBy(...(sortOrders[query.sort] ?? sortOrders["updated-desc"]))
    .limit(size)
    .offset((page - 1) * size);
  return {
    items: await withReferences(db, ownerId, rows),
    total,
    page,
    pageSize: size,
    totalPages,
  };
}

/**
 * Saves a new idea. The ID may come from the browser, which makes a repeated
 * submission harmless: the second attempt finds the first one's row and
 * returns it unchanged. An ID that belongs to another account returns null.
 * Tags named in the input are saved with it, or nothing is.
 */
export async function createIdea(
  db: Database,
  ownerId: string,
  input: IdeaInput,
  id?: string,
): Promise<IdeaWithReferences | null> {
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(ideas)
      .values({ ...columns(input), ownerId, ...(id ? { id } : {}) })
      .onConflictDoNothing({ target: ideas.id })
      .returning();
    // A repeated submission returns the first one's idea as it stands, tags included.
    if (!created) return id ? getIdea(tx, ownerId, id) : null;
    await writeReferences(tx, created.id, input.references);
    return {
      ...asRead(created),
      references: input.references,
      tags: await saveTags(tx, created, input),
    };
  });
}

/** A reference as it is compared to tell whether an idea's passages changed. */
const referenceMark = (reference: IdeaReference) =>
  `${referenceKey(reference)}:${reference.isPrimary}`;

/**
 * Saves an idea's content. A classification the input leaves out is not
 * touched; one it names is set.
 *
 * The idea counts as developed only when its title, subject, notes, or
 * passages are different from what was stored. The editor sends the whole
 * draft, so a save that changed only a status or a tag sends the same content
 * back and is not development. The row is locked while the two are compared.
 */
export async function updateIdea(
  db: Database,
  ownerId: string,
  id: string,
  input: IdeaInput | IdeaUpdate,
): Promise<IdeaWithReferences | null> {
  return db.transaction(async (tx) => {
    const [stored] = await tx
      .select({ title: ideas.title, subject: ideas.subject, notes: ideas.notes })
      .from(ideas)
      .where(and(eq(ideas.id, id), eq(ideas.ownerId, ownerId)))
      .for("update");
    if (!stored) return null;
    const held = (await referencesFor(tx, ownerId, [id])).get(id) ?? [];
    const developed =
      input.title !== stored.title ||
      (input.subject ?? null) !== stored.subject ||
      (input.notes ?? null) !== stored.notes ||
      input.references.map(referenceMark).join("|") !== held.map(referenceMark).join("|");

    const [updated] = await tx
      .update(ideas)
      .set({ ...columns(input), ...(developed ? { lastDevelopedAt: new Date() } : {}) })
      .where(and(eq(ideas.id, id), eq(ideas.ownerId, ownerId)))
      .returning();
    // References are touched only once the owner-scoped update has matched.
    if (!updated) return null;
    await writeReferences(tx, updated.id, input.references);
    return {
      ...asRead(updated),
      references: input.references,
      tags: await saveTags(tx, updated, input),
    };
  });
}

/** What became of an attempt to put passages on an idea. */
export type AttachOutcome =
  | { status: "missing" }
  /** The idea has no room for them all; nothing was added. `room` is how many would fit. */
  | { status: "full"; room: number }
  | {
      status: "attached";
      idea: Pick<Idea, "id" | "title" | "kind">;
      /** The passages added now, in the order given. */
      added: ScriptureReference[];
      /** The passages the idea already had, which were left as they were. */
      already: ScriptureReference[];
    };

/**
 * Adds passages to an idea without touching the ones it has, or anything else
 * about it. This is how Scripture reaches an idea from outside its editor: the
 * Bible reader and saved Scripture. A passage the idea already holds, exactly,
 * is left alone, so asking twice is asking once; a passage that only overlaps
 * one is a different passage and is added. It is all or nothing: more than the
 * idea has room for adds none.
 *
 * The idea's row is locked for the length of the transaction, so two requests
 * at once add one after the other and neither can repeat a passage or take
 * the other's position. Something was added, so the idea counts as changed,
 * and as developed; a request that added nothing leaves both dates alone.
 */
export async function attachReferences(
  db: Database,
  ownerId: string,
  id: string,
  references: ScriptureReference[],
): Promise<AttachOutcome> {
  return db.transaction(async (tx) => {
    const [idea] = await tx
      .select({ id: ideas.id, title: ideas.title, kind: ideas.kind })
      .from(ideas)
      .where(and(eq(ideas.id, id), eq(ideas.ownerId, ownerId)))
      .for("update");
    // References are touched only once the owner-scoped read has matched.
    if (!idea) return { status: "missing" } as const;

    const held = await tx
      .select({
        position: ideaScriptureReferences.position,
        book: ideaScriptureReferences.book,
        chapterStart: ideaScriptureReferences.chapterStart,
        verseStart: ideaScriptureReferences.verseStart,
        chapterEnd: ideaScriptureReferences.chapterEnd,
        verseEnd: ideaScriptureReferences.verseEnd,
      })
      .from(ideaScriptureReferences)
      .where(eq(ideaScriptureReferences.ideaId, idea.id));

    const before = new Set(held.map(referenceKey));
    // Each passage is counted once, however often the request names it.
    const taken = new Set<string>();
    const added: ScriptureReference[] = [];
    const already: ScriptureReference[] = [];
    for (const reference of references) {
      const key = referenceKey(reference);
      if (taken.has(key)) continue;
      taken.add(key);
      (before.has(key) ? already : added).push(reference);
    }

    const room = ideaLimits.references - held.length;
    if (added.length > room) return { status: "full", room: Math.max(room, 0) } as const;
    if (added.length === 0) return { status: "attached", idea, added, already } as const;

    const next = held.reduce((last, row) => Math.max(last, row.position), -1) + 1;
    await tx.insert(ideaScriptureReferences).values(
      added.map((reference, index) => ({
        ...reference,
        ideaId: idea.id,
        position: next + index,
        // A sermon's main text is chosen in its editor, never by an addition from elsewhere.
        isPrimary: false,
      })),
    );
    const now = new Date();
    await tx
      .update(ideas)
      .set({ updatedAt: now, lastDevelopedAt: now })
      .where(eq(ideas.id, idea.id));
    return { status: "attached", idea, added, already } as const;
  });
}

/** Reclassifies an idea. Only `kind` changes; everything else is kept as it was. */
export async function setIdeaKind(
  db: Database,
  ownerId: string,
  id: string,
  kind: IdeaKind,
): Promise<IdeaRecord | null> {
  const [updated] = await db
    .update(ideas)
    .set({ kind })
    .where(and(eq(ideas.id, id), eq(ideas.ownerId, ownerId)))
    .returning();
  return updated ? asRead(updated) : null;
}

/**
 * Changes an idea's status, intended format, or sermon type: whichever the
 * change names, and nothing else. Any value may follow any other. It is only
 * ever called because a person chose; nothing in the application moves a
 * classification by itself.
 */
export async function classifyIdea(
  db: Database,
  ownerId: string,
  id: string,
  change: ClassificationInput,
): Promise<IdeaRecord | null> {
  const [updated] = await db
    .update(ideas)
    .set({
      status: change.status,
      intendedFormat: change.intendedFormat,
      sermonType: change.sermonType,
    })
    .where(and(eq(ideas.id, id), eq(ideas.ownerId, ownerId)))
    .returning();
  return updated ? asRead(updated) : null;
}

/**
 * Archives an idea: it is kept whole and marked with when. Its status,
 * format, type, notes, references, and tags are not touched, and neither is
 * `updated_at`, because putting an idea away is not an edit. Archiving one
 * that is archived already keeps the first date.
 */
export async function archiveIdea(
  db: Database,
  ownerId: string,
  id: string,
): Promise<IdeaRecord | null> {
  const [updated] = await db
    .update(ideas)
    .set({
      archivedAt: sql`coalesce(${ideas.archivedAt}, now())`,
      updatedAt: sql`${ideas.updatedAt}`,
    })
    .where(and(eq(ideas.id, id), eq(ideas.ownerId, ownerId)))
    .returning();
  return updated ? asRead(updated) : null;
}

/** Takes an idea out of the archive, exactly as it went in. Restoring one that is not archived changes nothing. */
export async function restoreIdea(
  db: Database,
  ownerId: string,
  id: string,
): Promise<IdeaRecord | null> {
  const [updated] = await db
    .update(ideas)
    .set({ archivedAt: null, updatedAt: sql`${ideas.updatedAt}` })
    .where(and(eq(ideas.id, id), eq(ideas.ownerId, ownerId)))
    .returning();
  return updated ? asRead(updated) : null;
}

/**
 * What became of an attempt to delete an idea. `preached` is a sermon with
 * preaching history: it was not deleted, and neither was any of its history.
 */
export type DeleteOutcome = "deleted" | "missing" | "preached";

/**
 * Deletes the owner's idea; its references and tag links go with it. An idea
 * that has been preached is kept, whatever kind it is filed as now and
 * whether or not it is archived: history is never erased by a deletion.
 *
 * The idea's row is locked while its history is looked for, as recording an
 * occasion locks it, so the two cannot pass each other. The foreign key
 * (ON DELETE RESTRICT) refuses the deletion too, whatever this misses.
 */
export async function deleteIdea(
  db: Database,
  ownerId: string,
  id: string,
): Promise<DeleteOutcome> {
  try {
    return await db.transaction(async (tx): Promise<DeleteOutcome> => {
      const [idea] = await tx
        .select({ id: ideas.id })
        .from(ideas)
        .where(and(eq(ideas.id, id), eq(ideas.ownerId, ownerId)))
        .for("update");
      if (!idea) return "missing";
      const preached = await tx
        .select({ id: preachingOccurrences.id })
        .from(preachingOccurrences)
        .where(
          and(eq(preachingOccurrences.sermonId, id), eq(preachingOccurrences.ownerId, ownerId)),
        )
        .limit(1);
      if (preached.length > 0) return "preached";
      await tx.delete(ideas).where(and(eq(ideas.id, id), eq(ideas.ownerId, ownerId)));
      return "deleted";
    });
  } catch (error) {
    if (isForeignKeyViolation(error)) return "preached";
    throw error;
  }
}
