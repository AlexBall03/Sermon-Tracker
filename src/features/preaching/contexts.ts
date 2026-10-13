import { and, asc, count, eq, ne, sql } from "drizzle-orm";

import { preachingContexts, preachingOccurrences, type PreachingContext } from "@/db/schema";
import { isForeignKeyViolation, isUniqueViolation, type Database } from "@/db/types";

/** A context in the owner's list, with how many occasions in their history name it. */
export type ContextSummary = Pick<PreachingContext, "id" | "name" | "createdAt" | "updatedAt"> & {
  occurrenceCount: number;
};

export type ContextResult =
  | { ok: true; context: PreachingContext }
  /** The owner has a context of that name already, whatever its case; `existingId` is it. */
  | { ok: false; reason: "duplicate"; existingId: string | null }
  | { ok: false; reason: "missing" };

export type ContextDeletion =
  | { ok: true }
  | { ok: false; reason: "missing" }
  /** Occasions still name it, `count` of them; nothing was deleted and none was changed. */
  | { ok: false; reason: "in_use"; count: number };

type Reader = Pick<Database, "select">;

/*
 * As in venues.ts: the owner is in every WHERE clause. An account has only
 * the contexts it chose or wrote. The ones the interface suggests
 * (`suggestedContexts`) are not rows until one is picked, and picking one is
 * `createContext` with its name in the account's language.
 */

const byName = [asc(sql`lower(${preachingContexts.name})`), asc(preachingContexts.id)];

async function named(db: Reader, ownerId: string, name: string, except?: string) {
  const [row] = await db
    .select({ id: preachingContexts.id })
    .from(preachingContexts)
    .where(
      and(
        eq(preachingContexts.ownerId, ownerId),
        sql`lower(${preachingContexts.name}) = lower(${name})`,
        except ? ne(preachingContexts.id, except) : undefined,
      ),
    )
    .limit(1);
  return row?.id ?? null;
}

/** The owner's contexts in alphabetical order. */
export async function listContexts(db: Reader, ownerId: string): Promise<ContextSummary[]> {
  return db
    .select({
      id: preachingContexts.id,
      name: preachingContexts.name,
      createdAt: preachingContexts.createdAt,
      updatedAt: preachingContexts.updatedAt,
      occurrenceCount: sql<number>`count(${preachingOccurrences.id})`.mapWith(Number),
    })
    .from(preachingContexts)
    .leftJoin(
      preachingOccurrences,
      and(
        eq(preachingOccurrences.contextId, preachingContexts.id),
        eq(preachingOccurrences.ownerId, preachingContexts.ownerId),
      ),
    )
    .where(eq(preachingContexts.ownerId, ownerId))
    .groupBy(preachingContexts.id)
    .orderBy(...byName);
}

/**
 * Creates a context. A name the owner already uses, in any case, is a
 * duplicate, and says which context has it, so choosing a suggestion a second
 * time finds the first.
 */
export async function createContext(
  db: Database,
  ownerId: string,
  name: string,
): Promise<ContextResult> {
  const [context] = await db
    .insert(preachingContexts)
    .values({ ownerId, name })
    .onConflictDoNothing()
    .returning();
  if (context) return { ok: true, context };
  return { ok: false, reason: "duplicate", existingId: await named(db, ownerId, name) };
}

/** Renames a context. The occasions that name it are untouched and still name it. */
export async function renameContext(
  db: Database,
  ownerId: string,
  id: string,
  name: string,
): Promise<ContextResult> {
  try {
    return await db.transaction(async (tx): Promise<ContextResult> => {
      const existingId = await named(tx, ownerId, name, id);
      if (existingId) return { ok: false, reason: "duplicate", existingId };
      const [context] = await tx
        .update(preachingContexts)
        .set({ name })
        .where(and(eq(preachingContexts.id, id), eq(preachingContexts.ownerId, ownerId)))
        .returning();
      return context ? { ok: true, context } : { ok: false, reason: "missing" };
    });
  } catch (error) {
    // Two requests for the same name at once: the index decided between them.
    if (isUniqueViolation(error)) return { ok: false, reason: "duplicate", existingId: null };
    throw error;
  }
}

/** Deletes a context no occasion names. One that history still names is kept, as in `deleteVenue`. */
export async function deleteContext(
  db: Database,
  ownerId: string,
  id: string,
): Promise<ContextDeletion> {
  const uses = (tx: Reader) =>
    tx
      .select({ total: count() })
      .from(preachingOccurrences)
      .where(
        and(eq(preachingOccurrences.contextId, id), eq(preachingOccurrences.ownerId, ownerId)),
      );
  try {
    return await db.transaction(async (tx): Promise<ContextDeletion> => {
      const [context] = await tx
        .select({ id: preachingContexts.id })
        .from(preachingContexts)
        .where(and(eq(preachingContexts.id, id), eq(preachingContexts.ownerId, ownerId)))
        .for("update");
      if (!context) return { ok: false, reason: "missing" };
      const [{ total }] = await uses(tx);
      if (total > 0) return { ok: false, reason: "in_use", count: total };
      await tx
        .delete(preachingContexts)
        .where(and(eq(preachingContexts.id, id), eq(preachingContexts.ownerId, ownerId)));
      return { ok: true };
    });
  } catch (error) {
    if (!isForeignKeyViolation(error)) throw error;
    const [{ total }] = await uses(db);
    return { ok: false, reason: "in_use", count: Math.max(total, 1) };
  }
}
