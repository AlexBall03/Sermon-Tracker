// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";

import { ideas, users } from "@/db/schema";
import { createTestDatabase } from "@/db/testing";
import type { Database } from "@/db/types";
import {
  archiveIdea,
  classifyIdea,
  continueWorking,
  recentIdeas,
  restoreIdea,
  updateIdea,
  workspaceCounts,
} from "./ideas";
import { ideaStatuses } from "./model";
import { ideaUpdateSchema } from "./schemas";
import { createTag, setIdeaTags } from "./tags";

/*
 * What the dashboard reads about ideas: the sermons being worked on, the
 * latest ideas, and three counts, against a real in-memory PostgreSQL.
 */

let db: Database;
let me: string;
let other: string;

const now = new Date("2026-10-12T12:00:00Z");
const day = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(now.getTime() - days * day);

beforeEach(async () => {
  db = await createTestDatabase();
  const rows = await db
    .insert(users)
    .values([{ clerkUserId: "user_me" }, { clerkUserId: "user_other" }])
    .returning();
  [me, other] = rows.map((row) => row.id);
});

/** A row written directly, so its dates can be anything. A sermon of mine at Developing, worked on 5 days ago, by default. */
async function stored(title: string, fields: Partial<typeof ideas.$inferInsert> = {}) {
  const [row] = await db
    .insert(ideas)
    .values({
      ownerId: me,
      kind: "sermon",
      title,
      status: "developing",
      createdAt: daysAgo(90),
      updatedAt: daysAgo(5),
      lastDevelopedAt: daysAgo(5),
      ...fields,
    })
    .returning();
  return row.id;
}

const titles = async (owner = me, limit?: number) =>
  (await continueWorking(db, owner, limit)).map((idea) => idea.title);

describe("the sermons being worked on", () => {
  it("are the owner's own", async () => {
    await stored("Mine");
    await stored("Theirs", { ownerId: other });
    expect(await titles()).toEqual(["Mine"]);
    expect(await titles(other)).toEqual(["Theirs"]);
  });

  it("are sermons, never points or undecided ideas", async () => {
    await stored("A sermon");
    await stored("A point", { kind: "point" });
    await stored("Undecided", { kind: "undecided" });
    expect(await titles()).toEqual(["A sermon"]);
  });

  it("are at Idea or Developing, and not Ready or On Hold", async () => {
    for (const status of ideaStatuses) await stored(status, { status });
    expect((await titles()).sort()).toEqual(["developing", "idea"]);
  });

  it("leave out a sermon that was only captured, however lately", async () => {
    await stored("Worked on");
    await stored("Just captured", {
      lastDevelopedAt: null,
      createdAt: daysAgo(0),
      updatedAt: daysAgo(0),
    });
    expect(await titles()).toEqual(["Worked on"]);
  });

  it("leave out an archived sermon, and have it back when it is restored", async () => {
    const id = await stored("Put away");
    await archiveIdea(db, me, id);
    expect(await titles()).toEqual([]);
    await restoreIdea(db, me, id);
    expect(await titles()).toEqual(["Put away"]);
  });

  it("come most recently developed first, whatever was changed since", async () => {
    await stored("Older work, touched today", {
      lastDevelopedAt: daysAgo(20),
      updatedAt: daysAgo(0),
    });
    await stored("Newer work", { lastDevelopedAt: daysAgo(2), updatedAt: daysAgo(2) });
    await stored("Middle", { lastDevelopedAt: daysAgo(9) });
    expect(await titles()).toEqual(["Newer work", "Middle", "Older work, touched today"]);
  });

  it("are not moved up by a change of status or tags", async () => {
    const older = await stored("Older", { lastDevelopedAt: daysAgo(20), status: "idea" });
    await stored("Newer", { lastDevelopedAt: daysAgo(2) });
    await classifyIdea(db, me, older, { status: "developing" });
    const tag = await createTag(db, me, "Grace");
    if (!tag.ok) throw new Error("the tag was not created");
    await setIdeaTags(db, me, older, [tag.tag.id]);
    expect(await titles()).toEqual(["Newer", "Older"]);
  });

  it("are moved up by work on the content", async () => {
    const older = await stored("Older", { lastDevelopedAt: daysAgo(20) });
    await stored("Newer", { lastDevelopedAt: daysAgo(2) });
    await updateIdea(
      db,
      me,
      older,
      ideaUpdateSchema.parse({ kind: "sermon", title: "Older", notes: "A new thought." }),
    );
    expect(await titles()).toEqual(["Older", "Newer"]);
  });

  it("are four at most by default, as many as asked otherwise, in one order for a tie", async () => {
    const at = daysAgo(3);
    for (const title of ["A", "B", "C", "D", "E"]) await stored(title, { lastDevelopedAt: at });
    const first = await titles();
    expect(first).toHaveLength(4);
    expect(await titles()).toEqual(first);
    expect(await titles(me, 2)).toEqual(first.slice(0, 2));
  });

  it("are none for an account with nothing", async () => {
    expect(await titles()).toEqual([]);
  });
});

describe("the latest ideas", () => {
  it("are of every kind, newest change first, without the archived, and the owner's own", async () => {
    await stored("Sermon", { updatedAt: daysAgo(3) });
    await stored("Point", { kind: "point", updatedAt: daysAgo(1) });
    await stored("Undecided", { kind: "undecided", updatedAt: daysAgo(2) });
    await stored("Archived", { updatedAt: daysAgo(0), archivedAt: daysAgo(0) });
    await stored("Theirs", { ownerId: other, updatedAt: daysAgo(0) });
    const recent = await recentIdeas(db, me, 5);
    expect(recent.map((idea) => idea.title)).toEqual(["Point", "Undecided", "Sermon"]);
    // The rows alone: the dashboard shows no passages or tags.
    expect(recent[0]).not.toHaveProperty("references");
    expect(recent[0]).not.toHaveProperty("tags");
    expect(await recentIdeas(db, me, 2)).toHaveLength(2);
  });
});

describe("the dashboard's counts", () => {
  it("are zero for an account with nothing", async () => {
    expect(await workspaceCounts(db, me)).toEqual({ sermons: 0, points: 0, developing: 0 });
  });

  it("count sermon ideas, point ideas, and sermons in development", async () => {
    await stored("Developing 1");
    await stored("Developing 2");
    await stored("Idea", { status: "idea" });
    await stored("Ready", { status: "ready" });
    await stored("Point 1", { kind: "point" });
    // A point keeps the status it had; only a sermon is in development.
    await stored("Point 2", { kind: "point", status: "developing" });
    await stored("Undecided", { kind: "undecided" });
    expect(await workspaceCounts(db, me)).toEqual({ sermons: 4, points: 2, developing: 2 });
  });

  it("leave out archived ideas and other accounts' ideas", async () => {
    await stored("Kept");
    await stored("Archived sermon", { archivedAt: daysAgo(1) });
    await stored("Archived point", { kind: "point", archivedAt: daysAgo(1) });
    await stored("Theirs", { ownerId: other });
    await stored("Their point", { ownerId: other, kind: "point" });
    expect(await workspaceCounts(db, me)).toEqual({ sermons: 1, points: 0, developing: 1 });
    expect(await workspaceCounts(db, other)).toEqual({ sermons: 1, points: 1, developing: 1 });
  });
});
