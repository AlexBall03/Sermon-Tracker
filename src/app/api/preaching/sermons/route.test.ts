// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { users } from "@/db/schema";
import { createTestDatabase } from "@/db/testing";
import type { Database } from "@/db/types";
import type { Authorization } from "@/features/auth/access";
import { archiveIdea, createIdea } from "@/features/ideas/ideas";
import { ideaInputSchema } from "@/features/ideas/schemas";
import { sermonSearchHref, type SermonMatches } from "@/features/preaching/sermon-search";

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
  return (await response.json()) as SermonMatches;
};
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

describe("GET /api/preaching/sermons", () => {
  it("refuses anyone without an active account, and says nothing of any sermon", async () => {
    await save(me, { title: "Grace abounding", kind: "sermon" });
    const response = await ask("/api/preaching/sermons?q=grace");
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ message: "Your session has ended. Sign in again." });
  });

  it("offers the caller's sermons only: no other kind of idea, and no one else's", async () => {
    await save(me, { title: "Grace abounding", kind: "sermon" });
    await save(me, { title: "Grace in a point", kind: "point" });
    await save(me, { title: "Grace, undecided" });
    await save(other, { title: "Grace for the humble", kind: "sermon" });
    signInAs(me);

    const matches = await found(sermonSearchHref("grace"));
    expect(matches).toEqual({
      total: 1,
      items: [{ id: expect.any(String), title: "Grace abounding", archived: false }],
    });
    expect(JSON.stringify(await found(sermonSearchHref("")))).not.toContain("humble");
  });

  it("offers an archived sermon, and says that it is archived", async () => {
    const kept = await save(me, { title: "An old favorite", kind: "sermon" });
    await archiveIdea(db, me, kept!.id);
    await save(me, { title: "A new one", kind: "sermon" });
    signInAs(me);

    const matches = await found(sermonSearchHref(""));
    expect(matches.total).toBe(2);
    expect(matches.items.find((sermon) => sermon.title === "An old favorite")?.archived).toBe(true);
    expect(matches.items.find((sermon) => sermon.title === "A new one")?.archived).toBe(false);
  });

  it("takes nothing from the address but the words", async () => {
    await save(me, { title: "A sermon", kind: "sermon" });
    await save(me, { title: "A point", kind: "point" });
    await save(other, { title: "Theirs", kind: "sermon" });
    signInAs(me);
    const junk = await found(
      `/api/preaching/sermons?kind=point&archived=archived&owner=${other}&ownerId=${other}&page=9`,
    );
    expect(junk.items.map((sermon) => sermon.title)).toEqual(["A sermon"]);
    // "%" is a character to find, not a pattern that finds everything.
    expect((await found("/api/preaching/sermons?q=%25")).items).toEqual([]);
  });

  it("holds a few sermons and counts them all", async () => {
    for (let index = 0; index < 10; index++) {
      await save(me, { title: `Sermon ${index}`, kind: "sermon" });
    }
    signInAs(me);
    const matches = await found(sermonSearchHref("sermon"));
    expect(matches.items).toHaveLength(8);
    expect(matches.total).toBe(10);
  });

  it("is never cached, and answers a database failure without detail", async () => {
    signInAs(me);
    expect((await ask("/api/preaching/sermons")).headers.get("Cache-Control")).toBe("no-store");
    state.db = {
      select: () => {
        throw new Error("postgres://user:secret@host/db refused");
      },
    };
    const response = await ask("/api/preaching/sermons");
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({});
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("secret");
  });
});
