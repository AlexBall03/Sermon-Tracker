import { and, asc, eq, exists, inArray, isNotNull, ne, or, sql } from "drizzle-orm";

import {
  ideas,
  ideaScriptureReferences,
  outlineEntries,
  outlineEntryScriptureReferences,
  sermonOutlines,
  type OutlineEntry,
} from "@/db/schema";
import { isForeignKeyViolation, type Database } from "@/db/types";
import { markDeveloped } from "@/features/ideas/ideas";
import { hasDocument } from "@/features/sermon-editor/persistence/authority";
import { referenceKey, type ScriptureReference } from "@/features/scripture/reference";
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
 * Every write begins with `lockForWrite`: the sermon's row, then the outline's,
 * both held until the transaction ends. Two writes to one outline therefore
 * run one after the other, each seeing what the one before it left, and always
 * take their locks in the same order (ideas, the outline, then its entries),
 * so they cannot wait on each other. Deleting a sermon takes the same order:
 * the idea, then the outline that goes with it.
 *
 * Content authority (A2.2): once the outline has a sermon document, the
 * document is what it says, and every write here answers
 * `document_authoritative` and writes nothing. `lockForWrite` asks, with the
 * outline held, so a conversion and a write to the same outline also run one
 * after the other: a write that commits first is in the document, and one
 * that comes after is refused.
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
 * Working on an outline is developing its sermon (Phase 3C). A write that
 * really changed what the outline says ends with `markDeveloped`, which moves
 * the sermon's `updated_at` and `last_developed_at` and nothing else: no
 * status, no classification, no archive date. What counts is decided here and
 * nowhere else:
 *
 * - words or passages that differ from what was stored;
 * - an entry added, removed, or moved that bears content: it, or something
 *   under it, has a heading, notes, or a passage.
 *
 * An empty point added, moved, or removed, a move to where the point already
 * is, a retry, and anything stale or refused are not development. An entry
 * made from a saved point changes nothing about the point.
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
 * its shape is at. Only `lockOutlineRows` calls it: the sermon's row is always
 * taken first.
 */
async function lockOutline(tx: Transaction, ownerId: string, outlineId: string) {
  const [outline] = await tx
    .select({ id: sermonOutlines.id, revision: sermonOutlines.revision })
    .from(sermonOutlines)
    .where(and(eq(sermonOutlines.id, outlineId), eq(sermonOutlines.ownerId, ownerId)))
    .for("update");
  return outline ?? null;
}

/** What a saved point gives an entry made from it. */
type Source = { id: string; title: string; notes: string | null };

/**
 * The locks every write to an outline takes, in the one order they are ever
 * taken. Legacy writes take them through `lockForWrite`; converting the
 * outline into a sermon document (A2.2, `persistence/conversion.ts`) takes
 * them here too, so the two run one after the other. The rows of `ideas` first (the sermon the outline is of,
 * and the saved point an entry is to be made from, lower ID first as
 * `linkIdeas` takes two ideas), then the outline's row.
 *
 * The sermon comes before the outline because deleting a sermon holds the
 * idea and then reaches for its outline, and a write that held the outline
 * and then reached for the sermon, to say it was developed, would wait on it
 * for ever. It is held `FOR NO KEY UPDATE`, which is all a change of its
 * dates needs and does not keep out the key locks other rows take on it. The
 * point is held `FOR KEY SHARE`, against deletion only.
 *
 * Null when the outline is not the owner's. `source` is null when no point
 * was named, or the one named is not a point idea of the owner's.
 */
export async function lockOutlineRows(
  tx: Transaction,
  ownerId: string,
  outlineId: string,
  sourcePointId: string | null = null,
) {
  // Read without a lock: an outline's sermon never changes.
  const [found] = await tx
    .select({ sermonId: sermonOutlines.sermonId })
    .from(sermonOutlines)
    .where(and(eq(sermonOutlines.id, outlineId), eq(sermonOutlines.ownerId, ownerId)))
    .limit(1);
  if (!found) return null;

  const holdSermon = () =>
    tx
      .select({ id: ideas.id })
      .from(ideas)
      .where(and(eq(ideas.id, found.sermonId), eq(ideas.ownerId, ownerId)))
      .for("no key update");
  const holdSource = async (id: string): Promise<Source | null> => {
    const [point] = await tx
      .select({ id: ideas.id, title: ideas.title, notes: ideas.notes })
      .from(ideas)
      .where(and(eq(ideas.id, id), eq(ideas.ownerId, ownerId), eq(ideas.kind, "point")))
      .for("key share");
    return point ?? null;
  };
  let source: Source | null = null;
  if (sourcePointId && sourcePointId < found.sermonId) {
    source = await holdSource(sourcePointId);
    await holdSermon();
  } else {
    await holdSermon();
    if (sourcePointId) source = await holdSource(sourcePointId);
  }

  const outline = await lockOutline(tx, ownerId, outlineId);
  return outline ? { ...outline, sermonId: found.sermonId, source } : null;
}

/** Why a legacy write was refused: the outline's sermon document is what it says now (A2.2). */
export type DocumentAuthoritative = { status: "document_authoritative" };
const documentAuthoritative: DocumentAuthoritative = { status: "document_authoritative" };

/**
 * Where every legacy write to an outline begins: `lockOutlineRows`, then,
 * in a statement of its own and with the outline held, whether the outline
 * has a sermon document. Once it has, its entries are no longer what it
 * says, and no legacy write may change them. The refusal comes before
 * anything else is looked at, so nothing is written.
 */
async function lockForWrite(
  tx: Transaction,
  ownerId: string,
  outlineId: string,
  sourcePointId: string | null = null,
) {
  const outline = await lockOutlineRows(tx, ownerId, outlineId, sourcePointId);
  if (!outline) return null;
  if (await hasDocument(tx, ownerId, outline.id)) return documentAuthoritative;
  return { status: "locked" as const, ...outline };
}

/**
 * True when any of these entries says something: a heading, notes, or a
 * passage. An empty point is a place to write, and adding, moving, or
 * removing one changes nothing a sermon says.
 */
async function bearsContent(tx: Transaction, ownerId: string, ids: string[]) {
  if (ids.length === 0) return false;
  const [found] = await tx
    .select({ id: outlineEntries.id })
    .from(outlineEntries)
    .where(
      and(
        eq(outlineEntries.ownerId, ownerId),
        inArray(outlineEntries.id, ids),
        or(
          ne(outlineEntries.title, ""),
          isNotNull(outlineEntries.notes),
          exists(
            tx
              .select({ one: sql`1` })
              .from(outlineEntryScriptureReferences)
              .where(eq(outlineEntryScriptureReferences.entryId, outlineEntries.id)),
          ),
        ),
      ),
    )
    .limit(1);
  return found !== undefined;
}

/** The passages of a saved point, in its own order, as many as an entry holds and none twice. */
async function sourcePassages(tx: Transaction, ownerId: string, pointId: string) {
  const rows = await tx
    .select({
      book: ideaScriptureReferences.book,
      chapterStart: ideaScriptureReferences.chapterStart,
      verseStart: ideaScriptureReferences.verseStart,
      chapterEnd: ideaScriptureReferences.chapterEnd,
      verseEnd: ideaScriptureReferences.verseEnd,
    })
    .from(ideaScriptureReferences)
    // Joined to the idea so ownership is checked again in this statement.
    .innerJoin(ideas, eq(ideas.id, ideaScriptureReferences.ideaId))
    .where(and(eq(ideas.ownerId, ownerId), eq(ideaScriptureReferences.ideaId, pointId)))
    .orderBy(asc(ideaScriptureReferences.position));
  const seen = new Set<string>();
  const passages: ScriptureReference[] = [];
  for (const row of rows) {
    const key = referenceKey(row);
    if (seen.has(key) || passages.length >= outlineLimits.references) continue;
    seen.add(key);
    passages.push(row);
  }
  return passages;
}

async function writeReferences(tx: Transaction, entryId: string, references: ScriptureReference[]) {
  if (references.length === 0) return;
  await tx
    .insert(outlineEntryScriptureReferences)
    .values(references.map((reference, position) => ({ ...reference, entryId, position })));
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
  | { status: "unavailable" }
  | DocumentAuthoritative;

/**
 * Adds an entry to an outline: a main point, a point under another, the
 * introduction, or the conclusion. A point goes where `position` says among
 * the points it will be beside, and those after it move down one; left out,
 * it goes last.
 *
 * Made from a saved point idea (`sourcePointId`), the entry begins with the
 * point's title and notes, where the request gives none of its own, and with
 * the point's passages, and remembers the point. That is a copy: the two are
 * edited apart from then on, and nothing is written to the point. Notes longer
 * than an entry holds are cut to what it holds, and passages beyond what it
 * holds are left out.
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
    // The point it is made from is held against deletion before the outline is
    // locked. Deleting a point holds the point and then reaches for the entries
    // made from it; taking the point only after the outline would let the two
    // wait on each other.
    const outline = await lockForWrite(tx, ownerId, input.outlineId, input.sourcePointId);
    if (!outline) return { status: "missing" };
    if (outline.status === "document_authoritative") return outline;
    const { source } = outline;

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
    let passages: ScriptureReference[] = [];
    if (input.sourcePointId) {
      if (input.type !== "point" || !source) return { status: "unknown_source" };
      title ??= cut(source.title, outlineLimits.title);
      if (notes === undefined) notes = source.notes ? cut(source.notes, outlineLimits.notes) : null;
      passages = await sourcePassages(tx, ownerId, source.id);
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
    await writeReferences(tx, created.id, passages);
    const revision = await countChange(tx, ownerId, outline.id);
    // An empty point is a place to write; one that says something is work on the sermon.
    if (created.title !== "" || created.notes !== null || passages.length > 0) {
      await markDeveloped(tx, ownerId, outline.sermonId);
    }
    return { status: "created", entry: asEntry(created, passages), revision };
  });
}

/** What became of a change to an entry's words. */
export type UpdateEntryOutcome =
  | { status: "updated"; entry: EntryRecord }
  /** The entry's words have changed since the revision the request named: the entry as it stands. */
  | { status: "stale"; entry: EntryRecord }
  | { status: "missing" }
  | DocumentAuthoritative;

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
    const outline = entry && (await lockForWrite(tx, ownerId, entry.outlineId));
    if (!outline) return { status: "missing" };
    if (outline.status === "document_authoritative") return outline;
    // Read again under the lock, to tell a change from the same words sent again.
    const before = await own(tx, ownerId, id);
    if (!before) return { status: "missing" };
    const developed =
      (change.title !== undefined && change.title !== before.title) ||
      (change.notes !== undefined && change.notes !== before.notes);
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
    if (developed) await markDeveloped(tx, ownerId, outline.sermonId);
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
  | { status: "cycle" }
  | DocumentAuthoritative;

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
    const outline = await lockForWrite(tx, ownerId, entry.outlineId);
    if (!outline) return { status: "missing" };
    if (outline.status === "document_authoritative") return outline;
    if (move.expectedRevision !== undefined && move.expectedRevision !== outline.revision) {
      return { status: "stale", revision: outline.revision };
    }

    // Read again under the lock: the entry may have been moved or removed meanwhile.
    const shape = await shapeOf(tx, ownerId, outline.id);
    const plan = planMove(shape, id, move.parentId, move.position);
    if (!plan.ok) return { status: plan.problem };

    const moved = { id, outlineId: outline.id, parentId: move.parentId, position: plan.position };
    if (plan.placements.length === 0) {
      return { status: "moved", entry: moved, revision: outline.revision };
    }
    await place(tx, ownerId, outline.id, plan.placements);
    // Reordering what the sermon says is work on it; walking an empty point about is not.
    if (await bearsContent(tx, ownerId, subtreeIds(shape, id))) {
      await markDeveloped(tx, ownerId, outline.sermonId);
    }
    return {
      status: "moved",
      entry: moved,
      revision: await countChange(tx, ownerId, outline.id),
    };
  });
}

/** What became of an attempt to remove an entry. `removed` counts it and everything that was under it. */
export type DeleteEntryOutcome =
  | { status: "deleted"; outlineId: string; removed: number; revision: number }
  | Refused
  | DocumentAuthoritative;

/**
 * Removes an entry and everything under it, and closes the gap it leaves.
 * The saved points any of the entries were made from are not touched.
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
    const outline = await lockForWrite(tx, ownerId, entry.outlineId);
    if (!outline) return { status: "missing" };
    if (outline.status === "document_authoritative") return outline;
    if (expectedRevision !== undefined && expectedRevision !== outline.revision) {
      return { status: "stale", revision: outline.revision };
    }

    const shape = await shapeOf(tx, ownerId, outline.id);
    if (!shape.some((row) => row.id === id)) return { status: "missing" };
    const going = subtreeIds(shape, id);
    const removed = going.length;
    const placements = planRemove(shape, id);
    const developed = await bearsContent(tx, ownerId, going);

    // What is under it goes with it: the parent key is ON DELETE CASCADE.
    await tx
      .delete(outlineEntries)
      .where(and(eq(outlineEntries.id, id), eq(outlineEntries.ownerId, ownerId)));
    await place(tx, ownerId, outline.id, placements);
    if (developed) await markDeveloped(tx, ownerId, outline.sermonId);
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
    const outline = entry && (await lockForWrite(tx, ownerId, entry.outlineId));
    if (!outline) return { status: "missing" };
    if (outline.status === "document_authoritative") return outline;
    const held = (await referencesFor(tx, ownerId, [id])).get(id) ?? [];
    const developed = references.map(referenceKey).join("|") !== held.map(referenceKey).join("|");
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
    await writeReferences(tx, updated.id, references);
    await touchOutline(tx, ownerId, updated.outlineId);
    if (developed) await markDeveloped(tx, ownerId, outline.sermonId);
    return { status: "updated", entry: asEntry(updated, references) };
  });
}
