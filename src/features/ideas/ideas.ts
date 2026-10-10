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
  lt,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import { ideas, ideaScriptureReferences, ideaTags, type Idea } from "@/db/schema";
import type { Database } from "@/db/types";
import { searchTerms, startOfDay, startOfNextDay, type LibraryQuery } from "./library-query";
import { libraryPageSize, type IdeaKind, type LibrarySort } from "./model";
import type { IdeaInput, IdeaReference } from "./schemas";
import { tagsForIdeas, writeIdeaTags, type IdeaTag } from "./tags";

export type IdeaWithReferences = Idea & { references: IdeaReference[]; tags: IdeaTag[] };

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
    ...row,
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

/** The columns a person may set, named one by one: nothing else reaches the table. */
function columns(input: IdeaInput) {
  return {
    kind: input.kind,
    title: input.title,
    notes: input.notes,
    status: input.status,
    sermonType: input.sermonType,
    subject: input.subject,
  };
}

/**
 * Replaces the idea's tags when the input names any, and returns the tags it
 * then has. Input without `tagIds` leaves them alone. A tag that is not the
 * owner's throws, which undoes the whole save.
 */
async function saveTags(tx: Reader & Writer, idea: Idea, input: IdeaInput) {
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

/** The owner's few most recently changed ideas, for the dashboard. The library uses `searchIdeas`. */
export async function recentIdeas(
  db: Database,
  ownerId: string,
  limit: number,
): Promise<IdeaWithReferences[]> {
  const rows = await db
    .select()
    .from(ideas)
    .where(eq(ideas.ownerId, ownerId))
    .orderBy(desc(ideas.updatedAt), desc(ideas.id))
    .limit(limit);
  return withReferences(db, ownerId, rows);
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
function containing(term: string) {
  return `%${term.replace(/[\\%_]/g, "\\$&")}%`;
}

/** Everything a library query asks of an idea, as conditions that must all hold. */
function libraryConditions(db: Reader, ownerId: string, query: LibraryQuery) {
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

  if (query.kind) conditions.push(eq(ideas.kind, query.kind));
  if (query.status) conditions.push(eq(ideas.status, query.status));
  // A type kept from when an idea was a sermon does not count.
  if (query.sermonType) {
    conditions.push(eq(ideas.kind, "sermon"), eq(ideas.sermonType, query.sermonType));
  }

  // Any one of the tags is enough. EXISTS, not a join, so an idea with two of them is one row.
  if (query.tagIds.length > 0) {
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(ideaTags)
          .where(
            and(
              eq(ideaTags.ideaId, ideas.id),
              eq(ideaTags.ownerId, ownerId),
              inArray(ideaTags.tagId, query.tagIds),
            ),
          ),
      ),
    );
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
): Promise<LibraryPage> {
  const size = Math.min(Math.max(Math.trunc(pageSize) || libraryPageSize, 1), maxPageSize);
  const where = libraryConditions(db, ownerId, query);

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
    return { ...created, references: input.references, tags: await saveTags(tx, created, input) };
  });
}

export async function updateIdea(
  db: Database,
  ownerId: string,
  id: string,
  input: IdeaInput,
): Promise<IdeaWithReferences | null> {
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(ideas)
      .set(columns(input))
      .where(and(eq(ideas.id, id), eq(ideas.ownerId, ownerId)))
      .returning();
    // References are touched only once the owner-scoped update has matched.
    if (!updated) return null;
    await writeReferences(tx, updated.id, input.references);
    return { ...updated, references: input.references, tags: await saveTags(tx, updated, input) };
  });
}

/** Reclassifies an idea. Only `kind` changes; everything else is kept as it was. */
export async function setIdeaKind(
  db: Database,
  ownerId: string,
  id: string,
  kind: IdeaKind,
): Promise<Idea | null> {
  const [updated] = await db
    .update(ideas)
    .set({ kind })
    .where(and(eq(ideas.id, id), eq(ideas.ownerId, ownerId)))
    .returning();
  return updated ?? null;
}

/** True when the owner's idea was deleted; its references go with it. */
export async function deleteIdea(db: Database, ownerId: string, id: string): Promise<boolean> {
  const deleted = await db
    .delete(ideas)
    .where(and(eq(ideas.id, id), eq(ideas.ownerId, ownerId)))
    .returning({ id: ideas.id });
  return deleted.length > 0;
}
