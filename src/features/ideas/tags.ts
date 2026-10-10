import { and, asc, eq, inArray, ne, notInArray, sql } from "drizzle-orm";

import { ideas, ideaTags, tags, type Tag } from "@/db/schema";
import { isUniqueViolation, type Database } from "@/db/types";

/** A tag as it appears on an idea. */
export type IdeaTag = { id: string; name: string };

/** A tag in the owner's list, with how many of their ideas carry it. */
export type TagSummary = Pick<Tag, "id" | "name" | "createdAt" | "updatedAt"> & {
  ideaCount: number;
};

export type TagResult = { ok: true; tag: Tag } | { ok: false; reason: "duplicate" | "missing" };

/**
 * A tag that was asked for is not one of the owner's. Thrown inside a
 * transaction so that everything done before it is undone. Whether the tag is
 * missing or someone else's is not recorded: the two are the same answer.
 */
export class UnknownTagError extends Error {
  constructor() {
    super("Unknown tag");
    this.name = "UnknownTagError";
  }
}

type Reader = Pick<Database, "select">;
type Writer = Pick<Database, "select" | "insert" | "delete">;

/*
 * As in ideas.ts, every statement here has the owner in its WHERE clause, and
 * a tag or idea that belongs to someone else is indistinguishable from one
 * that does not exist. The database repeats the rule: idea_tags can only hold
 * a tag and an idea with the same owner.
 */

const byName = [asc(sql`lower(${tags.name})`), asc(tags.id)];

/** The owner's tags in alphabetical order. */
export async function listTags(db: Reader, ownerId: string): Promise<TagSummary[]> {
  return db
    .select({
      id: tags.id,
      name: tags.name,
      createdAt: tags.createdAt,
      updatedAt: tags.updatedAt,
      ideaCount: sql<number>`count(${ideaTags.ideaId})`.mapWith(Number),
    })
    .from(tags)
    .leftJoin(ideaTags, and(eq(ideaTags.tagId, tags.id), eq(ideaTags.ownerId, tags.ownerId)))
    .where(eq(tags.ownerId, ownerId))
    .groupBy(tags.id)
    .orderBy(...byName);
}

/** Creates a tag. A name the owner already uses, in any case, is a duplicate. */
export async function createTag(db: Database, ownerId: string, name: string): Promise<TagResult> {
  const [tag] = await db.insert(tags).values({ ownerId, name }).onConflictDoNothing().returning();
  return tag ? { ok: true, tag } : { ok: false, reason: "duplicate" };
}

/** Renames a tag. The ideas that carry it are untouched. */
export async function renameTag(
  db: Database,
  ownerId: string,
  id: string,
  name: string,
): Promise<TagResult> {
  try {
    return await db.transaction(async (tx): Promise<TagResult> => {
      const clash = await tx
        .select({ id: tags.id })
        .from(tags)
        .where(
          and(
            eq(tags.ownerId, ownerId),
            ne(tags.id, id),
            sql`lower(${tags.name}) = lower(${name})`,
          ),
        )
        .limit(1);
      if (clash.length > 0) return { ok: false, reason: "duplicate" };
      const [tag] = await tx
        .update(tags)
        .set({ name })
        .where(and(eq(tags.id, id), eq(tags.ownerId, ownerId)))
        .returning();
      return tag ? { ok: true, tag } : { ok: false, reason: "missing" };
    });
  } catch (error) {
    // Two requests for the same name at once: the index decided between them.
    if (isUniqueViolation(error)) return { ok: false, reason: "duplicate" };
    throw error;
  }
}

/** True when the owner's tag was deleted. It comes off every idea; the ideas stay. */
export async function deleteTag(db: Database, ownerId: string, id: string): Promise<boolean> {
  const deleted = await db
    .delete(tags)
    .where(and(eq(tags.id, id), eq(tags.ownerId, ownerId)))
    .returning({ id: tags.id });
  return deleted.length > 0;
}

/** The tags on each of these ideas, in one query, alphabetically. */
export async function tagsForIdeas(db: Reader, ownerId: string, ideaIds: string[]) {
  const byIdea = new Map<string, IdeaTag[]>();
  if (ideaIds.length === 0) return byIdea;
  const rows = await db
    .select({ ideaId: ideaTags.ideaId, id: tags.id, name: tags.name })
    .from(ideaTags)
    .innerJoin(tags, and(eq(tags.id, ideaTags.tagId), eq(tags.ownerId, ideaTags.ownerId)))
    .where(and(eq(ideaTags.ownerId, ownerId), inArray(ideaTags.ideaId, ideaIds)))
    .orderBy(...byName);
  for (const { ideaId, ...tag } of rows) {
    const list = byIdea.get(ideaId) ?? [];
    list.push(tag);
    byIdea.set(ideaId, list);
  }
  return byIdea;
}

async function ownsIdea(db: Reader, ownerId: string, ideaId: string) {
  const rows = await db
    .select({ id: ideas.id })
    .from(ideas)
    .where(and(eq(ideas.id, ideaId), eq(ideas.ownerId, ownerId)))
    .limit(1);
  return rows.length > 0;
}

async function tagsOn(db: Reader, ownerId: string, ideaId: string) {
  return (await tagsForIdeas(db, ownerId, [ideaId])).get(ideaId) ?? [];
}

/**
 * Puts tags on an idea the caller has already established is the owner's, and
 * must be called inside a transaction. With `replace`, tags not in the list
 * come off. Throws `UnknownTagError` if any tag is not the owner's.
 */
export async function writeIdeaTags(
  tx: Writer,
  ownerId: string,
  ideaId: string,
  tagIds: string[],
  mode: "replace" | "add" = "replace",
) {
  const wanted = [...new Set(tagIds)];
  if (wanted.length > 0) {
    const owned = await tx
      .select({ id: tags.id })
      .from(tags)
      .where(and(eq(tags.ownerId, ownerId), inArray(tags.id, wanted)));
    if (owned.length !== wanted.length) throw new UnknownTagError();
  }
  if (mode === "replace") {
    await tx
      .delete(ideaTags)
      .where(
        and(
          eq(ideaTags.ideaId, ideaId),
          eq(ideaTags.ownerId, ownerId),
          wanted.length > 0 ? notInArray(ideaTags.tagId, wanted) : undefined,
        ),
      );
  }
  if (wanted.length === 0) return;
  await tx
    .insert(ideaTags)
    .values(wanted.map((tagId) => ({ ideaId, tagId, ownerId })))
    // A tag the idea already has is left as it was.
    .onConflictDoNothing();
}

/** The tags on one idea, or null when the idea is not the owner's. */
export async function getIdeaTags(
  db: Reader,
  ownerId: string,
  ideaId: string,
): Promise<IdeaTag[] | null> {
  if (!(await ownsIdea(db, ownerId, ideaId))) return null;
  return tagsOn(db, ownerId, ideaId);
}

/*
 * The three changes below return the idea's tags afterwards, or null when the
 * idea is not the owner's. They change which tags an idea has and nothing
 * else about it: its `updated_at` stays, so tagging does not reorder the library.
 */

/** Makes these the idea's tags, removing any others. */
export async function setIdeaTags(
  db: Database,
  ownerId: string,
  ideaId: string,
  tagIds: string[],
): Promise<IdeaTag[] | null> {
  return db.transaction(async (tx) => {
    if (!(await ownsIdea(tx, ownerId, ideaId))) return null;
    await writeIdeaTags(tx, ownerId, ideaId, tagIds, "replace");
    return tagsOn(tx, ownerId, ideaId);
  });
}

/** Adds tags to the idea, keeping the ones it has. */
export async function addIdeaTags(
  db: Database,
  ownerId: string,
  ideaId: string,
  tagIds: string[],
): Promise<IdeaTag[] | null> {
  return db.transaction(async (tx) => {
    if (!(await ownsIdea(tx, ownerId, ideaId))) return null;
    await writeIdeaTags(tx, ownerId, ideaId, tagIds, "add");
    return tagsOn(tx, ownerId, ideaId);
  });
}

/** Takes tags off the idea. A tag it does not have is ignored. */
export async function removeIdeaTags(
  db: Database,
  ownerId: string,
  ideaId: string,
  tagIds: string[],
): Promise<IdeaTag[] | null> {
  return db.transaction(async (tx) => {
    if (!(await ownsIdea(tx, ownerId, ideaId))) return null;
    if (tagIds.length > 0) {
      await tx
        .delete(ideaTags)
        .where(
          and(
            eq(ideaTags.ideaId, ideaId),
            eq(ideaTags.ownerId, ownerId),
            inArray(ideaTags.tagId, tagIds),
          ),
        );
    }
    return tagsOn(tx, ownerId, ideaId);
  });
}
