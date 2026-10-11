// @vitest-environment node
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import {
  bibleFavorites,
  bibleFavoriteVerses,
  bibleHighlights,
  bibleVerses,
  ideas,
  users,
} from "@/db/schema";
import { createTestDatabase } from "@/db/testing";
import type { Database } from "@/db/types";
import {
  countFavorites,
  createFavorite,
  deleteFavorite,
  favoritesInChapter,
  getChapterMarks,
  getFavorite,
  searchFavorites,
  updateFavorite,
} from "./favorites";
import { clearHighlights, highlightsInChapter, setHighlights } from "./highlights";
import { highlightColors } from "./model";
import { defaultSavedQuery, type SavedQuery } from "./saved-query";
import type { VerseRef } from "./verse-set";

let db: Database;
let me: string;
let other: string;

const v = (book: number, chapter: number, verse: number): VerseRef => ({ book, chapter, verse });
const john = (...verses: number[]) => verses.map((verse) => v(43, 3, verse));
const romans = [v(45, 3, 10), v(45, 3, 23), v(45, 6, 23)];
const nowhere = "99999999-9999-4999-8999-999999999999";

const save = async (
  owner: string,
  verses: VerseRef[],
  extra: { label?: string | null; notes?: string | null } = {},
) => {
  const saved = await createFavorite(db, owner, {
    translation: "kjv",
    verses,
    label: extra.label ?? null,
    notes: extra.notes ?? null,
  });
  return saved!;
};

const find = async (query: Partial<SavedQuery> = {}, owner = me, pageSize?: number) =>
  searchFavorites(db, owner, { ...defaultSavedQuery, ...query }, pageSize);
const references = async (query: Partial<SavedQuery> = {}, owner = me) =>
  (await find(query, owner)).items.map((item) => item.reference);

beforeEach(async () => {
  db = await createTestDatabase();
  const rows = await db
    .insert(users)
    .values([{ clerkUserId: "user_me" }, { clerkUserId: "user_other" }])
    .returning();
  [me, other] = rows.map((row) => row.id);
});

describe("creating a favorite", () => {
  it("saves one verse", async () => {
    const { favorite, existing } = await save(me, john(16));
    expect(existing).toBe(false);
    expect(favorite).toMatchObject({
      translation: "kjv",
      reference: "John 3:16",
      label: null,
      notes: null,
      verses: john(16),
    });
    expect(await getFavorite(db, me, favorite.id)).toEqual(favorite);
  });

  it("saves a passage as one favorite", async () => {
    const { favorite } = await save(me, john(16, 17, 18));
    expect(favorite.reference).toBe("John 3:16–18");
    expect(await countFavorites(db, me)).toBe(1);
    const rows = await db.select().from(bibleFavoriteVerses);
    expect(rows.map((row) => [row.position, row.verse])).toEqual([
      [0, 16],
      [1, 17],
      [2, 18],
    ]);
  });

  it("saves verses that are apart, across chapters, in the Bible's order", async () => {
    const { favorite } = await save(me, [romans[2], romans[0], romans[1]]);
    expect(favorite.reference).toBe("Romans 3:10, 23; 6:23");
    expect(favorite.verses).toEqual(romans);
    expect((await getFavorite(db, me, favorite.id))!.verses).toEqual(romans);
  });

  it("keeps a label and notes", async () => {
    const { favorite } = await save(me, john(16), { label: "The gospel", notes: "For Easter." });
    expect(favorite).toMatchObject({ label: "The gospel", notes: "For Easter." });
  });

  it("does not save the same verses twice, whatever order or label they come with", async () => {
    const first = await save(me, john(16, 17), { label: "First", notes: "Kept." });
    const again = await save(me, john(17, 16, 17), { label: "Second", notes: "Lost." });
    expect(again.existing).toBe(true);
    expect(again.favorite.id).toBe(first.favorite.id);
    // The one that was there is returned as it stands; nothing was overwritten.
    expect(again.favorite).toMatchObject({ label: "First", notes: "Kept." });
    expect(await countFavorites(db, me)).toBe(1);
  });

  it("treats a different set of verses as a different favorite", async () => {
    await save(me, john(16));
    expect((await save(me, john(16, 17))).existing).toBe(false);
    expect((await save(me, [v(43, 4, 16)])).existing).toBe(false);
    expect(await countFavorites(db, me)).toBe(3);
  });

  it("lets two accounts save the same passage", async () => {
    const mine = await save(me, john(16));
    const theirs = await save(other, john(16));
    expect(theirs.existing).toBe(false);
    expect(theirs.favorite.id).not.toBe(mine.favorite.id);
  });

  it("is refused a second copy by the database itself", async () => {
    await save(me, john(16));
    const [row] = await db.select().from(bibleFavorites);
    await expect(db.insert(bibleFavorites).values({ ...row, id: nowhere })).rejects.toThrow();
  });

  it("saves one favorite when the same request arrives twice at once", async () => {
    const results = await Promise.all([save(me, john(16)), save(me, john(16)), save(me, john(16))]);
    expect(results.filter((result) => !result.existing)).toHaveLength(1);
    expect(new Set(results.map((result) => result.favorite.id)).size).toBe(1);
    expect(await countFavorites(db, me)).toBe(1);
  });

  it("makes nothing of no verses", async () => {
    expect(
      await createFavorite(db, me, { translation: "kjv", verses: [], label: null, notes: null }),
    ).toBeNull();
    expect(await countFavorites(db, me)).toBe(0);
  });
});

describe("the database's own rules", () => {
  it("refuses a verse row for a favorite of another owner", async () => {
    const { favorite } = await save(me, john(16));
    await expect(
      db
        .insert(bibleFavoriteVerses)
        .values({ favoriteId: favorite.id, ownerId: other, position: 9, ...v(43, 3, 1) }),
    ).rejects.toThrow();
  });

  it("refuses the same verse twice in one favorite, and an orphan", async () => {
    const { favorite } = await save(me, john(16));
    await expect(
      db
        .insert(bibleFavoriteVerses)
        .values({ favoriteId: favorite.id, ownerId: me, position: 5, ...v(43, 3, 16) }),
    ).rejects.toThrow();
    await expect(
      db
        .insert(bibleFavoriteVerses)
        .values({ favoriteId: nowhere, ownerId: me, position: 0, ...v(43, 3, 16) }),
    ).rejects.toThrow();
  });

  it("refuses notes and labels that are too long, and an unknown translation or color", async () => {
    const { favorite } = await save(me, john(16));
    const set = (values: Record<string, unknown>) =>
      db.update(bibleFavorites).set(values).where(eq(bibleFavorites.id, favorite.id));
    await expect(set({ notes: "n".repeat(2001) })).rejects.toThrow();
    await expect(set({ label: "l".repeat(121) })).rejects.toThrow();
    await expect(set({ label: "   " })).rejects.toThrow();
    await expect(set({ translation: "rvg" })).rejects.toThrow();
    await set({ notes: "n".repeat(2000), label: "l".repeat(120) });
    await expect(
      db
        .insert(bibleHighlights)
        .values({ ownerId: me, translation: "kjv", ...v(43, 3, 16), color: "pink" as never }),
    ).rejects.toThrow();
  });
});

describe("changing a favorite", () => {
  it("changes the label alone, and the notes alone", async () => {
    const { favorite } = await save(me, john(16), { label: "Old", notes: "Kept." });
    const relabelled = await updateFavorite(db, me, favorite.id, { label: "New" });
    expect(relabelled).toMatchObject({
      ok: true,
      favorite: { label: "New", notes: "Kept.", verses: john(16) },
    });
    const renoted = await updateFavorite(db, me, favorite.id, { notes: "Changed." });
    expect(renoted).toMatchObject({ ok: true, favorite: { label: "New", notes: "Changed." } });
  });

  it("clears a label or notes with null", async () => {
    const { favorite } = await save(me, john(16), { label: "Old", notes: "Old." });
    const cleared = await updateFavorite(db, me, favorite.id, { label: null, notes: null });
    expect(cleared).toMatchObject({ ok: true, favorite: { label: null, notes: null } });
  });

  it("replaces the verses and everything that follows from them", async () => {
    const { favorite } = await save(me, john(16), { label: "Kept" });
    const changed = await updateFavorite(db, me, favorite.id, { verses: romans });
    expect(changed).toMatchObject({
      ok: true,
      favorite: {
        id: favorite.id,
        reference: "Romans 3:10, 23; 6:23",
        label: "Kept",
        verses: romans,
      },
    });
    const rows = await db.select().from(bibleFavoriteVerses);
    expect(rows).toHaveLength(3);
    expect(await references({ sort: "bible" })).toEqual(["Romans 3:10, 23; 6:23"]);
    // The old verses are free to be saved again.
    expect((await save(me, john(16))).existing).toBe(false);
  });

  it("moves the date it was updated, not the date it was saved", async () => {
    const { favorite } = await save(me, john(16));
    await new Promise((resolve) => setTimeout(resolve, 5));
    const changed = await updateFavorite(db, me, favorite.id, { notes: "Later." });
    if (!changed.ok) throw new Error("not changed");
    expect(changed.favorite.createdAt).toEqual(favorite.createdAt);
    expect(changed.favorite.updatedAt.getTime()).toBeGreaterThan(favorite.updatedAt.getTime());
  });

  it("reports a clash with another favorite and changes neither", async () => {
    const first = await save(me, john(16), { label: "First" });
    const second = await save(me, john(17), { label: "Second" });
    const result = await updateFavorite(db, me, second.favorite.id, {
      verses: john(16),
      label: "Taken",
    });
    expect(result).toEqual({ ok: false, reason: "conflict", conflictId: first.favorite.id });
    expect(await getFavorite(db, me, first.favorite.id)).toMatchObject({
      label: "First",
      verses: john(16),
    });
    expect(await getFavorite(db, me, second.favorite.id)).toMatchObject({
      label: "Second",
      verses: john(17),
    });
  });

  it("accepts its own verses back", async () => {
    const { favorite } = await save(me, john(16, 17));
    const result = await updateFavorite(db, me, favorite.id, {
      verses: john(17, 16),
      label: "Same",
    });
    expect(result).toMatchObject({ ok: true, favorite: { label: "Same", verses: john(16, 17) } });
  });

  it("is not stopped by another account holding the same verses", async () => {
    await save(other, john(16));
    const { favorite } = await save(me, john(17));
    expect((await updateFavorite(db, me, favorite.id, { verses: john(16) })).ok).toBe(true);
  });

  it("cannot reach a favorite that is missing or someone else's", async () => {
    const theirs = await save(other, john(16), { label: "Theirs" });
    for (const id of [theirs.favorite.id, nowhere]) {
      expect(await updateFavorite(db, me, id, { label: "Mine now", verses: romans })).toEqual({
        ok: false,
        reason: "missing",
      });
    }
    expect(await getFavorite(db, other, theirs.favorite.id)).toMatchObject({
      label: "Theirs",
      verses: john(16),
    });
  });
});

describe("reading and deleting", () => {
  it("cannot read a favorite that is someone else's", async () => {
    const theirs = await save(other, john(16));
    expect(await getFavorite(db, me, theirs.favorite.id)).toBeNull();
    expect(await getFavorite(db, me, nowhere)).toBeNull();
    expect(await favoritesInChapter(db, me, "kjv", 43, 3)).toEqual([]);
    expect((await find()).total).toBe(0);
  });

  it("deletes a favorite and its verse rows", async () => {
    const { favorite } = await save(me, john(16, 17));
    expect(await deleteFavorite(db, me, favorite.id)).toBe(true);
    expect(await getFavorite(db, me, favorite.id)).toBeNull();
    expect(await db.select().from(bibleFavoriteVerses)).toEqual([]);
    expect(await deleteFavorite(db, me, favorite.id)).toBe(false);
  });

  it("cannot delete a favorite that is someone else's", async () => {
    const theirs = await save(other, john(16));
    expect(await deleteFavorite(db, me, theirs.favorite.id)).toBe(false);
    expect(await getFavorite(db, other, theirs.favorite.id)).not.toBeNull();
  });

  it("leaves highlights, other favorites, and ideas where they are", async () => {
    const doomed = await save(me, john(16));
    const kept = await save(me, john(16, 17));
    await setHighlights(db, me, "kjv", john(16), "yellow");
    await db.insert(ideas).values({ ownerId: me, title: "An idea" });

    await deleteFavorite(db, me, doomed.favorite.id);

    expect(await highlightsInChapter(db, me, "kjv", 43, 3)).toEqual({ 16: "yellow" });
    expect(await getFavorite(db, me, kept.favorite.id)).not.toBeNull();
    expect(await db.select().from(ideas)).toHaveLength(1);
  });
});

describe("highlights", () => {
  it.each(highlightColors)("applies %s", async (color) => {
    await setHighlights(db, me, "kjv", john(16), color);
    expect(await highlightsInChapter(db, me, "kjv", 43, 3)).toEqual({ 16: color });
  });

  it("replaces a color: a verse holds one", async () => {
    await setHighlights(db, me, "kjv", john(16), "yellow");
    await setHighlights(db, me, "kjv", john(16), "blue");
    expect(await highlightsInChapter(db, me, "kjv", 43, 3)).toEqual({ 16: "blue" });
    expect(await db.select().from(bibleHighlights)).toHaveLength(1);
  });

  it("colors every verse asked for, and no other", async () => {
    await setHighlights(db, me, "kjv", john(16, 17, 18), "green");
    expect(await highlightsInChapter(db, me, "kjv", 43, 3)).toEqual({
      16: "green",
      17: "green",
      18: "green",
    });
  });

  it("brings a mixed selection to one color", async () => {
    await setHighlights(db, me, "kjv", john(16), "yellow");
    await setHighlights(db, me, "kjv", john(17), "red");
    await setHighlights(db, me, "kjv", john(16, 17, 18), "green");
    expect(await highlightsInChapter(db, me, "kjv", 43, 3)).toEqual({
      16: "green",
      17: "green",
      18: "green",
    });
  });

  it("removes a highlight from the verses asked for only", async () => {
    await setHighlights(db, me, "kjv", john(16, 17, 18), "green");
    await setHighlights(db, me, "kjv", [v(43, 4, 16)], "green");
    await clearHighlights(db, me, "kjv", john(16, 18, 20));
    expect(await highlightsInChapter(db, me, "kjv", 43, 3)).toEqual({ 17: "green" });
    // The same verse number in another chapter is another verse.
    expect(await highlightsInChapter(db, me, "kjv", 43, 4)).toEqual({ 16: "green" });
  });

  it("works across chapters in one call", async () => {
    await setHighlights(db, me, "kjv", romans, "red");
    expect(await highlightsInChapter(db, me, "kjv", 45, 3)).toEqual({ 10: "red", 23: "red" });
    expect(await highlightsInChapter(db, me, "kjv", 45, 6)).toEqual({ 23: "red" });
    await clearHighlights(db, me, "kjv", romans);
    expect(await db.select().from(bibleHighlights)).toEqual([]);
  });

  it("is each account's own", async () => {
    await setHighlights(db, me, "kjv", john(16), "yellow");
    await setHighlights(db, other, "kjv", john(16), "blue");
    expect(await highlightsInChapter(db, me, "kjv", 43, 3)).toEqual({ 16: "yellow" });
    expect(await highlightsInChapter(db, other, "kjv", 43, 3)).toEqual({ 16: "blue" });
    await clearHighlights(db, me, "kjv", john(16));
    expect(await highlightsInChapter(db, other, "kjv", 43, 3)).toEqual({ 16: "blue" });
  });

  it("knows nothing of favorites, nor they of it", async () => {
    await setHighlights(db, me, "kjv", john(16), "yellow");
    expect(await countFavorites(db, me)).toBe(0);
    const { favorite } = await save(me, john(16));
    await clearHighlights(db, me, "kjv", john(16));
    expect(await getFavorite(db, me, favorite.id)).not.toBeNull();
    // A favorite of a verse does not color it.
    expect(await highlightsInChapter(db, me, "kjv", 43, 3)).toEqual({});
  });

  it("does nothing with no verses", async () => {
    await setHighlights(db, me, "kjv", [], "yellow");
    await clearHighlights(db, me, "kjv", []);
    expect(await db.select().from(bibleHighlights)).toEqual([]);
  });
});

describe("a chapter's marks", () => {
  it("are its highlights and the favorites that touch it, with all their verses", async () => {
    await setHighlights(db, me, "kjv", [romans[0]], "yellow");
    await setHighlights(db, me, "kjv", [romans[2]], "red");
    const { favorite } = await save(me, romans, { label: "The Romans road" });
    await save(me, john(16));
    await save(other, [romans[0]]);

    const marks = await getChapterMarks(db, me, "kjv", 45, 3);
    expect(marks.highlights).toEqual({ 10: "yellow" });
    expect(marks.favorites).toEqual([
      {
        id: favorite.id,
        translation: "kjv",
        reference: "Romans 3:10, 23; 6:23",
        label: "The Romans road",
        notes: null,
        verses: romans,
      },
    ]);
    expect((await getChapterMarks(db, me, "kjv", 45, 6)).highlights).toEqual({ 23: "red" });
    expect(await getChapterMarks(db, me, "kjv", 1, 1)).toEqual({ highlights: {}, favorites: [] });
  });
});

describe("the library's saved passages", () => {
  beforeEach(async () => {
    await save(me, [v(45, 8, 28)], { label: "All things", notes: "For those who love God." });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await save(me, john(16, 17), { label: "The gospel", notes: "100% grace_not works" });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await save(me, [v(1, 1, 1)], { notes: "In the beginning." });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await save(me, [v(43, 1, 1), v(1, 1, 3)]);
    await save(other, john(16), { label: "Not mine" });
  });

  it("lists the owner's passages only, most recently saved first", async () => {
    const page = await find();
    expect(page).toMatchObject({ total: 4, page: 1, totalPages: 1 });
    expect(page.items.map((item) => item.reference)).toEqual([
      "Genesis 1:3; John 1:1",
      "Genesis 1:1",
      "John 3:16–17",
      "Romans 8:28",
    ]);
    expect(page.items.every((item) => item.label !== "Not mine")).toBe(true);
  });

  it("orders by the Bible, and by what was last changed", async () => {
    expect(await references({ sort: "bible" })).toEqual([
      "Genesis 1:1",
      "Genesis 1:3; John 1:1",
      "John 3:16–17",
      "Romans 8:28",
    ]);
    const [romansRow] = (await find({ q: "Romans" })).items;
    await new Promise((resolve) => setTimeout(resolve, 5));
    await updateFavorite(db, me, romansRow.id, { notes: "Touched." });
    expect((await references({ sort: "updated-desc" }))[0]).toBe("Romans 8:28");
    // Saved order is unmoved by an edit.
    expect((await references())[3]).toBe("Romans 8:28");
  });

  it("falls back to the default order for a sort it does not know", async () => {
    expect(await references({ sort: "nonsense" as never })).toEqual(await references());
  });

  it("searches the reference, the label, and the notes", async () => {
    expect(await references({ q: "romans" })).toEqual(["Romans 8:28"]);
    expect(await references({ q: "3:16" })).toEqual(["John 3:16–17"]);
    expect(await references({ q: "GOSPEL" })).toEqual(["John 3:16–17"]);
    expect(await references({ q: "beginning" })).toEqual(["Genesis 1:1"]);
    expect(await references({ q: "nothing-like-this" })).toEqual([]);
  });

  it("needs every word, each wherever it is found", async () => {
    expect(await references({ q: "john gospel grace" })).toEqual(["John 3:16–17"]);
    expect(await references({ q: "john beginning" })).toEqual([]);
  });

  it("takes %, _ and \\ as themselves", async () => {
    expect(await references({ q: "100%" })).toEqual(["John 3:16–17"]);
    expect(await references({ q: "grace_not" })).toEqual(["John 3:16–17"]);
    expect(await references({ q: "%" })).toEqual(["John 3:16–17"]);
    expect(await references({ q: "_" })).toEqual(["John 3:16–17"]);
    expect(await references({ q: "\\" })).toEqual([]);
  });

  it("filters by book, on any verse of the passage", async () => {
    expect(await references({ book: 43, sort: "bible" })).toEqual([
      "Genesis 1:3; John 1:1",
      "John 3:16–17",
    ]);
    expect(await references({ book: 1, sort: "bible" })).toEqual([
      "Genesis 1:1",
      "Genesis 1:3; John 1:1",
    ]);
    expect(await references({ book: 66 })).toEqual([]);
  });

  it("filters by highlight color, read from the highlights themselves", async () => {
    await setHighlights(db, me, "kjv", john(17), "yellow");
    await setHighlights(db, me, "kjv", [v(1, 1, 1)], "blue");
    // Someone else's highlight on my verse is not mine.
    await setHighlights(db, other, "kjv", [v(45, 8, 28)], "yellow");

    expect(await references({ colors: ["yellow"] })).toEqual(["John 3:16–17"]);
    expect(await references({ colors: ["yellow", "blue"], sort: "bible" })).toEqual([
      "Genesis 1:1",
      "John 3:16–17",
    ]);
    expect(await references({ colors: ["red"] })).toEqual([]);

    const [gospel] = (await find({ q: "gospel" })).items;
    expect(gospel.colors).toEqual(["yellow"]);
    await setHighlights(db, me, "kjv", john(16), "red");
    expect((await find({ q: "gospel" })).items[0].colors).toEqual(["yellow", "red"]);

    // Taking the highlight off takes the passage out of the filter, and leaves the passage.
    await clearHighlights(db, me, "kjv", john(16, 17));
    expect(await references({ colors: ["yellow", "red"] })).toEqual([]);
    expect(await references({ q: "gospel" })).toEqual(["John 3:16–17"]);
  });

  it("holds every condition at once", async () => {
    await setHighlights(db, me, "kjv", john(16), "green");
    expect(await references({ q: "gospel", book: 43, colors: ["green"] })).toEqual([
      "John 3:16–17",
    ]);
    expect(await references({ q: "gospel", book: 45, colors: ["green"] })).toEqual([]);
  });

  it("pages, counts, and clamps a page past the end", async () => {
    const first = await find({ sort: "bible" }, me, 3);
    expect(first).toMatchObject({ total: 4, page: 1, pageSize: 3, totalPages: 2 });
    expect(first.items).toHaveLength(3);
    const last = await find({ sort: "bible", page: 99 }, me, 3);
    expect(last.page).toBe(2);
    expect(last.items.map((item) => item.reference)).toEqual(["Romans 8:28"]);
    expect((await find({ q: "nothing-like-this", page: 5 })).page).toBe(1);
  });

  it("shows the opening verses where the text is loaded, and lists the passage where it is not", async () => {
    expect((await find({ q: "gospel" })).items[0].preview).toEqual([]);
    await db.insert(bibleVerses).values([
      { ...v(43, 3, 16), text: "For God so loved the world" },
      { ...v(43, 3, 17), text: "For God sent not his Son" },
    ]);
    expect((await find({ q: "gospel" })).items[0].preview).toEqual([
      { ...v(43, 3, 16), text: "For God so loved the world" },
      { ...v(43, 3, 17), text: "For God sent not his Son" },
    ]);
  });
});
