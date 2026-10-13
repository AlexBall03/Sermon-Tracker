// @vitest-environment node
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { ideas, sermonPoints, sermonRelations, users } from "@/db/schema";
import { createTestDatabase } from "@/db/testing";
import type { Database } from "@/db/types";
import { archiveIdea, deleteIdea, getIdea, restoreIdea, setIdeaKind, updateIdea } from "./ideas";
import { linkIdeas, relatedIdeas, unlinkIdeas } from "./relations";
import { ideaUpdateSchema } from "./schemas";

/*
 * Related sermons and related points, against a real in-memory PostgreSQL:
 * what the service allows, what the tables refuse whatever the service does,
 * and that relating never touches an idea.
 */

let db: Database;
let me: string;
let other: string;

const old = new Date("2026-01-01T00:00:00Z");

beforeEach(async () => {
  db = await createTestDatabase();
  const rows = await db
    .insert(users)
    .values([{ clerkUserId: "user_me" }, { clerkUserId: "user_other" }])
    .returning();
  [me, other] = rows.map((row) => row.id);
});

/** A row written directly, with old dates so any write to it would show. A sermon of mine by default. */
async function stored(title: string, fields: Partial<typeof ideas.$inferInsert> = {}) {
  const [row] = await db
    .insert(ideas)
    .values({ ownerId: me, kind: "sermon", title, createdAt: old, updatedAt: old, ...fields })
    .returning();
  return row.id;
}

const titles = async (id: string, owner = me) => {
  const related = await relatedIdeas(db, owner, id);
  return {
    sermons: related.sermons.map((idea) => idea.title),
    points: related.points.map((idea) => idea.title),
  };
};

const dates = async (id: string) => {
  const idea = await getIdea(db, me, id);
  return { updatedAt: idea?.updatedAt, lastDevelopedAt: idea?.lastDevelopedAt };
};

describe("related sermons", () => {
  it("are seen from both sermons once either is related to the other", async () => {
    const grace = await stored("Grace");
    const faith = await stored("Faith");
    expect(await linkIdeas(db, me, grace, faith)).toBe("linked");
    expect(await titles(grace)).toEqual({ sermons: ["Faith"], points: [] });
    expect(await titles(faith)).toEqual({ sermons: ["Grace"], points: [] });
    expect(await db.select().from(sermonRelations)).toHaveLength(1);
  });

  it("are stored once, however often and whichever way round they are asked for", async () => {
    const grace = await stored("Grace");
    const faith = await stored("Faith");
    expect(await linkIdeas(db, me, grace, faith)).toBe("linked");
    expect(await linkIdeas(db, me, grace, faith)).toBe("already");
    expect(await linkIdeas(db, me, faith, grace)).toBe("already");
    expect(await linkIdeas(db, me, faith.toUpperCase(), grace)).toBe("already");
    const rows = await db.select().from(sermonRelations);
    expect(rows).toHaveLength(1);
    expect(rows[0].sermonAId < rows[0].sermonBId).toBe(true);
  });

  it("are stored once when the same request arrives several times at once", async () => {
    const grace = await stored("Grace");
    const faith = await stored("Faith");
    const outcomes = await Promise.all([
      linkIdeas(db, me, grace, faith),
      linkIdeas(db, me, faith, grace),
      linkIdeas(db, me, grace, faith),
    ]);
    expect(outcomes.filter((outcome) => outcome === "linked")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome === "already")).toHaveLength(2);
    expect(await db.select().from(sermonRelations)).toHaveLength(1);
  });

  it("never relate a sermon to itself", async () => {
    const grace = await stored("Grace");
    expect(await linkIdeas(db, me, grace, grace)).toBe("self");
    expect(await db.select().from(sermonRelations)).toHaveLength(0);
  });

  it("are removed without touching either sermon or any other relation", async () => {
    const grace = await stored("Grace");
    const faith = await stored("Faith");
    const hope = await stored("Hope");
    await linkIdeas(db, me, grace, faith);
    await linkIdeas(db, me, grace, hope);

    // Named the other way round from how it was made.
    expect(await unlinkIdeas(db, me, faith, grace)).toBe(true);
    expect(await titles(grace)).toEqual({ sermons: ["Hope"], points: [] });
    expect(await titles(faith)).toEqual({ sermons: [], points: [] });
    expect(await getIdea(db, me, faith)).not.toBeNull();

    // Asked again, and for a pair never related: nothing to remove, and no error.
    expect(await unlinkIdeas(db, me, faith, grace)).toBe(false);
    expect(await unlinkIdeas(db, me, faith, hope)).toBe(false);
    expect(await titles(grace)).toEqual({ sermons: ["Hope"], points: [] });
  });
});

describe("related points", () => {
  it("relate one point to several sermons, from either side, without copying it", async () => {
    const grace = await stored("Grace");
    const faith = await stored("Faith");
    const point = await stored("Faith speaks first", { kind: "point" });
    expect(await linkIdeas(db, me, grace, point)).toBe("linked");
    // From the point's side.
    expect(await linkIdeas(db, me, point, faith)).toBe("linked");
    expect(await linkIdeas(db, me, point, grace)).toBe("already");

    expect(await titles(grace)).toEqual({ sermons: [], points: ["Faith speaks first"] });
    expect(await titles(faith)).toEqual({ sermons: [], points: ["Faith speaks first"] });
    expect(await titles(point)).toEqual({ sermons: ["Faith", "Grace"], points: [] });
    expect(await db.select().from(sermonPoints)).toHaveLength(2);
    expect(await db.select().from(ideas).where(eq(ideas.kind, "point"))).toHaveLength(1);
  });

  it("are removed from one sermon and kept, with their other sermons", async () => {
    const grace = await stored("Grace");
    const faith = await stored("Faith");
    const point = await stored("Faith speaks first", { kind: "point" });
    await linkIdeas(db, me, grace, point);
    await linkIdeas(db, me, faith, point);

    expect(await unlinkIdeas(db, me, point, grace)).toBe(true);
    expect(await titles(grace)).toEqual({ sermons: [], points: [] });
    expect(await titles(point)).toEqual({ sermons: ["Faith"], points: [] });
    expect((await getIdea(db, me, point))?.title).toBe("Faith speaks first");
  });

  it("are only ever between a sermon and a point", async () => {
    const sermon = await stored("Grace");
    const point = await stored("One", { kind: "point" });
    const second = await stored("Two", { kind: "point" });
    const undecided = await stored("Something", { kind: "undecided" });
    expect(await linkIdeas(db, me, point, second)).toBe("kinds");
    expect(await linkIdeas(db, me, sermon, undecided)).toBe("kinds");
    expect(await linkIdeas(db, me, undecided, point)).toBe("kinds");
    expect(await db.select().from(sermonPoints)).toHaveLength(0);
    expect(await db.select().from(sermonRelations)).toHaveLength(0);
    expect(await titles(undecided)).toEqual({ sermons: [], points: [] });
  });
});

describe("ownership", () => {
  it("never relates, shows, or removes across accounts", async () => {
    const mine = await stored("Mine");
    const second = await stored("Mine too");
    const theirs = await stored("Theirs", { ownerId: other });
    const unknown = "55555555-5555-4555-8555-555555555555";

    // Someone else's idea is the same answer as one that does not exist.
    expect(await linkIdeas(db, me, mine, theirs)).toBe("missing");
    expect(await linkIdeas(db, me, theirs, mine)).toBe("missing");
    expect(await linkIdeas(db, me, mine, unknown)).toBe("missing");
    expect(await db.select().from(sermonRelations)).toHaveLength(0);

    await linkIdeas(db, me, mine, second);
    expect(await linkIdeas(db, other, mine, second)).toBe("missing");
    expect(await titles(mine, other)).toEqual({ sermons: [], points: [] });
    expect(await unlinkIdeas(db, other, mine, second)).toBe(false);
    expect(await titles(mine)).toEqual({ sermons: ["Mine too"], points: [] });
  });

  it("is enforced by the tables themselves", async () => {
    const mine = await stored("Mine");
    const second = await stored("Mine too");
    const theirs = await stored("Theirs", { ownerId: other });
    const [a, b] = [mine, second].sort();

    // A sermon with itself, and a pair the wrong way round.
    await expect(
      db.insert(sermonRelations).values({ sermonAId: a, sermonBId: a, ownerId: me }),
    ).rejects.toThrow();
    await expect(
      db.insert(sermonRelations).values({ sermonAId: b, sermonBId: a, ownerId: me }),
    ).rejects.toThrow();
    await expect(
      db.insert(sermonPoints).values({ sermonId: a, pointId: a, ownerId: me }),
    ).rejects.toThrow();

    // Another account's idea, under either owner.
    const [low, high] = [mine, theirs].sort();
    for (const ownerId of [me, other]) {
      await expect(
        db.insert(sermonRelations).values({ sermonAId: low, sermonBId: high, ownerId }),
      ).rejects.toThrow();
      await expect(
        db.insert(sermonPoints).values({ sermonId: mine, pointId: theirs, ownerId }),
      ).rejects.toThrow();
    }

    // The same pair twice.
    await db.insert(sermonRelations).values({ sermonAId: a, sermonBId: b, ownerId: me });
    await expect(
      db.insert(sermonRelations).values({ sermonAId: a, sermonBId: b, ownerId: me }),
    ).rejects.toThrow();
  });
});

describe("an idea's life", () => {
  it("keeps relations through archiving and restoring, and shows the archived ones", async () => {
    const grace = await stored("Grace");
    const faith = await stored("Faith");
    const point = await stored("Faith speaks first", { kind: "point" });
    await linkIdeas(db, me, grace, faith);
    await linkIdeas(db, me, grace, point);

    await archiveIdea(db, me, faith);
    await archiveIdea(db, me, point);
    const related = await relatedIdeas(db, me, grace);
    expect(related.sermons.map((idea) => [idea.title, idea.archivedAt !== null])).toEqual([
      ["Faith", true],
    ]);
    expect(related.points[0].archivedAt).not.toBeNull();
    // Seen from the archived sermon too.
    expect(await titles(faith)).toEqual({ sermons: ["Grace"], points: [] });

    // An archived idea can be related, and stays archived with its status.
    const hope = await stored("Hope", { archivedAt: old, status: "on_hold" });
    expect(await linkIdeas(db, me, grace, hope)).toBe("linked");
    const kept = await getIdea(db, me, hope);
    expect(kept?.archivedAt).toEqual(old);
    expect(kept?.status).toBe("on_hold");

    await restoreIdea(db, me, faith);
    expect(await titles(grace)).toEqual({
      sermons: ["Faith", "Hope"],
      points: ["Faith speaks first"],
    });
    expect(await db.select().from(sermonRelations)).toHaveLength(2);
  });

  it("removes a deleted idea's relations and nothing else", async () => {
    const grace = await stored("Grace");
    const faith = await stored("Faith");
    const hope = await stored("Hope");
    const point = await stored("Faith speaks first", { kind: "point" });
    await linkIdeas(db, me, grace, faith);
    await linkIdeas(db, me, faith, hope);
    await linkIdeas(db, me, faith, point);
    await linkIdeas(db, me, grace, point);

    expect(await deleteIdea(db, me, faith)).toBe("deleted");
    expect(await getIdea(db, me, grace)).not.toBeNull();
    expect(await getIdea(db, me, hope)).not.toBeNull();
    expect(await titles(grace)).toEqual({ sermons: [], points: ["Faith speaks first"] });
    expect(await titles(hope)).toEqual({ sermons: [], points: [] });

    // A deleted point leaves its sermon whole and nothing stale behind.
    expect(await deleteIdea(db, me, point)).toBe("deleted");
    expect(await titles(grace)).toEqual({ sermons: [], points: [] });
    expect(await db.select().from(sermonPoints)).toHaveLength(0);
    expect(await db.select().from(sermonRelations)).toHaveLength(0);
  });

  it("hides a relation while an idea is filed as something else, and has it back after", async () => {
    const grace = await stored("Grace");
    const faith = await stored("Faith");
    await linkIdeas(db, me, grace, faith);

    await setIdeaKind(db, me, faith, "point");
    expect(await titles(grace)).toEqual({ sermons: [], points: [] });
    expect(await titles(faith)).toEqual({ sermons: [], points: [] });

    await setIdeaKind(db, me, faith, "sermon");
    expect(await titles(grace)).toEqual({ sermons: ["Faith"], points: [] });
  });
});

describe("development", () => {
  it("is not relating or unrelating: neither date moves on either idea", async () => {
    const grace = await stored("Grace");
    const faith = await stored("Faith", { lastDevelopedAt: old });
    const point = await stored("Faith speaks first", { kind: "point" });
    const before = await Promise.all([grace, faith, point].map(dates));
    expect(before[0]).toEqual({ updatedAt: old, lastDevelopedAt: null });

    await linkIdeas(db, me, grace, faith);
    await linkIdeas(db, me, grace, point);
    await linkIdeas(db, me, point, faith);
    expect(await Promise.all([grace, faith, point].map(dates))).toEqual(before);

    await unlinkIdeas(db, me, grace, faith);
    await unlinkIdeas(db, me, point, grace);
    await unlinkIdeas(db, me, faith, point);
    expect(await Promise.all([grace, faith, point].map(dates))).toEqual(before);
  });

  it("is still an edit to the content, on a related sermon as on any other", async () => {
    const grace = await stored("Grace");
    const faith = await stored("Faith");
    await linkIdeas(db, me, grace, faith);
    await updateIdea(
      db,
      me,
      grace,
      ideaUpdateSchema.parse({ kind: "sermon", title: "Grace", notes: "Paul's thorn." }),
    );
    expect((await dates(grace)).lastDevelopedAt).not.toBeNull();
    expect((await dates(faith)).lastDevelopedAt).toBeNull();
    expect(await titles(grace)).toEqual({ sermons: ["Faith"], points: [] });
  });
});
