import { and, asc, eq, inArray, or, sql } from "drizzle-orm";

import { ideas, sermonPoints, sermonRelations, type Idea } from "@/db/schema";
import type { Database } from "@/db/types";
import { asRead } from "./ideas";

/*
 * Related ideas: sermons that go with a sermon, and points that go with a
 * sermon. Both are plain associations a person made by hand. They are not
 * content, not an outline, and not development: nothing here writes to
 * `ideas`, so linking and unlinking move neither `updated_at` nor
 * `last_developed_at`, on either side.
 *
 * As in ideas.ts, every function takes the owner and puts it in the WHERE
 * clause of each statement, so someone else's idea is indistinguishable from
 * one that does not exist.
 */

/** A related idea as its row shows it: enough to name it, say where it stands, and open it. */
export type RelatedIdea = Pick<Idea, "id" | "title" | "kind" | "status" | "archivedAt">;

export type RelatedIdeas = {
  /** On a sermon, the sermons related to it; on a point, the sermons it is related to. */
  sermons: RelatedIdea[];
  /** On a sermon, the points related to it. Always empty on anything else. */
  points: RelatedIdea[];
};

type Reader = Pick<Database, "select">;

const shown = {
  id: ideas.id,
  title: ideas.title,
  kind: ideas.kind,
  status: ideas.status,
  archivedAt: ideas.archivedAt,
  // Read only so the row can pass through `asRead`.
  sermonType: ideas.sermonType,
};

const byTitle = [asc(sql`lower(${ideas.title})`), asc(ideas.id)];

function asRelated(row: Pick<Idea, keyof typeof shown>): RelatedIdea {
  const { id, title, kind, status, archivedAt } = asRead(row as Idea);
  return { id, title, kind, status, archivedAt };
}

/**
 * The ideas related to one of the owner's ideas. An idea that is unknown,
 * someone else's, or undecided has none.
 *
 * Archived ideas are returned, on purpose: a relation outlives archiving, and
 * the page marks them. This is the one list of ideas that does not leave them
 * out. What is left out is an idea filed as something else since it was
 * linked: its row is kept, and it is shown again if it is filed back.
 */
export async function relatedIdeas(db: Reader, ownerId: string, id: string): Promise<RelatedIdeas> {
  const [idea] = await db
    .select({ kind: ideas.kind })
    .from(ideas)
    .where(and(eq(ideas.id, id), eq(ideas.ownerId, ownerId)))
    .limit(1);
  if (!idea || idea.kind === "undecided") return { sermons: [], points: [] };

  if (idea.kind === "point") {
    const rows = await db
      .select(shown)
      .from(sermonPoints)
      .innerJoin(ideas, eq(ideas.id, sermonPoints.sermonId))
      .where(
        and(
          eq(sermonPoints.pointId, id),
          eq(sermonPoints.ownerId, ownerId),
          eq(ideas.ownerId, ownerId),
          eq(ideas.kind, "sermon"),
        ),
      )
      .orderBy(...byTitle);
    return { sermons: rows.map(asRelated), points: [] };
  }

  const [sermons, points] = await Promise.all([
    db
      .select(shown)
      .from(sermonRelations)
      // The other sermon of the pair, whichever column this one is in.
      .innerJoin(
        ideas,
        sql`${ideas.id} = case when ${sermonRelations.sermonAId} = ${id} then ${sermonRelations.sermonBId} else ${sermonRelations.sermonAId} end`,
      )
      .where(
        and(
          or(eq(sermonRelations.sermonAId, id), eq(sermonRelations.sermonBId, id)),
          eq(sermonRelations.ownerId, ownerId),
          eq(ideas.ownerId, ownerId),
          eq(ideas.kind, "sermon"),
        ),
      )
      .orderBy(...byTitle),
    db
      .select(shown)
      .from(sermonPoints)
      .innerJoin(ideas, eq(ideas.id, sermonPoints.pointId))
      .where(
        and(
          eq(sermonPoints.sermonId, id),
          eq(sermonPoints.ownerId, ownerId),
          eq(ideas.ownerId, ownerId),
          eq(ideas.kind, "point"),
        ),
      )
      .orderBy(...byTitle),
  ]);
  return { sermons: sermons.map(asRelated), points: points.map(asRelated) };
}

/**
 * What became of an attempt to relate two ideas. `already` is a pair that was
 * related before, by this request's twin or long ago; `kinds` is a pair that
 * is not two sermons or a sermon and a point.
 */
export type LinkOutcome = "linked" | "already" | "missing" | "self" | "kinds";

/** The same pair in the one order it is stored in, whichever way round it was given. */
function ordered(one: string, other: string): [string, string] {
  const [a, b] = [one.toLowerCase(), other.toLowerCase()];
  return a < b ? [a, b] : [b, a];
}

/**
 * Relates two of the owner's ideas: two sermons, or a sermon and a point in
 * either order. The relation is one row and is seen from both ideas; asking
 * again, or the other way round, or twice at once, leaves that one row.
 *
 * Both ideas' rows are locked, lower ID first, while their kinds are read, so
 * neither can be refiled or deleted underneath and two requests cannot wait
 * on each other. Neither idea is written to. An archived idea is related like
 * any other and stays archived.
 */
export async function linkIdeas(
  db: Database,
  ownerId: string,
  id: string,
  otherId: string,
): Promise<LinkOutcome> {
  const pair = ordered(id, otherId);
  if (pair[0] === pair[1]) return "self";

  return db.transaction(async (tx): Promise<LinkOutcome> => {
    const found = await tx
      .select({ id: ideas.id, kind: ideas.kind })
      .from(ideas)
      .where(and(inArray(ideas.id, pair), eq(ideas.ownerId, ownerId)))
      .orderBy(asc(ideas.id))
      .for("update");
    if (found.length !== 2) return "missing";

    const sermons = found.filter((idea) => idea.kind === "sermon");
    const point = found.find((idea) => idea.kind === "point");

    if (sermons.length === 2) {
      const created = await tx
        .insert(sermonRelations)
        .values({ sermonAId: pair[0], sermonBId: pair[1], ownerId })
        .onConflictDoNothing()
        .returning({ id: sermonRelations.sermonAId });
      return created.length > 0 ? "linked" : "already";
    }
    if (sermons.length === 1 && point) {
      const created = await tx
        .insert(sermonPoints)
        .values({ sermonId: sermons[0].id, pointId: point.id, ownerId })
        .onConflictDoNothing()
        .returning({ id: sermonPoints.sermonId });
      return created.length > 0 ? "linked" : "already";
    }
    return "kinds";
  });
}

/**
 * Takes away the relation between two ideas, whichever kind it is and
 * whichever way round they are named. Both ideas are kept as they are. A pair
 * that was not related, or is not the owner's, is left alone and is no error:
 * the answer is whether anything was removed.
 */
export async function unlinkIdeas(
  db: Database,
  ownerId: string,
  id: string,
  otherId: string,
): Promise<boolean> {
  const [a, b] = ordered(id, otherId);
  const [relations, points] = await Promise.all([
    db
      .delete(sermonRelations)
      .where(
        and(
          eq(sermonRelations.sermonAId, a),
          eq(sermonRelations.sermonBId, b),
          eq(sermonRelations.ownerId, ownerId),
        ),
      )
      .returning({ id: sermonRelations.sermonAId }),
    db
      .delete(sermonPoints)
      .where(
        and(
          eq(sermonPoints.ownerId, ownerId),
          or(
            and(eq(sermonPoints.sermonId, a), eq(sermonPoints.pointId, b)),
            and(eq(sermonPoints.sermonId, b), eq(sermonPoints.pointId, a)),
          ),
        ),
      )
      .returning({ id: sermonPoints.sermonId }),
  ]);
  return relations.length + points.length > 0;
}
