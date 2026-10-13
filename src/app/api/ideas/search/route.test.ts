// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { users } from "@/db/schema";
import { createTestDatabase } from "@/db/testing";
import type { Database } from "@/db/types";
import type { Authorization } from "@/features/auth/access";
import type { IdeaMatches } from "@/features/ideas/idea-search";
import { ideaSearchHref } from "@/features/ideas/idea-search";
import { archiveIdea, createIdea } from "@/features/ideas/ideas";
import { ideaInputSchema } from "@/features/ideas/schemas";
import { createOutline } from "@/features/outlines/outlines";

// The access helper is mocked; the database is a real in-memory PostgreSQL.
const state = vi.hoisted(() => ({
  access: { ok: false, message: "Your session has ended. Sign in again." } as unknown,
  db: undefined as unknown,
}));

vi.mock("@/db", () => ({ getDb: () => state.db }));
vi.mock("@/features/auth/access", () => ({
  authorize: async (): Promise<Authorization> => state.access as Authorization,
}));

import { GET } from "./route";

let db: Database;
let me: string;
let other: string;

function signInAs(id: string) {
  state.access = {
    ok: true,
    user: {
      id,
      clerkUserId: "user_x",
      role: "user",
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };
}

const ask = (path: string) => GET(new Request(`https://sermontracker.test${path}`));
const found = async (path: string) => {
  const response = await ask(path);
  expect(response.status).toBe(200);
  return (await response.json()) as IdeaMatches;
};
const titles = async (path: string) => (await found(path)).items.map((idea) => idea.title);
const save = (owner: string, fields: Record<string, unknown>) =>
  createIdea(db, owner, ideaInputSchema.parse(fields));

beforeEach(async () => {
  db = await createTestDatabase();
  state.db = db;
  const rows = await db
    .insert(users)
    .values([{ clerkUserId: "user_me" }, { clerkUserId: "user_other" }])
    .returning();
  [me, other] = rows.map((row) => row.id);
  state.access = { ok: false, message: "Your session has ended. Sign in again." };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/ideas/search", () => {
  it("refuses anyone without an active account, and says nothing of any idea", async () => {
    await save(me, { title: "Grace abounding" });
    for (const message of [
      "Your session has ended. Sign in again.",
      "Your account does not have access.",
    ]) {
      state.access = { ok: false, message };
      const response = await ask("/api/ideas/search?q=grace");
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ message });
    }
  });

  it("finds the caller's ideas by their words, and never another account's", async () => {
    await save(me, { title: "Grace abounding", kind: "sermon", subject: "Grace" });
    await save(me, { title: "Faith speaks first", kind: "point" });
    await save(other, { title: "Grace for the humble", notes: "private" });
    signInAs(me);

    const matches = await found("/api/ideas/search?q=grace");
    expect(matches.total).toBe(1);
    expect(matches.items).toEqual([
      expect.objectContaining({
        title: "Grace abounding",
        kind: "sermon",
        status: "idea",
        subject: "Grace",
        references: [],
      }),
    ]);
    // Only what the picker shows: no notes, no owner, no dates.
    expect(Object.keys(matches.items[0]).sort()).toEqual(
      ["archived", "id", "kind", "references", "status", "subject", "title"].sort(),
    );
    expect(JSON.stringify(matches)).not.toContain("humble");
  });

  it("lists the most recently changed ideas when nothing is typed", async () => {
    await save(me, { title: "First" });
    await save(me, { title: "Second" });
    await save(other, { title: "Theirs" });
    signInAs(me);
    const matches = await found("/api/ideas/search");
    expect(matches.total).toBe(2);
    expect(matches.items.map((idea) => idea.title).sort()).toEqual(["First", "Second"]);
  });

  it("keeps to one kind when asked", async () => {
    await save(me, { title: "A sermon", kind: "sermon" });
    await save(me, { title: "A point", kind: "point" });
    await save(me, { title: "A thought" });
    signInAs(me);
    expect(await titles(ideaSearchHref("", "sermon"))).toEqual(["A sermon"]);
    expect(await titles(ideaSearchHref("", "point"))).toEqual(["A point"]);
    expect(await titles(ideaSearchHref("a", "point"))).toEqual(["A point"]);
    expect((await titles(ideaSearchHref("", null))).sort()).toEqual([
      "A point",
      "A sermon",
      "A thought",
    ]);
  });

  it("returns the references an idea has, and a subject only on a sermon", async () => {
    const reference = {
      book: 43,
      chapterStart: 3,
      verseStart: 16,
      chapterEnd: null,
      verseEnd: null,
      isPrimary: false,
    };
    await save(me, { title: "Loved", kind: "point", subject: "Love", references: [reference] });
    signInAs(me);
    const [idea] = (await found("/api/ideas/search?q=loved")).items;
    expect(idea.references).toEqual([reference]);
    // Kept from its time as a sermon, a point's subject is not shown, nor searched.
    expect(idea.subject).toBeNull();
  });

  it("holds a few ideas and counts them all", async () => {
    for (let index = 0; index < 11; index++) await save(me, { title: `Thought ${index}` });
    signInAs(me);
    const matches = await found("/api/ideas/search?q=thought");
    expect(matches.items).toHaveLength(8);
    expect(matches.total).toBe(11);
  });

  it("offers archived ideas only when the address asks for them, and marks them", async () => {
    const kept = await save(me, { title: "Kept", kind: "sermon" });
    const put = await save(me, { title: "Put away", kind: "sermon" });
    await archiveIdea(db, me, put!.id);
    signInAs(me);

    // What the Scripture picker asks: archived ideas are not there.
    expect(await titles(ideaSearchHref("", "sermon"))).toEqual(["Kept"]);
    // What the related-ideas picker asks.
    const all = await found(ideaSearchHref("", "sermon", "all"));
    expect(all.total).toBe(2);
    expect(Object.fromEntries(all.items.map((idea) => [idea.title, idea.archived]))).toEqual({
      Kept: false,
      "Put away": true,
    });
    expect(all.items.find((idea) => idea.id === kept!.id)?.archived).toBe(false);
    // Anything else in its place is the default.
    expect(await titles("/api/ideas/search?kind=sermon&archived=everything")).toEqual(["Kept"]);
  });

  it("says which sermon has an outline only when asked, and only of the caller's own", async () => {
    const outlined = await save(me, { title: "Outlined", kind: "sermon" });
    await save(me, { title: "Bare", kind: "sermon" });
    await save(me, { title: "A point", kind: "point" });
    const theirs = await save(other, { title: "Theirs", kind: "sermon" });
    const mine = await createOutline(db, me, outlined!.id);
    await createOutline(db, other, theirs!.id);
    if (mine.status !== "created") throw new Error(mine.status);
    signInAs(me);

    const asked = await found(ideaSearchHref("", null, undefined, true));
    expect(Object.fromEntries(asked.items.map((idea) => [idea.title, idea.outlineId]))).toEqual({
      Outlined: mine.outline.id,
      Bare: null,
      "A point": null,
    });
    // Every other picker is answered as it always was.
    for (const idea of (await found(ideaSearchHref("", null))).items) {
      expect(idea).not.toHaveProperty("outlineId");
    }
    expect(ideaSearchHref("grace", "sermon", undefined, true)).toBe(
      "/api/ideas/search?q=grace&kind=sermon&outline=1",
    );
  });

  it("takes nothing from the address but the words, the kind, and the archive view", async () => {
    await save(me, { title: "Zebra", status: "ready" });
    await save(me, { title: "Apple" });
    await save(other, { title: "Theirs" });
    signInAs(me);
    const junk =
      `/api/ideas/search?sort=title-asc&page=9&status=ready&owner=${other}&ownerId=${other}` +
      `&tag=${other}&kind=series&q=%25`;
    // "%" is a character to find, not a pattern that finds everything.
    expect((await found(junk)).items).toEqual([]);
    const plain = await found(
      `/api/ideas/search?sort=title-asc&page=9&status=ready&owner=${other}&kind=series`,
    );
    expect(plain.items.map((idea) => idea.title).sort()).toEqual(["Apple", "Zebra"]);
  });

  it("is never cached, and answers a database failure without detail", async () => {
    signInAs(me);
    expect((await ask("/api/ideas/search")).headers.get("Cache-Control")).toBe("no-store");
    state.db = {
      select: () => {
        throw new Error("postgres://user:secret@host/db refused");
      },
    };
    const response = await ask("/api/ideas/search");
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      message: "Your ideas could not be searched. Try again.",
    });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("secret");
  });
});
