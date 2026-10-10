// @vitest-environment node
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { ideas, ideaTags, tags, users } from "@/db/schema";
import { createTestDatabase } from "@/db/testing";
import { isUniqueViolation, type Database } from "@/db/types";
import { createIdea, deleteIdea, getIdea, setIdeaKind, updateIdea } from "./ideas";
import { ideaInputSchema, tagIdsSchema, tagNameSchema } from "./schemas";
import {
  addIdeaTags,
  createTag,
  deleteTag,
  getIdeaTags,
  listTags,
  removeIdeaTags,
  renameTag,
  setIdeaTags,
  UnknownTagError,
} from "./tags";

let db: Database;
let me: string;
let other: string;

beforeEach(async () => {
  db = await createTestDatabase();
  const rows = await db
    .insert(users)
    .values([{ clerkUserId: "user_me" }, { clerkUserId: "user_other" }])
    .returning();
  [me, other] = rows.map((row) => row.id);
});

const input = (fields: Record<string, unknown>) => ideaInputSchema.parse(fields);
const nowhere = "99999999-9999-4999-8999-999999999999";

/** Creates a tag that is expected to succeed, and returns its ID. */
async function tag(owner: string, name: string) {
  const result = await createTag(db, owner, name);
  if (!result.ok) throw new Error(`Could not create ${name}`);
  return result.tag.id;
}
async function idea(owner: string, title: string) {
  return (await createIdea(db, owner, input({ title })))!.id;
}
const names = (list: { name: string }[] | null | undefined) => list?.map((item) => item.name);

describe("tags", () => {
  it("creates a tag and lists the owner's tags by name, with their use", async () => {
    const prayer = await tag(me, "Prayer");
    await tag(me, "faith");
    await tag(me, "Advent");
    const thought = await idea(me, "A thought");
    await setIdeaTags(db, me, thought, [prayer]);

    const list = await listTags(db, me);
    expect(list.map((item) => [item.name, item.ideaCount])).toEqual([
      ["Advent", 0],
      ["faith", 0],
      ["Prayer", 1],
    ]);
    expect(list[0].createdAt).toBeInstanceOf(Date);
    expect(list[0]).not.toHaveProperty("ownerId");
  });

  it("holds a name once per account, whatever its case", async () => {
    await tag(me, "Faith");
    expect(await createTag(db, me, "faith")).toEqual({ ok: false, reason: "duplicate" });
    expect(await createTag(db, me, "FAITH")).toEqual({ ok: false, reason: "duplicate" });
    expect(names(await listTags(db, me))).toEqual(["Faith"]);
    // Another account may use the same name.
    expect(await createTag(db, other, "faith")).toMatchObject({ ok: true });
    expect(names(await listTags(db, other))).toEqual(["faith"]);
  });

  it("renames a tag and leaves it on its ideas", async () => {
    const faith = await tag(me, "Faith");
    const thought = await idea(me, "A thought");
    await setIdeaTags(db, me, thought, [faith]);

    expect(await renameTag(db, me, faith, "Trust")).toMatchObject({
      ok: true,
      tag: { id: faith, name: "Trust" },
    });
    expect(await getIdeaTags(db, me, thought)).toEqual([{ id: faith, name: "Trust" }]);
    // Changing only the case of its own name is a rename, not a clash.
    expect(await renameTag(db, me, faith, "TRUST")).toMatchObject({ ok: true });
  });

  it("refuses to rename a tag to a name already in use", async () => {
    const faith = await tag(me, "Faith");
    await tag(me, "Prayer");
    expect(await renameTag(db, me, faith, "prayer")).toEqual({ ok: false, reason: "duplicate" });
    expect(names(await listTags(db, me))).toEqual(["Faith", "Prayer"]);
    expect(await renameTag(db, me, nowhere, "Hope")).toEqual({ ok: false, reason: "missing" });
  });

  it("deletes a tag from every idea and keeps the ideas", async () => {
    const faith = await tag(me, "Faith");
    const prayer = await tag(me, "Prayer");
    const first = await idea(me, "First");
    const second = await idea(me, "Second");
    await setIdeaTags(db, me, first, [faith, prayer]);
    await setIdeaTags(db, me, second, [faith]);

    expect(await deleteTag(db, me, faith)).toBe(true);
    expect(await deleteTag(db, me, faith)).toBe(false);
    expect(names(await getIdeaTags(db, me, first))).toEqual(["Prayer"]);
    expect(await getIdeaTags(db, me, second)).toEqual([]);
    expect(await getIdea(db, me, second)).toMatchObject({ title: "Second", tags: [] });
    expect(await db.select().from(ideaTags)).toHaveLength(1);
  });

  it("removes an idea's tag links when the idea is deleted, and keeps the tags", async () => {
    const faith = await tag(me, "Faith");
    const thought = await idea(me, "Gone");
    await setIdeaTags(db, me, thought, [faith]);
    expect(await deleteIdea(db, me, thought)).toBe(true);
    expect(await db.select().from(ideaTags)).toEqual([]);
    expect((await listTags(db, me)).map((item) => [item.name, item.ideaCount])).toEqual([
      ["Faith", 0],
    ]);
  });
});

describe("tags on ideas", () => {
  it("puts several tags on an idea and one tag on several ideas", async () => {
    const faith = await tag(me, "Faith");
    const prayer = await tag(me, "Prayer");
    const first = await idea(me, "First");
    const second = await idea(me, "Second");

    expect(names(await setIdeaTags(db, me, first, [prayer, faith]))).toEqual(["Faith", "Prayer"]);
    expect(names(await setIdeaTags(db, me, second, [faith]))).toEqual(["Faith"]);
    expect((await listTags(db, me)).map((item) => item.ideaCount)).toEqual([2, 1]);
    expect((await getIdea(db, me, first))?.tags).toEqual([
      { id: faith, name: "Faith" },
      { id: prayer, name: "Prayer" },
    ]);
  });

  it("adds, removes, and replaces", async () => {
    const [faith, prayer, hope] = [
      await tag(me, "Faith"),
      await tag(me, "Prayer"),
      await tag(me, "Hope"),
    ];
    const thought = await idea(me, "A thought");

    expect(names(await addIdeaTags(db, me, thought, [faith]))).toEqual(["Faith"]);
    expect(names(await addIdeaTags(db, me, thought, [prayer]))).toEqual(["Faith", "Prayer"]);
    expect(names(await removeIdeaTags(db, me, thought, [faith, hope]))).toEqual(["Prayer"]);
    expect(names(await setIdeaTags(db, me, thought, [hope, faith]))).toEqual(["Faith", "Hope"]);
    expect(await setIdeaTags(db, me, thought, [])).toEqual([]);
    expect(await removeIdeaTags(db, me, thought, [])).toEqual([]);
  });

  it("never holds the same tag on an idea twice", async () => {
    const faith = await tag(me, "Faith");
    const thought = await idea(me, "A thought");
    await addIdeaTags(db, me, thought, [faith, faith]);
    await addIdeaTags(db, me, thought, [faith]);
    await setIdeaTags(db, me, thought, [faith, faith]);
    expect(await db.select().from(ideaTags)).toHaveLength(1);
    // And the table would refuse a second row if the code ever tried.
    await expect(
      db.insert(ideaTags).values({ ideaId: thought, tagId: faith, ownerId: me }),
    ).rejects.toSatisfy(isUniqueViolation);
  });

  it("keeps a tag's first link when it is added again", async () => {
    const faith = await tag(me, "Faith");
    const thought = await idea(me, "A thought");
    await addIdeaTags(db, me, thought, [faith]);
    const [before] = await db.select().from(ideaTags);
    await setIdeaTags(db, me, thought, [faith]);
    expect(await db.select().from(ideaTags)).toEqual([before]);
  });

  it("changes nothing else about the idea", async () => {
    const faith = await tag(me, "Faith");
    const created = await createIdea(
      db,
      me,
      input({
        kind: "sermon",
        title: "It is Well",
        notes: "2 Kings 4.",
        subject: "Faith",
        sermonType: "topical",
        references: [
          { book: 43, chapterStart: 3, verseStart: 16, chapterEnd: null, verseEnd: null },
        ],
      }),
    );
    const before = await getIdea(db, me, created!.id);

    await setIdeaTags(db, me, created!.id, [faith]);
    await renameTag(db, me, faith, "Trust");
    await removeIdeaTags(db, me, created!.id, [faith]);
    await deleteTag(db, me, faith);

    // The same row, to the millisecond: tagging does not count as a change to the idea.
    expect(await getIdea(db, me, created!.id)).toEqual(before);
  });

  it("undoes the whole change when one of the tags is unknown", async () => {
    const faith = await tag(me, "Faith");
    const prayer = await tag(me, "Prayer");
    const thought = await idea(me, "A thought");
    await setIdeaTags(db, me, thought, [faith]);

    await expect(setIdeaTags(db, me, thought, [prayer, nowhere])).rejects.toBeInstanceOf(
      UnknownTagError,
    );
    await expect(addIdeaTags(db, me, thought, [prayer, nowhere])).rejects.toBeInstanceOf(
      UnknownTagError,
    );
    // Faith was not removed and Prayer was not added.
    expect(names(await getIdeaTags(db, me, thought))).toEqual(["Faith"]);
  });
});

describe("tags saved with an idea", () => {
  it("saves tags when an idea is created", async () => {
    const faith = await tag(me, "Faith");
    const created = await createIdea(db, me, input({ title: "Tagged", tagIds: [faith] }));
    expect(created?.tags).toEqual([{ id: faith, name: "Faith" }]);
    expect((await getIdea(db, me, created!.id))?.tags).toEqual([{ id: faith, name: "Faith" }]);
  });

  it("saves no idea at all when a tag is unknown or someone else's", async () => {
    const theirs = await tag(other, "Theirs");
    for (const tagIds of [[nowhere], [theirs]]) {
      await expect(createIdea(db, me, input({ title: "Tagged", tagIds }))).rejects.toBeInstanceOf(
        UnknownTagError,
      );
    }
    expect(await db.select().from(ideas)).toEqual([]);
  });

  it("returns a repeated submission's first idea with the tags it was given", async () => {
    const faith = await tag(me, "Faith");
    const prayer = await tag(me, "Prayer");
    const id = "22222222-2222-4222-8222-222222222222";
    await createIdea(db, me, input({ title: "Once", tagIds: [faith] }), id);
    const again = await createIdea(db, me, input({ title: "Once", tagIds: [prayer] }), id);
    expect(names(again?.tags)).toEqual(["Faith"]);
  });

  it("replaces tags on update when they are given, and leaves them when they are not", async () => {
    const faith = await tag(me, "Faith");
    const prayer = await tag(me, "Prayer");
    const created = await createIdea(db, me, input({ title: "Draft", tagIds: [faith] }));
    const id = created!.id;

    // An editor that knows nothing about tags, as in Phase 2A.
    expect(names((await updateIdea(db, me, id, input({ title: "Better" })))?.tags)).toEqual([
      "Faith",
    ]);
    expect(
      names((await updateIdea(db, me, id, input({ title: "Better", tagIds: [prayer] })))?.tags),
    ).toEqual(["Prayer"]);
    expect((await updateIdea(db, me, id, input({ title: "Better", tagIds: [] })))?.tags).toEqual(
      [],
    );
  });

  it("saves none of an update when a tag is unknown", async () => {
    const faith = await tag(me, "Faith");
    const created = await createIdea(db, me, input({ title: "Draft", tagIds: [faith] }));
    await expect(
      updateIdea(
        db,
        me,
        created!.id,
        input({ title: "Changed", notes: "New.", tagIds: [nowhere] }),
      ),
    ).rejects.toBeInstanceOf(UnknownTagError);
    expect(await getIdea(db, me, created!.id)).toMatchObject({
      title: "Draft",
      notes: null,
      tags: [{ id: faith, name: "Faith" }],
    });
  });

  it("keeps tags when an idea is reclassified", async () => {
    const faith = await tag(me, "Faith");
    const created = await createIdea(db, me, input({ title: "Any kind", tagIds: [faith] }));
    for (const kind of ["sermon", "point", "undecided"] as const) {
      await setIdeaKind(db, me, created!.id, kind);
      expect(names((await getIdea(db, me, created!.id))?.tags)).toEqual(["Faith"]);
    }
  });
});

describe("ownership", () => {
  it("keeps every tag operation inside the owner's own tags and ideas", async () => {
    const theirTag = await tag(other, "Theirs");
    const theirIdea = await idea(other, "Their idea");
    await setIdeaTags(db, other, theirIdea, [theirTag]);
    const myTag = await tag(me, "Mine");
    const myIdea = await idea(me, "My idea");

    expect(names(await listTags(db, me))).toEqual(["Mine"]);
    expect(await renameTag(db, me, theirTag, "Taken")).toEqual({ ok: false, reason: "missing" });
    expect(await deleteTag(db, me, theirTag)).toBe(false);

    // Their idea is not mine to read or tag, with my tag or theirs.
    expect(await getIdeaTags(db, me, theirIdea)).toBeNull();
    expect(await setIdeaTags(db, me, theirIdea, [myTag])).toBeNull();
    expect(await setIdeaTags(db, me, theirIdea, [])).toBeNull();
    expect(await addIdeaTags(db, me, theirIdea, [theirTag])).toBeNull();
    expect(await removeIdeaTags(db, me, theirIdea, [theirTag])).toBeNull();

    // Their tag cannot go on my idea, and is the same answer as a tag that does not exist.
    await expect(setIdeaTags(db, me, myIdea, [theirTag])).rejects.toBeInstanceOf(UnknownTagError);
    await expect(addIdeaTags(db, me, myIdea, [myTag, theirTag])).rejects.toBeInstanceOf(
      UnknownTagError,
    );
    expect(await removeIdeaTags(db, me, myIdea, [theirTag])).toEqual([]);

    // Nothing of theirs changed, and nothing of mine was half-done.
    expect(await getIdeaTags(db, other, theirIdea)).toEqual([{ id: theirTag, name: "Theirs" }]);
    expect(await getIdeaTags(db, me, myIdea)).toEqual([]);
    expect(names(await listTags(db, other))).toEqual(["Theirs"]);
  });

  it("is enforced by the database as well as the code", async () => {
    const theirTag = await tag(other, "Theirs");
    const theirIdea = await idea(other, "Their idea");
    const myTag = await tag(me, "Mine");
    const myIdea = await idea(me, "My idea");
    const link = (values: typeof ideaTags.$inferInsert) => db.insert(ideaTags).values(values);

    // Whichever owner the row claims, a tag and an idea of different accounts cannot be joined.
    await expect(link({ ideaId: myIdea, tagId: theirTag, ownerId: me })).rejects.toThrow();
    await expect(link({ ideaId: myIdea, tagId: theirTag, ownerId: other })).rejects.toThrow();
    await expect(link({ ideaId: theirIdea, tagId: myTag, ownerId: me })).rejects.toThrow();
    await expect(link({ ideaId: theirIdea, tagId: myTag, ownerId: other })).rejects.toThrow();
    // Nor can my own pair be filed under someone else.
    await expect(link({ ideaId: myIdea, tagId: myTag, ownerId: other })).rejects.toThrow();
    await expect(link({ ideaId: myIdea, tagId: myTag, ownerId: me })).resolves.toBeDefined();
  });
});

describe("constraints", () => {
  it("rejects names the application would never send", async () => {
    const insert = (name: string) => db.insert(tags).values({ ownerId: me, name });
    await expect(insert("   ")).rejects.toThrow();
    await expect(insert("")).rejects.toThrow();
    await expect(insert("x".repeat(51))).rejects.toThrow();
    await expect(insert("x".repeat(50))).resolves.toBeDefined();
    await expect(insert("X".repeat(50))).rejects.toSatisfy(isUniqueViolation);
    await expect(db.insert(tags).values({ ownerId: nowhere, name: "Orphan" })).rejects.toThrow();
  });

  it("keeps an account that still owns tags from being deleted", async () => {
    await tag(me, "Mine");
    await expect(db.delete(users).where(eq(users.id, me))).rejects.toThrow();
  });
});

describe("tag schemas", () => {
  it("trims a name and reduces the whitespace inside it", () => {
    expect(tagNameSchema.parse("  Spiritual \t  warfare \n")).toBe("Spiritual warfare");
    expect(tagNameSchema.safeParse("   ").success).toBe(false);
    expect(tagNameSchema.safeParse("").success).toBe(false);
    expect(tagNameSchema.safeParse(null).success).toBe(false);
    expect(tagNameSchema.safeParse(7).success).toBe(false);
    expect(tagNameSchema.safeParse("x".repeat(51)).success).toBe(false);
    expect(tagNameSchema.safeParse(` ${"x".repeat(50)} `).success).toBe(true);
  });

  it("accepts a bounded list of tag IDs and keeps each once", () => {
    const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    expect(tagIdsSchema.parse([id, id.toUpperCase()])).toEqual([id]);
    expect(tagIdsSchema.safeParse(["nope"]).success).toBe(false);
    expect(tagIdsSchema.safeParse(id).success).toBe(false);
    expect(tagIdsSchema.safeParse(Array(21).fill(id)).success).toBe(false);
  });

  it("leaves tags out of an idea's input unless they are given", () => {
    expect(input({ title: "T" })).not.toHaveProperty("tagIds");
    expect(input({ title: "T", tagIds: [] }).tagIds).toEqual([]);
    expect(ideaInputSchema.safeParse({ title: "T", tagIds: ["nope"] }).success).toBe(false);
  });
});
