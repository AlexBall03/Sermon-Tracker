// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { users } from "@/db/schema";
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

import { changeIdeaKind, createIdea, deleteIdea, updateIdea } from "./actions";
import { getIdea, listIdeas } from "./ideas";

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

describe("idea actions", () => {
  it("reject a signed-out, disabled, or uninvited caller before touching the database", async () => {
    const id = "55555555-5555-4555-8555-555555555555";
    for (const message of [
      "Your session has ended. Sign in again.",
      "Your account does not have access.",
    ]) {
      state.access = { ok: false, message };
      for (const result of [
        await createIdea({ title: "Thought" }),
        await updateIdea(id, { title: "Thought" }),
        await changeIdeaKind(id, "sermon"),
        await deleteIdea(id),
      ]) {
        expect(result).toEqual({ ok: false, message });
      }
    }
    expect(await listIdeas(db, me)).toEqual([]);
  });

  it("create an idea for the signed-in account and nobody else", async () => {
    signInAs(me);
    const result = await createIdea({ title: "Mine", ownerId: other, owner_id: other });
    expect(result).toMatchObject({ ok: true, message: "Saved to your library." });
    expect(await getIdea(db, me, result.id!)).toMatchObject({ ownerId: me, title: "Mine" });
    expect(await listIdeas(db, other)).toEqual([]);
  });

  it("save a double submission once", async () => {
    signInAs(me);
    const id = "66666666-6666-4666-8666-666666666666";
    const [first, second] = await Promise.all([
      createIdea({ title: "Once" }, id),
      createIdea({ title: "Once" }, id),
    ]);
    expect(first).toMatchObject({ ok: true, id });
    expect(second).toMatchObject({ ok: true, id });
    expect(await listIdeas(db, me)).toHaveLength(1);
  });

  it("report invalid input in plain words and save nothing", async () => {
    signInAs(me);
    expect(await createIdea({ title: "  " })).toEqual({
      ok: false,
      message: "Write the idea first. A few words are enough.",
    });
    expect(await createIdea({ title: "T", kind: "series" })).toMatchObject({ ok: false });
    expect(await createIdea({ title: "T" }, "not-a-uuid")).toMatchObject({ ok: false });
    expect(await createIdea(null)).toMatchObject({ ok: false });
    expect(
      await createIdea({
        title: "T",
        references: [
          { book: 43, chapterStart: 3, verseStart: 37, chapterEnd: null, verseEnd: null },
        ],
      }),
    ).toMatchObject({ ok: false, message: expect.stringMatching(/36 verses/) });
    expect(await listIdeas(db, me)).toEqual([]);
  });

  it("give the same answer for another account's idea as for one that does not exist", async () => {
    signInAs(other);
    const theirs = await createIdea({ title: "Theirs" });
    signInAs(me);
    const missing = { ok: false, message: "That idea no longer exists." };
    for (const id of [theirs.id!, "77777777-7777-4777-8777-777777777777"]) {
      expect(await updateIdea(id, { title: "Taken" })).toEqual(missing);
      expect(await changeIdeaKind(id, "sermon")).toEqual(missing);
      expect(await deleteIdea(id)).toEqual(missing);
    }
    expect(await getIdea(db, other, theirs.id!)).toMatchObject({
      title: "Theirs",
      kind: "undecided",
    });
  });

  it("refuse malformed IDs and classifications", async () => {
    signInAs(me);
    const invalid = { ok: false, message: "That request was not valid." };
    expect(await updateIdea("1; drop table ideas", { title: "T" })).toEqual(invalid);
    expect(await deleteIdea(undefined)).toEqual(invalid);
    const { id } = await createIdea({ title: "T" });
    expect(await changeIdeaKind(id, "series")).toEqual(invalid);
  });

  it("update, reclassify, and delete the caller's own idea", async () => {
    signInAs(me);
    const { id } = await createIdea({ title: "Draft", notes: "Keep me." });
    expect(await updateIdea(id, { title: "Better", notes: "Keep me.", status: "ready" })).toEqual({
      ok: true,
      message: "Changes saved.",
    });
    expect(await changeIdeaKind(id, "point")).toEqual({
      ok: true,
      message: "Now filed as: Point idea.",
    });
    expect(await getIdea(db, me, id!)).toMatchObject({
      title: "Better",
      notes: "Keep me.",
      status: "ready",
      kind: "point",
    });
    expect(await deleteIdea(id)).toEqual({ ok: true, message: "Idea deleted." });
    expect(await getIdea(db, me, id!)).toBeNull();
  });

  it("answer a database failure with a fixed message", async () => {
    signInAs(me);
    state.db = {
      transaction: () => {
        throw new Error("postgres://user:secret@host/db refused");
      },
    };
    const result = await createIdea({ title: "Thought" });
    expect(result).toEqual({ ok: false, message: "The idea could not be saved. Try again." });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("secret");
  });
});
