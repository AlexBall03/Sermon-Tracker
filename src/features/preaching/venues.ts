import { and, asc, count, eq, ne, sql } from "drizzle-orm";

import { preachingOccurrences, preachingVenues, type PreachingVenue } from "@/db/schema";
import { isForeignKeyViolation, isUniqueViolation, type Database } from "@/db/types";
import type { VenueInput, VenueUpdate } from "./schemas";

/** A venue in the owner's list, with how many occasions in their history name it. */
export type VenueSummary = Pick<
  PreachingVenue,
  "id" | "name" | "locality" | "createdAt" | "updatedAt"
> & { occurrenceCount: number };

export type VenueResult =
  | { ok: true; venue: PreachingVenue }
  /** The owner has a venue of that name already, whatever its case; `existingId` is it. */
  | { ok: false; reason: "duplicate"; existingId: string | null }
  | { ok: false; reason: "missing" };

export type VenueDeletion =
  | { ok: true }
  | { ok: false; reason: "missing" }
  /** Occasions still name it, `count` of them; nothing was deleted and none was changed. */
  | { ok: false; reason: "in_use"; count: number };

type Reader = Pick<Database, "select">;

/*
 * Every statement here has the owner in its WHERE clause, so a venue that
 * belongs to someone else is indistinguishable from one that does not exist.
 */

const byName = [asc(sql`lower(${preachingVenues.name})`), asc(preachingVenues.id)];

async function named(db: Reader, ownerId: string, name: string, except?: string) {
  const [row] = await db
    .select({ id: preachingVenues.id })
    .from(preachingVenues)
    .where(
      and(
        eq(preachingVenues.ownerId, ownerId),
        sql`lower(${preachingVenues.name}) = lower(${name})`,
        except ? ne(preachingVenues.id, except) : undefined,
      ),
    )
    .limit(1);
  return row?.id ?? null;
}

/** The owner's venues in alphabetical order. */
export async function listVenues(db: Reader, ownerId: string): Promise<VenueSummary[]> {
  return db
    .select({
      id: preachingVenues.id,
      name: preachingVenues.name,
      locality: preachingVenues.locality,
      createdAt: preachingVenues.createdAt,
      updatedAt: preachingVenues.updatedAt,
      occurrenceCount: sql<number>`count(${preachingOccurrences.id})`.mapWith(Number),
    })
    .from(preachingVenues)
    .leftJoin(
      preachingOccurrences,
      and(
        eq(preachingOccurrences.venueId, preachingVenues.id),
        eq(preachingOccurrences.ownerId, preachingVenues.ownerId),
      ),
    )
    .where(eq(preachingVenues.ownerId, ownerId))
    .groupBy(preachingVenues.id)
    .orderBy(...byName);
}

/** Creates a venue. A name the owner already uses, in any case, is a duplicate, and says which venue has it. */
export async function createVenue(
  db: Database,
  ownerId: string,
  input: VenueInput,
): Promise<VenueResult> {
  const [venue] = await db
    .insert(preachingVenues)
    .values({ ownerId, name: input.name, locality: input.locality })
    .onConflictDoNothing()
    .returning();
  if (venue) return { ok: true, venue };
  return { ok: false, reason: "duplicate", existingId: await named(db, ownerId, input.name) };
}

/** Renames a venue or changes its locality. The occasions that name it are untouched and still name it. */
export async function updateVenue(
  db: Database,
  ownerId: string,
  id: string,
  change: VenueUpdate,
): Promise<VenueResult> {
  try {
    return await db.transaction(async (tx): Promise<VenueResult> => {
      if (change.name !== undefined) {
        const existingId = await named(tx, ownerId, change.name, id);
        if (existingId) return { ok: false, reason: "duplicate", existingId };
      }
      const [venue] = await tx
        .update(preachingVenues)
        .set({ name: change.name, locality: change.locality })
        .where(and(eq(preachingVenues.id, id), eq(preachingVenues.ownerId, ownerId)))
        .returning();
      return venue ? { ok: true, venue } : { ok: false, reason: "missing" };
    });
  } catch (error) {
    // Two requests for the same name at once: the index decided between them.
    if (isUniqueViolation(error)) return { ok: false, reason: "duplicate", existingId: null };
    throw error;
  }
}

/**
 * Deletes a venue no occasion names. One that history still names is kept,
 * and so is the history: nothing is detached. The venue's row is held while
 * it is counted, and the foreign key refuses whatever that misses.
 */
export async function deleteVenue(
  db: Database,
  ownerId: string,
  id: string,
): Promise<VenueDeletion> {
  const uses = (tx: Reader) =>
    tx
      .select({ total: count() })
      .from(preachingOccurrences)
      .where(and(eq(preachingOccurrences.venueId, id), eq(preachingOccurrences.ownerId, ownerId)));
  try {
    return await db.transaction(async (tx): Promise<VenueDeletion> => {
      const [venue] = await tx
        .select({ id: preachingVenues.id })
        .from(preachingVenues)
        .where(and(eq(preachingVenues.id, id), eq(preachingVenues.ownerId, ownerId)))
        .for("update");
      if (!venue) return { ok: false, reason: "missing" };
      const [{ total }] = await uses(tx);
      if (total > 0) return { ok: false, reason: "in_use", count: total };
      await tx
        .delete(preachingVenues)
        .where(and(eq(preachingVenues.id, id), eq(preachingVenues.ownerId, ownerId)));
      return { ok: true };
    });
  } catch (error) {
    if (!isForeignKeyViolation(error)) throw error;
    const [{ total }] = await uses(db);
    return { ok: false, reason: "in_use", count: Math.max(total, 1) };
  }
}
