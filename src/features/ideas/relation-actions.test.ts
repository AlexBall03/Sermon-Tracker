// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ideas, sermonPoints, sermonRelations, users } from "@/db/schema";
import { createTestDatabase } from "@/db/testing";
import type { Database } from "@/db/types";
import type { Authorization } from "@/features/auth/access";

// The access helper is mocked; the database is a real in-memory PostgreSQL.
const state = vi.hoisted(() => ({
  access: { ok: false, message: "Your session has ended. Sign in again." } as unknown,
  db: undefined as unknown,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/db", () => ({ getDb: () => state.db }));
vi.mock("@/features/auth/access", () => ({
  authorize: async (): Promise<Authorization> => state.access as Authorization,
}));

import { relateIdeas, unrelateIdeas } from "./relation-actions";
import { relatedIdeas } from "./relations";

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

async function stored(title: string, fields: Partial<typeof ideas.$inferInsert> = {}) {
  const [row] = await db
    .insert(ideas)
    .values({ ownerId: me, kind: "sermon", title, ...fields })
    .returning();
  return row.id;
}

const rows = async () =>
  (await db.select().from(sermonRelations)).length + (await db.select().from(sermonPoints)).length;

beforeEach(async () => {
  db = await createTestDatabase();
  state.db = db;
  const created = await db
    .insert(users)
    .values([{ clerkUserId: "user_me" }, { clerkUserId: "user_other" }])
    .returning();
  [me, other] = created.map((row) => row.id);
  state.access = { ok: false, message: "Your session has ended. Sign in again." };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("relation actions", () => {
  it("reject a signed-out or disabled caller before touching the database", async () => {
    const grace = await stored("Grace");
    const faith = await stored("Faith");
    for (const message of [
      "Your session has ended. Sign in again.",
      "Your account does not have access.",
    ]) {
      state.access = { ok: false, message };
      expect(await relateIdeas(grace, faith)).toEqual({ ok: false, message });
      expect(await unrelateIdeas(grace, faith)).toEqual({ ok: false, message });
    }
    expect(await rows()).toBe(0);
  });

  it("refuse anything that is not two idea IDs", async () => {
    signInAs(me);
    const grace = await stored("Grace");
    for (const bad of [undefined, null, 7, "", "not-an-id", { id: grace }, [grace]]) {
      expect(await relateIdeas(grace, bad)).toEqual({
        ok: false,
        message: "That request was not valid.",
      });
      expect(await relateIdeas(bad, grace)).toMatchObject({ ok: false });
      expect(await unrelateIdeas(grace, bad)).toMatchObject({ ok: false });
    }
    expect(await rows()).toBe(0);
  });

  it("relate and unrelate the caller's own ideas, and say so", async () => {
    signInAs(me);
    const grace = await stored("Grace");
    const faith = await stored("Faith");
    const point = await stored("Faith speaks first", { kind: "point" });

    expect(await relateIdeas(grace, faith)).toEqual({
      ok: true,
      message: "Added to related ideas.",
    });
    expect(await relateIdeas(faith, grace)).toEqual({
      ok: true,
      message: "Those ideas are already related.",
    });
    expect(await relateIdeas(point, grace)).toMatchObject({ ok: true });
    expect(await rows()).toBe(2);

    expect(await unrelateIdeas(faith, grace)).toEqual({
      ok: true,
      message: "Removed from related ideas. Both ideas are kept.",
    });
    // Twice is once.
    expect(await unrelateIdeas(faith, grace)).toMatchObject({ ok: true });
    expect(await relatedIdeas(db, me, grace)).toMatchObject({
      sermons: [],
      points: [{ title: "Faith speaks first" }],
    });
  });

  it("answer the same for another account's idea as for one that does not exist", async () => {
    signInAs(me);
    const grace = await stored("Grace");
    const theirs = await stored("Theirs", { ownerId: other });
    const second = await stored("Theirs too", { ownerId: other });
    const missing = { ok: false, message: "That idea no longer exists." };

    expect(await relateIdeas(grace, theirs)).toEqual(missing);
    expect(await relateIdeas(theirs, grace)).toEqual(missing);
    expect(await relateIdeas(theirs, second)).toEqual(missing);
    expect(await relateIdeas(grace, "55555555-5555-4555-8555-555555555555")).toEqual(missing);
    expect(await rows()).toBe(0);

    // A relation of theirs is not mine to remove.
    signInAs(other);
    await relateIdeas(theirs, second);
    signInAs(me);
    await unrelateIdeas(theirs, second);
    expect(await rows()).toBe(1);
  });

  it("refuse an idea with itself and a pairing that is not a sermon's", async () => {
    signInAs(me);
    const grace = await stored("Grace");
    const point = await stored("One", { kind: "point" });
    const second = await stored("Two", { kind: "point" });
    const undecided = await stored("Something", { kind: "undecided" });

    expect(await relateIdeas(grace, grace)).toEqual({
      ok: false,
      message: "An idea cannot be related to itself.",
    });
    const wrong = {
      ok: false,
      message: "A sermon can be related to another sermon or to a point, and nothing else.",
    };
    expect(await relateIdeas(point, second)).toEqual(wrong);
    expect(await relateIdeas(grace, undecided)).toEqual(wrong);
    expect(await rows()).toBe(0);
  });

  it("report a failure of the database without its details", async () => {
    signInAs(me);
    const grace = await stored("Grace");
    const faith = await stored("Faith");
    state.db = {
      transaction: async () => {
        throw new Error("postgres://user:secret@host/db is down");
      },
      delete: () => {
        throw new Error("postgres://user:secret@host/db is down");
      },
    };
    expect(await relateIdeas(grace, faith)).toEqual({
      ok: false,
      message: "The ideas could not be related. Try again.",
    });
    expect(await unrelateIdeas(grace, faith)).toEqual({
      ok: false,
      message: "That could not be removed from related ideas. Try again.",
    });
  });
});
