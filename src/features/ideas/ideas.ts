import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { ideas, ideaScriptureReferences, type Idea } from "@/db/schema";
import type { Database } from "@/db/types";
import type { IdeaKind } from "./model";
import type { IdeaInput, IdeaReference } from "./schemas";

export type IdeaWithReferences = Idea & { references: IdeaReference[] };

/** The library shows the most recently touched ideas; paging arrives with search. */
export const libraryLimit = 200;

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

async function withReferences(db: Reader, ownerId: string, rows: Idea[]) {
  const references = await referencesFor(
    db,
    ownerId,
    rows.map((row) => row.id),
  );
  return rows.map((row) => ({ ...row, references: references.get(row.id) ?? [] }));
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

/** The owner's ideas, most recently changed first. */
export async function listIdeas(
  db: Database,
  ownerId: string,
  limit = libraryLimit,
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
 * Saves a new idea. The ID may come from the browser, which makes a repeated
 * submission harmless: the second attempt finds the first one's row and
 * returns it unchanged. An ID that belongs to another account returns null.
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
    if (!created) return id ? getIdea(tx, ownerId, id) : null;
    await writeReferences(tx, created.id, input.references);
    return { ...created, references: input.references };
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
    return { ...updated, references: input.references };
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
