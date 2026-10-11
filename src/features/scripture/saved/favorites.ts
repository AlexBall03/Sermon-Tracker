import { createHash } from "node:crypto";

import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  ilike,
  inArray,
  lt,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import {
  bibleFavorites,
  bibleFavoriteVerses,
  bibleHighlights,
  bibleVerses,
  type BibleFavorite,
} from "@/db/schema";
import { isUniqueViolation, type Database } from "@/db/types";
import { containing } from "@/features/ideas/ideas";
import { searchTerms } from "@/features/ideas/library-query";
import { highlightsInChapter } from "./highlights";
import {
  highlightColors,
  savedPageSize,
  savedPreviewVerses,
  type ChapterMarks,
  type FavoriteSummary,
  type HighlightColor,
  type SavedSort,
  type TranslationId,
} from "./model";
import type { SavedQuery } from "./saved-query";
import type { FavoriteChange, FavoriteInput } from "./schemas";
import { canonicalKey, formatVerseSet, normaliseVerses, type VerseRef } from "./verse-set";

/** A favorite with its verses and its dates. */
export type Favorite = FavoriteSummary & { createdAt: Date; updatedAt: Date };

/** A favorite as the library lists it. */
export type ListedFavorite = Favorite & {
  /** The colors its verses are highlighted in, in the model's order. Read from the highlights. */
  colors: HighlightColor[];
  /** Its first few verses with their text, or none where the text could not be read. */
  preview: (VerseRef & { text: string })[];
};

/** One page of saved passages, and how many there are altogether. */
export type SavedPage = {
  items: ListedFavorite[];
  total: number;
  /** The page returned, which is the last page when a later one was asked for. */
  page: number;
  pageSize: number;
  totalPages: number;
};

export type SaveResult = { favorite: Favorite; existing: boolean };

export type ChangeResult =
  | { ok: true; favorite: Favorite }
  | { ok: false; reason: "missing" }
  // `conflictId` is the owner's other favorite that already holds these verses.
  | { ok: false; reason: "conflict"; conflictId: string };

type Reader = Pick<Database, "select" | "selectDistinct">;

/*
 * As in ideas.ts and tags.ts, every statement here has the owner in its WHERE
 * clause, and a favorite that belongs to someone else is indistinguishable
 * from one that does not exist. The database repeats the rule:
 * bible_favorite_verses can only hold rows for a favorite of the same owner.
 *
 * What makes a favorite itself is its verses and its translation. The unique
 * constraint on (owner, translation, selection_key) is what refuses a second
 * copy, so it holds however the requests arrive.
 */

/** The digest stored as `selection_key`: equal verse sets have equal keys. */
function selectionKey(verses: readonly VerseRef[]) {
  return createHash("sha256").update(canonicalKey(verses)).digest("hex");
}

/** The columns that follow from a favorite's verses. Written whenever the verses are. */
function derived(verses: readonly VerseRef[]) {
  const [first] = verses;
  return {
    selectionKey: selectionKey(verses),
    reference: formatVerseSet(verses),
    firstBook: first.book,
    firstChapter: first.chapter,
    firstVerse: first.verse,
  };
}

async function versesFor(db: Reader, ownerId: string, ids: string[]) {
  const byFavorite = new Map<string, VerseRef[]>();
  if (ids.length === 0) return byFavorite;
  const rows = await db
    .select({
      favoriteId: bibleFavoriteVerses.favoriteId,
      book: bibleFavoriteVerses.book,
      chapter: bibleFavoriteVerses.chapter,
      verse: bibleFavoriteVerses.verse,
    })
    .from(bibleFavoriteVerses)
    .where(
      and(eq(bibleFavoriteVerses.ownerId, ownerId), inArray(bibleFavoriteVerses.favoriteId, ids)),
    )
    .orderBy(asc(bibleFavoriteVerses.favoriteId), asc(bibleFavoriteVerses.position));
  for (const { favoriteId, ...verse } of rows) {
    const list = byFavorite.get(favoriteId) ?? [];
    list.push(verse);
    byFavorite.set(favoriteId, list);
  }
  return byFavorite;
}

function shape(row: BibleFavorite, verses: VerseRef[]): Favorite {
  return {
    id: row.id,
    translation: row.translation,
    reference: row.reference,
    label: row.label,
    notes: row.notes,
    verses,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Favorites with their verses: one further query however many there are. */
async function withVerses(db: Reader, ownerId: string, rows: BibleFavorite[]) {
  const verses = await versesFor(
    db,
    ownerId,
    rows.map((row) => row.id),
  );
  return rows.map((row) => shape(row, verses.get(row.id) ?? []));
}

async function writeVerses(
  tx: Pick<Database, "insert" | "delete">,
  ownerId: string,
  favoriteId: string,
  verses: readonly VerseRef[],
) {
  await tx
    .delete(bibleFavoriteVerses)
    .where(
      and(eq(bibleFavoriteVerses.favoriteId, favoriteId), eq(bibleFavoriteVerses.ownerId, ownerId)),
    );
  await tx
    .insert(bibleFavoriteVerses)
    .values(verses.map((verse, position) => ({ ...verse, favoriteId, ownerId, position })));
}

async function findByKey(db: Reader, ownerId: string, translation: TranslationId, key: string) {
  const rows = await db
    .select()
    .from(bibleFavorites)
    .where(
      and(
        eq(bibleFavorites.ownerId, ownerId),
        eq(bibleFavorites.translation, translation),
        eq(bibleFavorites.selectionKey, key),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function getFavorite(
  db: Reader,
  ownerId: string,
  id: string,
): Promise<Favorite | null> {
  const rows = await db
    .select()
    .from(bibleFavorites)
    .where(and(eq(bibleFavorites.id, id), eq(bibleFavorites.ownerId, ownerId)))
    .limit(1);
  const [favorite] = await withVerses(db, ownerId, rows);
  return favorite ?? null;
}

/**
 * Saves a passage. If the owner already has these very verses saved in this
 * translation, that favorite is returned as it stands, marked `existing`,
 * and nothing is written: its label and notes are not replaced. Null only
 * when the one that was in the way has gone again in the meantime.
 */
export async function createFavorite(
  db: Database,
  ownerId: string,
  input: FavoriteInput,
): Promise<SaveResult | null> {
  const verses = normaliseVerses(input.verses);
  if (verses.length === 0) return null;
  const columns = derived(verses);

  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(bibleFavorites)
      .values({
        ...columns,
        ownerId,
        translation: input.translation,
        label: input.label,
        notes: input.notes,
      })
      // The constraint decides between two requests for the same passage.
      .onConflictDoNothing({
        target: [bibleFavorites.ownerId, bibleFavorites.translation, bibleFavorites.selectionKey],
      })
      .returning();
    if (!created) {
      const held = await findByKey(tx, ownerId, input.translation, columns.selectionKey);
      if (!held) return null;
      const [favorite] = await withVerses(tx, ownerId, [held]);
      return { favorite, existing: true };
    }
    await writeVerses(tx, ownerId, created.id, verses);
    return { favorite: shape(created, verses), existing: false };
  });
}

/**
 * Changes a favorite's label, its notes, its verses, or any of them; what
 * the change leaves out is left alone. New verses replace the old in the same
 * transaction. If they are the verses of another of the owner's favorites,
 * nothing is changed and that favorite is named: neither is overwritten.
 */
export async function updateFavorite(
  db: Database,
  ownerId: string,
  id: string,
  change: FavoriteChange,
): Promise<ChangeResult> {
  const verses = change.verses ? normaliseVerses(change.verses) : null;
  const scoped = and(eq(bibleFavorites.id, id), eq(bibleFavorites.ownerId, ownerId));

  /** The owner's other favorite with these verses, if there is one. */
  const clash = async (reader: Reader, translation: TranslationId, key: string) => {
    const rows = await reader
      .select({ id: bibleFavorites.id })
      .from(bibleFavorites)
      .where(
        and(
          eq(bibleFavorites.ownerId, ownerId),
          eq(bibleFavorites.translation, translation),
          eq(bibleFavorites.selectionKey, key),
          ne(bibleFavorites.id, id),
        ),
      )
      .limit(1);
    return rows[0]?.id ?? null;
  };

  try {
    return await db.transaction(async (tx): Promise<ChangeResult> => {
      const [current] = await tx.select().from(bibleFavorites).where(scoped).limit(1);
      if (!current) return { ok: false, reason: "missing" };

      const columns = verses && verses.length > 0 ? derived(verses) : null;
      if (columns) {
        const conflictId = await clash(tx, current.translation, columns.selectionKey);
        if (conflictId) return { ok: false, reason: "conflict", conflictId };
      }

      const [updated] = await tx
        .update(bibleFavorites)
        .set({
          // Named one by one: nothing else reaches the table.
          ...(change.label !== undefined ? { label: change.label } : {}),
          ...(change.notes !== undefined ? { notes: change.notes } : {}),
          ...(columns ?? {}),
          updatedAt: new Date(),
        })
        .where(scoped)
        .returning();
      // The verses are touched only once the owner-scoped update has matched.
      if (!updated) return { ok: false, reason: "missing" };
      if (columns && verses) {
        await writeVerses(tx, ownerId, id, verses);
        return { ok: true, favorite: shape(updated, verses) };
      }
      const [favorite] = await withVerses(tx, ownerId, [updated]);
      return { ok: true, favorite };
    });
  } catch (error) {
    // Two changes to the same verses at once: the constraint decided between them.
    if (!isUniqueViolation(error) || !verses) throw error;
    const [current] = await db
      .select({ translation: bibleFavorites.translation })
      .from(bibleFavorites)
      .where(scoped)
      .limit(1);
    const conflictId = current ? await clash(db, current.translation, selectionKey(verses)) : null;
    return conflictId
      ? { ok: false, reason: "conflict", conflictId }
      : { ok: false, reason: "missing" };
  }
}

/**
 * True when the owner's favorite was deleted. Its verse rows go with it and
 * nothing else does: not a highlight, not another favorite, not an idea.
 */
export async function deleteFavorite(db: Database, ownerId: string, id: string): Promise<boolean> {
  const deleted = await db
    .delete(bibleFavorites)
    .where(and(eq(bibleFavorites.id, id), eq(bibleFavorites.ownerId, ownerId)))
    .returning({ id: bibleFavorites.id });
  return deleted.length > 0;
}

/** The owner's favorites that have a verse in this chapter, each with all of its verses. */
export async function favoritesInChapter(
  db: Reader,
  ownerId: string,
  translation: TranslationId,
  book: number,
  chapter: number,
): Promise<Favorite[]> {
  const rows = await db
    .select()
    .from(bibleFavorites)
    .where(
      and(
        eq(bibleFavorites.ownerId, ownerId),
        eq(bibleFavorites.translation, translation),
        exists(
          db
            .select({ one: sql`1` })
            .from(bibleFavoriteVerses)
            .where(
              and(
                eq(bibleFavoriteVerses.favoriteId, bibleFavorites.id),
                eq(bibleFavoriteVerses.ownerId, ownerId),
                eq(bibleFavoriteVerses.book, book),
                eq(bibleFavoriteVerses.chapter, chapter),
              ),
            ),
        ),
      ),
    )
    .orderBy(...sortOrders.bible);
  return withVerses(db, ownerId, rows);
}

/**
 * Everything the reader needs to mark one chapter for one account: the
 * highlights in it and the favorites that touch it. Two reads, whatever the
 * chapter's length.
 */
export async function getChapterMarks(
  db: Reader,
  ownerId: string,
  translation: TranslationId,
  book: number,
  chapter: number,
): Promise<ChapterMarks> {
  const [highlights, favorites] = await Promise.all([
    highlightsInChapter(db, ownerId, translation, book, chapter),
    favoritesInChapter(db, ownerId, translation, book, chapter),
  ]);
  return {
    highlights,
    favorites: favorites.map(({ id, reference, label, notes, verses }) => ({
      id,
      translation,
      reference,
      label,
      notes,
      verses,
    })),
  };
}

/**
 * The orderings the library offers. A sort arrives as one of these keys and
 * never as a column name. Each ends with the ID, so passages that tie keep
 * one order from page to page.
 */
const sortOrders: Record<SavedSort, SQL[]> = {
  "saved-desc": [desc(bibleFavorites.createdAt), desc(bibleFavorites.id)],
  "updated-desc": [desc(bibleFavorites.updatedAt), desc(bibleFavorites.id)],
  bible: [
    asc(bibleFavorites.firstBook),
    asc(bibleFavorites.firstChapter),
    asc(bibleFavorites.firstVerse),
    asc(bibleFavorites.id),
  ],
};

/** Everything a query asks of a favorite, as conditions that must all hold. */
function savedConditions(db: Reader, ownerId: string, query: SavedQuery) {
  const conditions: (SQL | undefined)[] = [eq(bibleFavorites.ownerId, ownerId)];

  // Every word must be found, each in the reference, the label, or the notes.
  for (const term of searchTerms(query.q)) {
    const pattern = containing(term);
    conditions.push(
      or(
        ilike(bibleFavorites.reference, pattern),
        ilike(bibleFavorites.label, pattern),
        ilike(bibleFavorites.notes, pattern),
      ),
    );
  }

  // Matched in subqueries, never joins, so a passage with several verses is still one row.
  const ofThis = and(
    eq(bibleFavoriteVerses.favoriteId, bibleFavorites.id),
    eq(bibleFavoriteVerses.ownerId, ownerId),
  );
  if (query.book !== null) {
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(bibleFavoriteVerses)
          .where(and(ofThis, eq(bibleFavoriteVerses.book, query.book))),
      ),
    );
  }

  // A color is read from the highlights themselves: a favorite holds no copy of it.
  const colors = highlightColors.filter((color) => query.colors.includes(color));
  if (colors.length > 0) {
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(bibleFavoriteVerses)
          .innerJoin(bibleHighlights, highlightOfVerse(ownerId))
          .where(and(ofThis, inArray(bibleHighlights.color, colors))),
      ),
    );
  }

  return and(...conditions);
}

/** Joins a favorite's verse to the owner's highlight on that verse, in the favorite's translation. */
function highlightOfVerse(ownerId: string) {
  return and(
    eq(bibleHighlights.ownerId, ownerId),
    eq(bibleHighlights.translation, bibleFavorites.translation),
    eq(bibleHighlights.book, bibleFavoriteVerses.book),
    eq(bibleHighlights.chapter, bibleFavoriteVerses.chapter),
    eq(bibleHighlights.verse, bibleFavoriteVerses.verse),
  );
}

/** The colors each of these favorites' verses carry, in one query. */
async function colorsFor(db: Reader, ownerId: string, ids: string[]) {
  const byFavorite = new Map<string, HighlightColor[]>();
  if (ids.length === 0) return byFavorite;
  const rows = await db
    .selectDistinct({ favoriteId: bibleFavoriteVerses.favoriteId, color: bibleHighlights.color })
    .from(bibleFavoriteVerses)
    .innerJoin(bibleFavorites, eq(bibleFavorites.id, bibleFavoriteVerses.favoriteId))
    .innerJoin(bibleHighlights, highlightOfVerse(ownerId))
    .where(
      and(eq(bibleFavoriteVerses.ownerId, ownerId), inArray(bibleFavoriteVerses.favoriteId, ids)),
    );
  for (const { favoriteId, color } of rows) {
    byFavorite.set(favoriteId, [...(byFavorite.get(favoriteId) ?? []), color]);
  }
  for (const [id, colors] of byFavorite) {
    byFavorite.set(
      id,
      highlightColors.filter((color) => colors.includes(color)),
    );
  }
  return byFavorite;
}

/** The first few verses of each of these favorites, with their text, in one query. */
async function previewsFor(db: Reader, ownerId: string, ids: string[]) {
  const byFavorite = new Map<string, (VerseRef & { text: string })[]>();
  if (ids.length === 0) return byFavorite;
  const rows = await db
    .select({
      favoriteId: bibleFavoriteVerses.favoriteId,
      book: bibleFavoriteVerses.book,
      chapter: bibleFavoriteVerses.chapter,
      verse: bibleFavoriteVerses.verse,
      text: bibleVerses.text,
    })
    .from(bibleFavoriteVerses)
    .innerJoin(
      bibleVerses,
      and(
        eq(bibleVerses.book, bibleFavoriteVerses.book),
        eq(bibleVerses.chapter, bibleFavoriteVerses.chapter),
        eq(bibleVerses.verse, bibleFavoriteVerses.verse),
      ),
    )
    .where(
      and(
        eq(bibleFavoriteVerses.ownerId, ownerId),
        inArray(bibleFavoriteVerses.favoriteId, ids),
        lt(bibleFavoriteVerses.position, savedPreviewVerses),
      ),
    )
    .orderBy(asc(bibleFavoriteVerses.favoriteId), asc(bibleFavoriteVerses.position));
  for (const { favoriteId, ...verse } of rows) {
    byFavorite.set(favoriteId, [...(byFavorite.get(favoriteId) ?? []), verse]);
  }
  return byFavorite;
}

/** The most a caller may ask for on one page. */
const maxPageSize = 100;

/**
 * One page of the owner's saved passages: searched, filtered, ordered, and
 * counted by the database. Only the passages on the page are read, and their
 * verses, colors, and opening text come in three further queries however
 * many passages there are. A page past the end returns the last page.
 */
export async function searchFavorites(
  db: Database,
  ownerId: string,
  query: SavedQuery,
  pageSize: number = savedPageSize,
): Promise<SavedPage> {
  const size = Math.min(Math.max(Math.trunc(pageSize) || savedPageSize, 1), maxPageSize);
  const where = savedConditions(db, ownerId, query);

  const [{ total }] = await db.select({ total: count() }).from(bibleFavorites).where(where);
  const totalPages = Math.ceil(total / size);
  const page = Math.min(Math.max(Math.trunc(query.page) || 1, 1), Math.max(totalPages, 1));
  if (total === 0) return { items: [], total, page, pageSize: size, totalPages };

  const rows = await db
    .select()
    .from(bibleFavorites)
    .where(where)
    .orderBy(...(sortOrders[query.sort] ?? sortOrders["saved-desc"]))
    .limit(size)
    .offset((page - 1) * size);
  const ids = rows.map((row) => row.id);
  const [favorites, colors, previews] = await Promise.all([
    withVerses(db, ownerId, rows),
    colorsFor(db, ownerId, ids),
    // The passage is worth listing without its text, so this failure is not the page's.
    previewsFor(db, ownerId, ids).catch(() => new Map<string, (VerseRef & { text: string })[]>()),
  ]);
  return {
    items: favorites.map((favorite) => ({
      ...favorite,
      colors: colors.get(favorite.id) ?? [],
      preview: previews.get(favorite.id) ?? [],
    })),
    total,
    page,
    pageSize: size,
    totalPages,
  };
}

/** How many passages the owner has saved, whatever is being searched for. */
export async function countFavorites(db: Reader, ownerId: string): Promise<number> {
  const [{ total }] = await db
    .select({ total: count() })
    .from(bibleFavorites)
    .where(eq(bibleFavorites.ownerId, ownerId));
  return total;
}
