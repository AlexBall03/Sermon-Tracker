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

import { createIdea, updateIdea } from "./actions";
import { getIdea, recentIdeas } from "./ideas";
import {
  addIdeaTags,
  createTag,
  deleteTag,
  removeIdeaTags,
  renameTag,
  setIdeaTags,
} from "./tag-actions";
import { getIdeaTags, listTags } from "./tags";

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

const nowhere = "99999999-9999-4999-8999-999999999999";
const invalid = { ok: false, message: "That request was not valid." };
const missingTag = { ok: false, message: "That tag no longer exists." };
const missingIdea = { ok: false, message: "That idea no longer exists." };
const unknownTag = { ok: false, message: "One of those tags no longer exists." };

/** A tag and an idea belonging to `owner`, made through the actions. */
async function seed(owner: string, name: string) {
  signInAs(owner);
  const tag = (await createTag(name)).tag!.id;
  const idea = (await createIdea({ title: `${name} idea` })).id!;
  return { tag, idea };
}

describe("tag actions", () => {
  it("reject a signed-out, disabled, or uninvited caller before touching the database", async () => {
    for (const message of [
      "Your session has ended. Sign in again.",
      "Your account does not have access.",
    ]) {
      state.access = { ok: false, message };
      for (const result of [
        await createTag("Faith"),
        await renameTag(nowhere, "Faith"),
        await deleteTag(nowhere),
        await setIdeaTags(nowhere, []),
        await addIdeaTags(nowhere, [nowhere]),
        await removeIdeaTags(nowhere, [nowhere]),
      ]) {
        expect(result).toEqual({ ok: false, message });
      }
    }
    expect(await listTags(db, me)).toEqual([]);
  });

  it("create a tag for the signed-in account, tidying its name", async () => {
    signInAs(me);
    const result = await createTag("  Spiritual   warfare ");
    expect(result).toEqual({
      ok: true,
      message: "Tag created.",
      tag: { id: expect.any(String), name: "Spiritual warfare" },
    });
    expect((await listTags(db, me)).map((tag) => tag.name)).toEqual(["Spiritual warfare"]);
    expect(await listTags(db, other)).toEqual([]);
  });

  it("refuse a name already in use with a message that says so", async () => {
    signInAs(me);
    await createTag("Faith");
    const duplicate = { ok: false, message: "You already have a tag with that name." };
    expect(await createTag(" faith ")).toEqual(duplicate);
    const { tag } = await createTag("Prayer");
    expect(await renameTag(tag!.id, "FAITH")).toEqual(duplicate);
    expect((await listTags(db, me)).map((item) => item.name)).toEqual(["Faith", "Prayer"]);
  });

  it("report invalid names and IDs in plain words", async () => {
    signInAs(me);
    for (const name of ["", "   ", null, undefined, 5, {}, ["Faith"]]) {
      expect(await createTag(name)).toEqual({ ok: false, message: "Give the tag a name." });
    }
    expect(await createTag("x".repeat(51))).toEqual({
      ok: false,
      message: "Keep a tag to 50 characters or fewer.",
    });
    expect(await renameTag("1; drop table tags", "Faith")).toEqual(invalid);
    expect(await deleteTag(undefined)).toEqual(invalid);
    expect(await setIdeaTags("nope", [])).toEqual(invalid);
    expect(await setIdeaTags(nowhere, ["nope"])).toMatchObject({ ok: false });
    expect(await setIdeaTags(nowhere, "nope")).toMatchObject({ ok: false });
    expect(await setIdeaTags(nowhere, Array(21).fill(nowhere))).toEqual({
      ok: false,
      message: "An idea can hold up to 20 tags.",
    });
    expect(await listTags(db, me)).toEqual([]);
  });

  it("rename and delete the caller's own tag", async () => {
    signInAs(me);
    const { tag } = await createTag("Faith");
    expect(await renameTag(tag!.id, " Trust ")).toEqual({
      ok: true,
      message: "Tag renamed.",
      tag: { id: tag!.id, name: "Trust" },
    });
    expect(await deleteTag(tag!.id)).toEqual({ ok: true, message: "Tag deleted." });
    expect(await deleteTag(tag!.id)).toEqual(missingTag);
  });

  it("set, add to, and remove an idea's tags", async () => {
    const { tag: faith, idea } = await seed(me, "Faith");
    const prayer = (await createTag("Prayer")).tag!.id;

    expect(await setIdeaTags(idea, [faith])).toEqual({
      ok: true,
      message: "Tags updated.",
      tags: [{ id: faith, name: "Faith" }],
    });
    expect((await addIdeaTags(idea, [prayer])).tags?.map((tag) => tag.name)).toEqual([
      "Faith",
      "Prayer",
    ]);
    expect((await removeIdeaTags(idea, [faith])).tags).toEqual([{ id: prayer, name: "Prayer" }]);
    expect((await setIdeaTags(idea, [])).tags).toEqual([]);
  });

  it("give the same answers for another account's records as for ones that do not exist", async () => {
    const theirs = await seed(other, "Theirs");
    await setIdeaTags(theirs.idea, [theirs.tag]);
    const mine = await seed(me, "Mine");

    for (const tag of [theirs.tag, nowhere]) {
      expect(await renameTag(tag, "Taken")).toEqual(missingTag);
      expect(await deleteTag(tag)).toEqual(missingTag);
      expect(await setIdeaTags(mine.idea, [tag])).toEqual(unknownTag);
      expect(await addIdeaTags(mine.idea, [mine.tag, tag])).toEqual(unknownTag);
    }
    for (const idea of [theirs.idea, nowhere]) {
      expect(await setIdeaTags(idea, [mine.tag])).toEqual(missingIdea);
      expect(await addIdeaTags(idea, [mine.tag])).toEqual(missingIdea);
      expect(await removeIdeaTags(idea, [mine.tag])).toEqual(missingIdea);
      // The idea is checked first, so their tag is not revealed either.
      expect(await setIdeaTags(idea, [theirs.tag])).toEqual(missingIdea);
    }

    expect(await getIdeaTags(db, other, theirs.idea)).toEqual([{ id: theirs.tag, name: "Theirs" }]);
    expect(await getIdeaTags(db, me, mine.idea)).toEqual([]);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("answer a database failure with a fixed message", async () => {
    signInAs(me);
    const failing = () => {
      throw new Error("postgres://user:secret@host/db refused");
    };
    state.db = { insert: failing, delete: failing, transaction: failing };

    expect(await createTag("Faith")).toEqual({
      ok: false,
      message: "The tag could not be created. Try again.",
    });
    expect(await renameTag(nowhere, "Faith")).toEqual({
      ok: false,
      message: "The tag could not be renamed. Try again.",
    });
    expect(await deleteTag(nowhere)).toEqual({
      ok: false,
      message: "The tag could not be deleted. Try again.",
    });
    expect(await setIdeaTags(nowhere, [])).toEqual({
      ok: false,
      message: "The tags could not be updated. Try again.",
    });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("secret");
  });
});

describe("idea actions with tags", () => {
  it("save an idea with its tags, and without any when none are named", async () => {
    signInAs(me);
    const faith = (await createTag("Faith")).tag!.id;
    const tagged = await createIdea({ title: "Tagged", tagIds: [faith] });
    const plain = await createIdea({ title: "Plain" });
    expect(tagged.ok && plain.ok).toBe(true);
    expect((await getIdea(db, me, tagged.id!))?.tags).toEqual([{ id: faith, name: "Faith" }]);
    expect((await getIdea(db, me, plain.id!))?.tags).toEqual([]);
  });

  it("save nothing when a tag is missing or someone else's, and say only that", async () => {
    const theirs = await seed(other, "Theirs");
    signInAs(me);
    const { id } = await createIdea({ title: "Draft", notes: "Before." });

    for (const tag of [theirs.tag, nowhere]) {
      expect(await createIdea({ title: "New", tagIds: [tag] })).toEqual(unknownTag);
      expect(await updateIdea(id, { title: "Changed", notes: "After.", tagIds: [tag] })).toEqual(
        unknownTag,
      );
    }
    expect((await recentIdeas(db, me, 10)).map((idea) => idea.title)).toEqual(["Draft"]);
    expect(await getIdea(db, me, id!)).toMatchObject({ notes: "Before.", tags: [] });
    expect(console.error).not.toHaveBeenCalled();
  });

  it("leave an idea's tags alone when an update does not mention them", async () => {
    signInAs(me);
    const faith = (await createTag("Faith")).tag!.id;
    const { id } = await createIdea({ title: "Draft", tagIds: [faith] });
    expect(await updateIdea(id, { title: "Better" })).toMatchObject({ ok: true });
    expect((await getIdea(db, me, id!))?.tags).toEqual([{ id: faith, name: "Faith" }]);
    expect(await updateIdea(id, { title: "Better", tagIds: [] })).toMatchObject({ ok: true });
    expect((await getIdea(db, me, id!))?.tags).toEqual([]);
  });
});
