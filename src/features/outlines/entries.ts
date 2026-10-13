import { and, asc, eq, inArray, sql } from "drizzle-orm";

import {
  ideas,
  outlineEntries,
  outlineEntryScriptureReferences,
  sermonOutlines,
  type OutlineEntry,
} from "@/db/schema";
import { isForeignKeyViolation, type Database } from "@/db/types";
import type { ScriptureReference } from "@/features/scripture/reference";
import { outlineLimits, type EntryType } from "./model";
import type { EntryCreate, EntryMove, EntryUpdate } from "./schemas";
import {
  orderEntries,
  planInsert,
  planMove,
  planRemove,
  subtreeIds,
  type Placed,
  type Placement,
  type TreeRow,
} from "./tree";

/*
 * The entries of an outline: its points at any depth, and its introduction
 * and conclusion.
 *
 * As everywhere, every function takes the owner and puts it in the WHERE
 * clause of each statement, so someone else's outline or entry is
 * indistinguishable from one that does not exist. The database repeats the
 * rule: an entry's foreign keys carry the owner.
 *
 * Every write begins by locking the outline's row, and holds it until its
 * transaction ends. Two writes to one outline therefore run one after the
 * other, each seeing what the one before it left, and always take their locks
 * in the same order (the outline, then its entries), so they cannot wait on
 * each other.
 *
 * Two kinds of change are counted apart, so that one is never mistaken for
 * the other:
 *
 * - The shape (adding, moving, removing). It reads every entry of the
 *   outline, checks the change against all of them, and writes all of it or
 *   none. It moves the outline's `revision`.
 * - The words (a title, notes, passages). It writes the one entry and moves
 *   that entry's own `revision`. A move does not make an edit stale, and an
 *   edit does not make a move stale.
 *
 * Nothing here writes to `ideas`: working on an outline moves no status, no
 * `updated_at`, and no `last_developed_at`, and an entry made from a saved
 * point changes nothing about the point.
 */

/** One entry as it is read: its own words, and the passages on it. */
export type EntryRecord = {
  id: string;
  outlineId: string;
  /** The point it is under. Null for a main point and for a section. */
  parentId: string | null;
  type: EntryType;
  position: number;
  title: string;
  notes: string | null;
  /** The saved point idea it was made from, while that idea exists. */
  sourcePointId: string | null;
  /** How many times its words have been changed. */
  revision: number;
  references: ScriptureReference[];
  createdAt: Date;
  updatedAt: Date;
};

/** An entry with where it stands in the outline: what numbering and a page read. */
export type PlacedEntry = Placed<EntryRecord>;

type Reader = Pick<Database, "select">;
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

function asEntry(row: OutlineEntry, references: ScriptureReference[] = []): EntryRecord {
  return {
    id: row.id,
    outlineId: row.outlineId,
    parentId: row.parentId,
    type: row.entryType,
    position: row.position,
    title: row.title,
    notes: row.notes,
    sourcePointId: row.sourcePointId,
    revision: row.revision,
    references,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** The passages of these entries, in order: one query however many entries there are. */
async function referencesFor(db: Reader, ownerId: string, entryIds: string[]) {
  const byEntry = new Map<string, ScriptureReference[]>();
  if (entryIds.length === 0) return byEntry;
  const rows = await db
    .select({
      entryId: outlineEntryScriptureReferences.entryId,
      book: outlineEntryScriptureReferences.book,
      chapterStart: outlineEntryScriptureReferences.chapterStart,
      verseStart: outlineEntryScriptureReferences.verseStart,
      chapterEnd: outlineEntryScriptureReferences.chapterEnd,
      verseEnd: outlineEntryScriptureReferences.verseEnd,
    })
    .from(outlineEntryScriptureReferences)
    // Joined to the entry so ownership is checked again in this statement.
    .innerJoin(outlineEntries, eq(outlineEntries.id, outlineEntryScriptureReferences.entryId))
    .where(
      and(
        eq(outlineEntries.ownerId, ownerId),
        inArray(outlineEntryScriptureReferences.entryId, entryIds),
      ),
    )
    .orderBy(
      asc(outlineEntryScriptureReferences.entryId),
      asc(outlineEntryScriptureReferences.position),
    );
  for (const { entryId, ...reference } of rows) {
    const list = byEntry.get(entryId);
    if (list) list.push(reference);
    else byEntry.set(entryId, [reference]);
  }
  return byEntry;
}

async function own(db: Reader, ownerId: string, id: string) {
  const [row] = await db
    .select()
    .from(outlineEntries)
    .where(and(eq(outlineEntries.id, id), eq(outlineEntries.ownerId, ownerId)))
    .limit(1);
  return row ?? null;
}

async function withReferences(db: Reader, ownerId: string, row: OutlineEntry) {
  return asEntry(row, (await referencesFor(db, ownerId, [row.id])).get(row.id));
}

/** One of the owner's entries, or null. */
export async function getEntry(
  db: Reader,
  ownerId: string,
  id: string,
): Promise<EntryRecord | null> {
  const row = await own(db, ownerId, id);
  return row ? withReferences(db, ownerId, row) : null;
}

/**
 * Every entry of one of the owner's outlines, in the order they are shown:
 * the introduction, each point followed by what is under it, the conclusion.
 * Two queries, whatever the outline holds.
 */
export async function listEntries(
  db: Reader,
  ownerId: string,
  outlineId: string,
): Promise<PlacedEntry[]> {
  const rows = await db
    .select()
    .from(outlineEntries)
    .where(and(eq(outlineEntries.outlineId, outlineId), eq(outlineEntries.ownerId, ownerId)));
  const references = await referencesFor(
    db,
    ownerId,
    rows.map((row) => row.id),
  );
  return orderEntries(rows.map((row) => asEntry(row, references.get(row.id))));
}

/**
 * Holds the outline's row until the transaction ends, and says what revision
 * its shape is at. Every change of shape begins here, so they run one after
 * another on an outline and each sees what the one before it left.
 */
async function lockOutline(tx: Transaction, ownerId: string, outlineId: string) {
  const [outline] = await tx
    .select({ id: sermonOutlines.id, revision: sermonOutlines.revision })
    .from(sermonOutlines)
    .where(and(eq(sermonOutlines.id, outlineId), eq(sermonOutlines.ownerId, ownerId)))
    .for("update");
  return outline ?? null;
}

/** What the shape of the outline is made of: every entry, as little of it as the tree needs. */
async function shapeOf(tx: Transaction, ownerId: string, outlineId: string): Promise<TreeRow[]> {
  return tx
    .select({
      id: outlineEntries.id,
      parentId: outlineEntries.parentId,
      type: outlineEntries.entryType,
      position: outlineEntries.position,
    })
    .from(outlineEntries)
    .where(and(eq(outlineEntries.outlineId, outlineId), eq(outlineEntries.ownerId, ownerId)));
}

/**
 * Puts entries where a plan says, in two statements. The first sets the rows
 * aside at negative positions, which no entry otherwise has; the second gives
 * each its parent and place. Written straight to their places, two rows would
 * for a moment hold the same one, and the table refuses that even for a
 * moment. An entry's `updated_at` is for its words and is left alone.
 */
async function place(tx: Transaction, ownerId: string, outlineId: string, placements: Placement[]) {
  if (placements.length === 0) return;
  const mine = and(eq(outlineEntries.outlineId, outlineId), eq(outlineEntries.ownerId, ownerId));
  await tx
    .update(outlineEntries)
    .set({
      position: sql`-1 - ${outlineEntries.position}`,
      updatedAt: sql`${outlineEntries.updatedAt}`,
    })
    .where(
      and(
        mine,
        inArray(
          outlineEntries.id,
          placements.map((placement) => placement.id),
        ),
      ),
    );
  const values = sql.join(
    placements.map(
      ({ id, parentId, position }) => sql`(${id}::uuid, ${parentId}::uuid, ${position}::integer)`,
    ),
    sql`, `,
  );
  await tx.execute(sql`
    update ${outlineEntries}
    set parent_id = placed.parent_id, position = placed.position
    from (values ${values}) as placed (id, parent_id, position)
    where ${outlineEntries.id} = placed.id and ${mine}
  `);
}

/** Counts a change of shape, and says what the outline's revision is now. */
async function countChange(tx: Transaction, ownerId: string, outlineId: string) {
  const [outline] = await tx
    .update(sermonOutlines)
    .set({ revision: sql`${sermonOutlines.revision} + 1` })
    .where(and(eq(sermonOutlines.id, outlineId), eq(sermonOutlines.ownerId, ownerId)))
    .returning({ revision: sermonOutlines.revision });
  return outline.revision;
}

/** As many characters as an entry may hold, counted as the database counts them. */
function cut(text: string, limit: number) {
  const characters = [...text];
  return characters.length <= limit ? text : characters.slice(0, limit).join("");
}

/** What became of an attempt to add an entry. `revision` is the outline's. */
export type CreateEntryOutcome =
  | { status: "created"; entry: EntryRecord; revision: number }
  /** The ID was saved before in this outline: the first one's row, exactly as it stands. */
  | { status: "existing"; entry: EntryRecord; revision: number }
  /** No such outline among the owner's. */
  | { status: "missing" }
  /** The outline's shape has changed since the revision the request named. Nothing was written. */
  | { status: "stale"; revision: number }
  /** The parent is not a point of this outline. */
  | { status: "invalid_parent" }
  /** The outline already has an introduction, or a conclusion. */
  | { status: "section_exists" }
  /** The outline holds as many entries as one may. */
  | { status: "full" }
  /** The point idea it was to be made from is not a point idea of the owner's. */
  | { status: "unknown_source" }
  /** The ID could not be used. Nothing says why, and nothing was written. */
  | { status: "unavailable" };

/**
 * Adds an entry to an outline: a main point, a point under another, the
 * introduction, or the conclusion. A point goes where `position` says among
 * the points it will be beside, and those after it move down one; left out,
 * it goes last.
 *
 * Made from a saved point idea (`sourcePointId`), the entry begins with the
 * point's title and notes, where the request gives none of its own, and
 * remembers the point. That is a copy: the two are edited apart from then on,
 * and nothing is written to the point. Notes longer than an entry holds are
 * cut to what it holds.
 *
 * The ID may come from the browser, which makes a repeated submission
 * harmless: the second attempt finds the first one's row and returns it
 * unchanged.
 */
export async function createEntry(
  db: Database,
  ownerId: string,
  input: EntryCreate,
  id?: string,
): Promise<CreateEntryOutcome> {
  try {
    return await insertEntry(db, ownerId, input, id);
  } catch (error) {
    // The point was deleted between being read and being named: the foreign
    // key refused the entry, and the transaction undid everything else.
    if (input.sourcePointId && isForeignKeyViolation(error)) return { status: "unknown_source" };
    throw error;
  }
}

async function insertEntry(
  db: Database,
  ownerId: string,
  input: EntryCreate,
  id?: string,
): Promise<CreateEntryOutcome> {
  return db.transaction(async (tx): Promise<CreateEntryOutcome> => {
    // The point it is made from is read first and held against deletion, before
    // the outline is locked. Deleting a point holds the point and then reaches
    // for the entries made from it; taking the point here only after the
    // outline would let the two wait on each other.
    const [source] = input.sourcePointId
      ? await tx
          .select({ title: ideas.title, notes: ideas.notes })
          .from(ideas)
          .where(
            and(
              eq(ideas.id, input.sourcePointId),
              eq(ideas.ownerId, ownerId),
              eq(ideas.kind, "point"),
            ),
          )
          .for("key share")
      : [];

    const outline = await lockOutline(tx, ownerId, input.outlineId);
    if (!outline) return { status: "missing" };

    // A retry is answered before anything is checked again: it changes nothing.
    if (id) {
      const [taken] = await tx
        .select({ ownerId: outlineEntries.ownerId, outlineId: outlineEntries.outlineId })
        .from(outlineEntries)
        .where(eq(outlineEntries.id, id))
        .limit(1);
      if (taken) {
        const before =
          taken.ownerId === ownerId && taken.outlineId === outline.id
            ? await own(tx, ownerId, id)
            : null;
        if (!before) return { status: "unavailable" };
        return {
          status: "existing",
          entry: await withReferences(tx, ownerId, before),
          revision: outline.revision,
        };
      }
    }

    if (input.expectedRevision !== undefined && input.expectedRevision !== outline.revision) {
      return { status: "stale", revision: outline.revision };
    }

    const shape = await shapeOf(tx, ownerId, outline.id);
    if (shape.length >= outlineLimits.entries) return { status: "full" };

    let position = 0;
    let placements: Placement[] = [];
    if (input.type === "point") {
      const plan = planInsert(shape, input.parentId, input.position);
      if (!plan.ok) return { status: "invalid_parent" };
      ({ position, placements } = plan);
    } else {
      if (input.parentId) return { status: "invalid_parent" };
      if (shape.some((row) => row.type === input.type)) return { status: "section_exists" };
    }

    let { title, notes } = input;
    if (input.sourcePointId) {
      if (input.type !== "point" || !source) return { status: "unknown_source" };
      title ??= cut(source.title, outlineLimits.title);
      if (notes === undefined) notes = source.notes ? cut(source.notes, outlineLimits.notes) : null;
    }

    await place(tx, ownerId, outline.id, placements);
    const [created] = await tx
      .insert(outlineEntries)
      .values({
        ...(id ? { id } : {}),
        outlineId: outline.id,
        ownerId,
        parentId: input.type === "point" ? input.parentId : null,
        entryType: input.type,
        position,
        title: title ?? "",
        notes: notes ?? null,
        sourcePointId: input.sourcePointId,
      })
      .returning();
    const revision = await countChange(tx, ownerId, outline.id);
    return { status: "created", entry: asEntry(created), revision };
  });
}

/** What became of a change to an entry's words. */
export type UpdateEntryOutcome =
  | { status: "updated"; entry: EntryRecord }
  /** The entry's words have changed since the revision the request named: the entry as it stands. */
  | { status: "stale"; entry: EntryRecord }
  | { status: "missing" };

/**
 * Changes an entry's title, its notes, or both: the fields the change names,
 * and no others. Notes given as null are cleared. Where it is in the outline
 * is not touched, and neither is the saved point it was made from.
 *
 * A change that names the revision it was made against is refused when the
 * entry's words have been changed since, and nothing is written.
 */
export async function updateEntry(
  db: Database,
  ownerId: string,
  id: string,
  change: EntryUpdate,
): Promise<UpdateEntryOutcome> {
  return db.transaction(async (tx): Promise<UpdateEntryOutcome> => {
    const entry = await own(tx, ownerId, id);
    if (!entry || !(await lockOutline(tx, ownerId, entry.outlineId))) return { status: "missing" };
    // An undefined column is not written, so it stays as it was.
    const [updated] = await tx
      .update(outlineEntries)
      .set({
        title: change.title,
        notes: change.notes,
        revision: sql`${outlineEntries.revision} + 1`,
      })
      .where(
        and(
          eq(outlineEntries.id, id),
          eq(outlineEntries.ownerId, ownerId),
          change.expectedRevision === undefined
            ? undefined
            : eq(outlineEntries.revision, change.expectedRevision),
        ),
      )
      .returning();
    if (!updated) {
      const current = await own(tx, ownerId, id);
      if (!current) return { status: "missing" };
      return { status: "stale", entry: await withReferences(tx, ownerId, current) };
    }
    await touchOutline(tx, ownerId, updated.outlineId);
    return { status: "updated", entry: await withReferences(tx, ownerId, updated) };
  });
}

/** The outline was worked on: its `updated_at` moves, and its shape's revision does not. */
async function touchOutline(tx: Transaction, ownerId: string, outlineId: string) {
  await tx
    .update(sermonOutlines)
    .set({ updatedAt: new Date() })
    .where(and(eq(sermonOutlines.id, outlineId), eq(sermonOutlines.ownerId, ownerId)));
}

/** Why a change of shape was not made. Nothing was written in any of these. */
type Refused =
  /** No such entry among the owner's. */
  | { status: "missing" }
  /** The outline's shape has changed since the revision the request named. */
  | { status: "stale"; revision: number };

/** What became of an attempt to move an entry. `revision` is the outline's. */
export type MoveEntryOutcome =
  | {
      status: "moved";
      entry: Pick<EntryRecord, "id" | "outlineId" | "parentId" | "position">;
      revision: number;
    }
  | Refused
  /** The introduction and the conclusion stay where they are. */
  | { status: "section" }
  /** The parent is not a point of this outline. */
  | { status: "invalid_parent" }
  /** The parent is the entry itself, or is under it. */
  | { status: "cycle" };

/**
 * Moves a point, with everything under it, to another place: among the points
 * it is beside, under another point, or out to the main points. `position` is
 * its place among the points it will be beside, from 0; left out, it goes
 * last. The points it leaves close up, and the ones it joins make room.
 *
 * It is all or nothing. A move that cannot be made (under itself or one of
 * its own subpoints, under a section or a point of another outline) leaves
 * every entry exactly where it was. A move to where the point already is
 * writes nothing and does not count as a change.
 */
export async function moveEntry(
  db: Database,
  ownerId: string,
  id: string,
  move: EntryMove,
): Promise<MoveEntryOutcome> {
  return db.transaction(async (tx): Promise<MoveEntryOutcome> => {
    const entry = await own(tx, ownerId, id);
    if (!entry) return { status: "missing" };
    const outline = await lockOutline(tx, ownerId, entry.outlineId);
    if (!outline) return { status: "missing" };
    if (move.expectedRevision !== undefined && move.expectedRevision !== outline.revision) {
      return { status: "stale", revision: outline.revision };
    }

    // Read again under the lock: the entry may have been moved or removed meanwhile.
    const plan = planMove(await shapeOf(tx, ownerId, outline.id), id, move.parentId, move.position);
    if (!plan.ok) return { status: plan.problem };

    const moved = { id, outlineId: outline.id, parentId: move.parentId, position: plan.position };
    if (plan.placements.length === 0) {
      return { status: "moved", entry: moved, revision: outline.revision };
    }
    await place(tx, ownerId, outline.id, plan.placements);
    return {
      status: "moved",
      entry: moved,
      revision: await countChange(tx, ownerId, outline.id),
    };
  });
}

/** What became of an attempt to remove an entry. `removed` counts it and everything that was under it. */
export type DeleteEntryOutcome =
  { status: "deleted"; outlineId: string; removed: number; revision: number } | Refused;

/**
 * Removes an entry and everything under it, and closes the gap it leaves.
 * Nothing else is touched: not the outline, not the sermon, and not the saved
 * points any of the entries were made from.
 */
export async function deleteEntry(
  db: Database,
  ownerId: string,
  id: string,
  expectedRevision?: number,
): Promise<DeleteEntryOutcome> {
  return db.transaction(async (tx): Promise<DeleteEntryOutcome> => {
    const entry = await own(tx, ownerId, id);
    if (!entry) return { status: "missing" };
    const outline = await lockOutline(tx, ownerId, entry.outlineId);
    if (!outline) return { status: "missing" };
    if (expectedRevision !== undefined && expectedRevision !== outline.revision) {
      return { status: "stale", revision: outline.revision };
    }

    const shape = await shapeOf(tx, ownerId, outline.id);
    if (!shape.some((row) => row.id === id)) return { status: "missing" };
    const removed = subtreeIds(shape, id).length;
    const placements = planRemove(shape, id);

    // What is under it goes with it: the parent key is ON DELETE CASCADE.
    await tx
      .delete(outlineEntries)
      .where(and(eq(outlineEntries.id, id), eq(outlineEntries.ownerId, ownerId)));
    await place(tx, ownerId, outline.id, placements);
    return {
      status: "deleted",
      outlineId: outline.id,
      removed,
      revision: await countChange(tx, ownerId, outline.id),
    };
  });
}

/**
 * Replaces an entry's passages with the ones given, in the order given; none
 * given leaves it with none. They are its words as its title is, so the
 * entry's revision moves and a revision named is checked the same way.
 */
export async function setEntryReferences(
  db: Database,
  ownerId: string,
  id: string,
  references: ScriptureReference[],
  expectedRevision?: number,
): Promise<UpdateEntryOutcome> {
  return db.transaction(async (tx): Promise<UpdateEntryOutcome> => {
    const entry = await own(tx, ownerId, id);
    if (!entry || !(await lockOutline(tx, ownerId, entry.outlineId))) return { status: "missing" };
    const [updated] = await tx
      .update(outlineEntries)
      .set({ revision: sql`${outlineEntries.revision} + 1` })
      .where(
        and(
          eq(outlineEntries.id, id),
          eq(outlineEntries.ownerId, ownerId),
          expectedRevision === undefined
            ? undefined
            : eq(outlineEntries.revision, expectedRevision),
        ),
      )
      .returning();
    if (!updated) {
      const current = await own(tx, ownerId, id);
      if (!current) return { status: "missing" };
      return { status: "stale", entry: await withReferences(tx, ownerId, current) };
    }

    // References are touched only once the owner-scoped update has matched.
    await tx
      .delete(outlineEntryScriptureReferences)
      .where(eq(outlineEntryScriptureReferences.entryId, updated.id));
    if (references.length > 0) {
      await tx.insert(outlineEntryScriptureReferences).values(
        references.map((reference, position) => ({
          ...reference,
          entryId: updated.id,
          position,
        })),
      );
    }
    await touchOutline(tx, ownerId, updated.outlineId);
    return { status: "updated", entry: asEntry(updated, references) };
  });
}
