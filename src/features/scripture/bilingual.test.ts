// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { bibleFavorites, bibleHighlights, scriptureVerses, users } from "@/db/schema";
import { createTestDatabase } from "@/db/testing";
import type { Database } from "@/db/types";
import type { Authorization } from "@/features/auth/access";
import { testPreferences } from "@/features/preferences/testing";

// The session is stood in for; the database is a real in-memory PostgreSQL. The
// preferences in force are `testPreferences` (see vitest.setup.ts), which a test
// sets to have Spanish switched off.
const state = vi.hoisted(() => ({
  access: { ok: false, message: "Your session has ended. Sign in again." } as unknown,
  db: undefined as unknown,
}));

vi.mock("next/cache", () => ({ cacheLife: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("@/db", () => ({ getDb: () => state.db }));
vi.mock("@/features/auth/access", () => ({
  authorize: async (): Promise<Authorization> => state.access as Authorization,
}));

import { GET as getChapterRoute } from "@/app/api/bible/[book]/[chapter]/route";
import { GET as getMarksRoute } from "@/app/api/bible/[book]/[chapter]/marks/route";
import { GET as searchRoute } from "@/app/api/bible/search/route";
import { readChapter } from "./passages";
import { deleteFavorite, saveFavorite, setHighlight, updateFavorite } from "./saved/actions";
import {
  countFavorites,
  createFavorite,
  getChapterMarks,
  getFavorite,
  searchFavorites,
} from "./saved/favorites";
import { highlightsInChapter, setHighlights } from "./saved/highlights";
import { defaultSavedQuery } from "./saved/saved-query";
import { buildSearchQuery } from "./search";
import { restoreHit, searchVerses } from "./search-verses";

let db: Database;
let me: string;
let other: string;

// Jude has one chapter of 25 verses, and 3 John one of 14: short enough to load whole.
const jude = (word: string) => Array.from({ length: 25 }, (_, index) => `${word} ${index + 1}`);
const john316 = [{ book: 43, chapter: 3, verse: 16 }];

const chapter = (book: string, number: string, search = "") =>
  getChapterRoute(new Request(`http://localhost/api/bible/${book}/${number}${search}`), {
    params: Promise.resolve({ book, chapter: number }),
  });
const marks = (book: string, number: string, search = "") =>
  getMarksRoute(new Request(`http://localhost/api/bible/${book}/${number}/marks${search}`), {
    params: Promise.resolve({ book, chapter: number }),
  });
const search = (params: Record<string, string>) =>
  searchRoute(new Request(`http://localhost/api/bible/search?${new URLSearchParams(params)}`));

function signInAs(id: string) {
  state.access = { ok: true, user: { id, role: "user", status: "active" } };
}

beforeEach(async () => {
  db = await createTestDatabase();
  state.db = db;
  const rows = await db
    .insert(users)
    .values([{ clerkUserId: "user_me" }, { clerkUserId: "user_other" }])
    .returning();
  [me, other] = rows.map((row) => row.id);
  await db.insert(scriptureVerses).values([
    ...jude("Verse").map((text, index) => ({
      translation: "kjv" as const,
      book: 65,
      chapter: 1,
      verse: index + 1,
      text,
    })),
    ...jude("Versículo").map((text, index) => ({
      translation: "rvg" as const,
      book: 65,
      chapter: 1,
      verse: index + 1,
      text,
    })),
    { translation: "kjv", book: 43, chapter: 3, verse: 16, text: "For God so loved the world" },
    {
      translation: "rvg",
      book: 43,
      chapter: 3,
      verse: 16,
      text: "Porque de tal manera amó Dios al mundo",
    },
    {
      translation: "rvg",
      book: 19,
      chapter: 23,
      verse: 1,
      text: "Jehová es mi pastor; nada me faltará.",
    },
    {
      translation: "rvg",
      book: 23,
      chapter: 40,
      verse: 11,
      text: "Como pastor apacentará su rebaño.",
    },
    {
      translation: "kjv",
      book: 19,
      chapter: 23,
      verse: 1,
      text: "The LORD is my shepherd; I shall not want.",
    },
  ]);
  signInAs(me);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("the text of each translation", () => {
  it("is read apart, under the same book, chapter, and verse", async () => {
    expect(await readChapter(db, "kjv", 65, 1)).toEqual(jude("Verse"));
    expect(await readChapter(db, "rvg", 65, 1)).toEqual(jude("Versículo"));
  });

  it("is an error, never a short chapter, when one translation is not loaded", async () => {
    // 3 John is in neither; John 3 has one verse of 36 in each.
    await expect(readChapter(db, "rvg", 64, 1)).rejects.toThrow(/unavailable/);
    await expect(readChapter(db, "rvg", 43, 3)).rejects.toThrow(/unavailable/);
  });

  it("is served in the translation the address names", async () => {
    const english = await chapter("65", "1", "?t=kjv");
    expect(english.status).toBe(200);
    expect(await english.json()).toMatchObject({ translation: "kjv", verses: jude("Verse") });

    const spanish = await chapter("65", "1", "?t=rvg");
    expect(spanish.status).toBe(200);
    expect(await spanish.json()).toMatchObject({ translation: "rvg", verses: jude("Versículo") });
  });

  it("is served in the account's own translation when the address names none", async () => {
    expect(await (await chapter("65", "1")).json()).toMatchObject({ translation: "kjv" });
    testPreferences.locale = "es";
    expect(await (await chapter("65", "1")).json()).toMatchObject({ translation: "rvg" });
    // A translation someone chose wins over the language of their interface.
    testPreferences.bibleTranslation = "kjv";
    expect(await (await chapter("65", "1")).json()).toMatchObject({ translation: "kjv" });
  });

  it("is not served to a caller who is not signed in, in either translation", async () => {
    state.access = { ok: false, message: "Your session has ended. Sign in again." };
    expect((await chapter("65", "1", "?t=kjv")).status).toBe(401);
    expect((await chapter("65", "1", "?t=rvg")).status).toBe(401);
  });

  it("refuses a translation that is not one", async () => {
    for (const name of ["rv1960", "RVG", "kjv%27--"]) {
      expect((await chapter("65", "1", `?t=${name}`)).status).toBe(404);
    }
  });

  it("lets the browser keep only the text that cannot be switched off", async () => {
    expect((await chapter("65", "1", "?t=rvg")).headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("with Spanish switched off", () => {
  beforeEach(() => {
    testPreferences.spanishEnabled = false;
    // An account that had chosen Spanish for everything.
    testPreferences.locale = "es";
    testPreferences.bibleTranslation = "rvg";
  });

  it("does not serve the Spanish text, by any route", async () => {
    const refused = await chapter("65", "1", "?t=rvg");
    expect(refused.status).toBe(404);
    expect(await refused.json()).toEqual({ message: "There is no such chapter." });
    expect(refused.headers.get("Cache-Control")).toBe("no-store");
    expect((await marks("65", "1", "?t=rvg")).status).toBe(404);
    expect((await search({ q: "pastor", t: "rvg" })).status).toBe(404);
  });

  it("serves the King James as before, to an account that had chosen Spanish", async () => {
    const response = await chapter("65", "1");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ translation: "kjv", verses: jude("Verse") });
    expect((await chapter("65", "1", "?t=kjv")).status).toBe(200);
    expect((await marks("65", "1")).status).toBe(200);
    const found = await search({ q: "shepherd" });
    expect(found.status).toBe(200);
    expect((await found.json()).total).toBe(1);
  });

  it("answers in English", async () => {
    expect(await (await search({ q: "" })).json()).toEqual({
      message: "Type a word or a phrase to search for.",
    });
  });

  it("refuses to save a favorite or a highlight in the Spanish text", async () => {
    const refused = { ok: false, message: "That translation is not available." };
    expect(await saveFavorite({ translation: "rvg", verses: john316 })).toEqual(refused);
    expect(await setHighlight({ translation: "rvg", verses: john316, color: "yellow" })).toEqual(
      refused,
    );
    expect(await db.select().from(bibleFavorites)).toHaveLength(0);
    expect(await db.select().from(bibleHighlights)).toHaveLength(0);
    // The King James is marked as ever.
    expect((await saveFavorite({ translation: "kjv", verses: john316 })).ok).toBe(true);
    expect((await setHighlight({ translation: "kjv", verses: john316, color: "blue" })).ok).toBe(
      true,
    );
  });

  it("keeps Spanish marks out of sight and out of reach, and deletes none of them", async () => {
    const saved = await createFavorite(db, me, {
      translation: "rvg",
      verses: john316,
      label: "Evangelio",
      notes: null,
    });
    await setHighlights(db, me, "rvg", john316, "yellow");
    const id = saved!.favorite.id;

    // Not listed, not counted, not told of beside the King James.
    const offered = ["kjv"] as const;
    expect((await searchFavorites(db, me, defaultSavedQuery, undefined, offered)).total).toBe(0);
    expect(await countFavorites(db, me, offered)).toBe(0);
    expect((await getChapterMarks(db, me, "kjv", 43, 3, offered)).elsewhere).toBeUndefined();
    expect(await (await marks("43", "3")).json()).toEqual({ highlights: {}, favorites: [] });

    // Not changed and not removed, by an action called directly.
    const missing = { ok: false, message: "That saved passage no longer exists." };
    expect(await updateFavorite(id, { label: "Changed" })).toEqual(missing);
    expect(await deleteFavorite(id)).toEqual(missing);

    // All of it is still there, exactly as it was.
    expect(await getFavorite(db, me, id)).toMatchObject({ label: "Evangelio", translation: "rvg" });
    expect(await highlightsInChapter(db, me, "rvg", 43, 3)).toEqual({ 16: "yellow" });

    // And is back when Spanish is.
    testPreferences.spanishEnabled = true;
    expect((await searchFavorites(db, me, defaultSavedQuery)).total).toBe(1);
    expect(await (await marks("43", "3", "?t=rvg")).json()).toMatchObject({
      highlights: { 16: "yellow" },
    });
    expect((await updateFavorite(id, { label: "Changed" })).ok).toBe(true);
  });
});

describe("marks in two translations", () => {
  it("are kept apart: a highlight in one is not a highlight in the other", async () => {
    await setHighlights(db, me, "kjv", john316, "yellow");
    await setHighlights(db, me, "rvg", john316, "blue");
    expect(await highlightsInChapter(db, me, "kjv", 43, 3)).toEqual({ 16: "yellow" });
    expect(await highlightsInChapter(db, me, "rvg", 43, 3)).toEqual({ 16: "blue" });
    // Still one color to a verse, in each.
    await setHighlights(db, me, "rvg", john316, "red");
    expect(await highlightsInChapter(db, me, "rvg", 43, 3)).toEqual({ 16: "red" });
    expect(await highlightsInChapter(db, me, "kjv", 43, 3)).toEqual({ 16: "yellow" });
    expect(await db.select().from(bibleHighlights)).toHaveLength(2);
  });

  it("let the same passage be a favorite in each, once in each", async () => {
    const english = await createFavorite(db, me, {
      translation: "kjv",
      verses: john316,
      label: null,
      notes: null,
    });
    const spanish = await createFavorite(db, me, {
      translation: "rvg",
      verses: john316,
      label: null,
      notes: null,
    });
    const again = await createFavorite(db, me, {
      translation: "rvg",
      verses: john316,
      label: null,
      notes: null,
    });
    expect(english!.existing).toBe(false);
    expect(spanish!.existing).toBe(false);
    expect(again).toMatchObject({ existing: true });
    expect(again!.favorite.id).toBe(spanish!.favorite.id);
    expect(spanish!.favorite.id).not.toBe(english!.favorite.id);
    // Each is written as its translation names the book.
    expect(english!.favorite.reference).toBe("John 3:16");
    expect(spanish!.favorite.reference).toBe("Juan 3:16");
  });

  it("say, beside one translation, what was marked in the other", async () => {
    await setHighlights(db, me, "kjv", [...john316, { book: 43, chapter: 3, verse: 17 }], "green");
    await createFavorite(db, me, { translation: "kjv", verses: john316, label: null, notes: null });
    // Someone else's marks are nobody else's business.
    await setHighlights(db, other, "kjv", john316, "red");

    const spanish = await getChapterMarks(db, me, "rvg", 43, 3, ["kjv", "rvg"]);
    expect(spanish).toEqual({
      highlights: {},
      favorites: [],
      elsewhere: [{ translation: "kjv", highlights: 2, favorites: 1 }],
    });
    // Nothing is carried across: the King James has them and says nothing of an empty Spanish.
    const english = await getChapterMarks(db, me, "kjv", 43, 3, ["kjv", "rvg"]);
    expect(Object.keys(english.highlights)).toEqual(["16", "17"]);
    expect(english.favorites).toHaveLength(1);
    expect(english.elsewhere).toBeUndefined();
    // Another chapter has nothing to tell of.
    expect((await getChapterMarks(db, me, "rvg", 43, 4, ["kjv", "rvg"])).elsewhere).toBeUndefined();
    expect(await (await marks("43", "3", "?t=rvg")).json()).toMatchObject({
      elsewhere: [{ translation: "kjv", highlights: 2, favorites: 1 }],
    });
  });

  it("are listed together, told apart, filtered by translation, and quoted from their own text", async () => {
    await createFavorite(db, me, { translation: "kjv", verses: john316, label: null, notes: null });
    await createFavorite(db, me, { translation: "rvg", verses: john316, label: null, notes: null });

    const all = await searchFavorites(db, me, defaultSavedQuery);
    expect(all.total).toBe(2);
    const quoted = Object.fromEntries(
      all.items.map((item) => [item.translation, item.preview[0]?.text]),
    );
    expect(quoted).toEqual({
      kjv: "For God so loved the world",
      rvg: "Porque de tal manera amó Dios al mundo",
    });

    const spanish = await searchFavorites(db, me, { ...defaultSavedQuery, translation: "rvg" });
    expect(spanish.items.map((item) => item.reference)).toEqual(["Juan 3:16"]);
    // Found by its Spanish name, as its reader would look for it.
    expect((await searchFavorites(db, me, { ...defaultSavedQuery, q: "juan" })).total).toBe(1);
  });

  it("keep a King James favorite and highlight exactly as they were before there were two", async () => {
    const before = await createFavorite(db, me, {
      translation: "kjv",
      verses: john316,
      label: "Gospel",
      notes: "Kept.",
    });
    await setHighlights(db, me, "kjv", john316, "yellow");
    // Everything a Spanish reader then does leaves them alone.
    await createFavorite(db, me, { translation: "rvg", verses: john316, label: null, notes: null });
    await setHighlights(db, me, "rvg", john316, "red");
    expect(await getFavorite(db, me, before!.favorite.id)).toMatchObject({
      translation: "kjv",
      reference: "John 3:16",
      label: "Gospel",
      notes: "Kept.",
      verses: john316,
    });
    expect(await highlightsInChapter(db, me, "kjv", 43, 3)).toEqual({ 16: "yellow" });
  });
});

describe("searching each translation", () => {
  const query = (input: string) => {
    const built = buildSearchQuery(input);
    if (!built.ok) throw new Error(built.message);
    return built.tsquery;
  };
  const found = async (translation: "kjv" | "rvg", input: string) =>
    (await searchVerses(db, translation, query(input), "all")).hits;

  it("finds words in the translation asked for and no other", async () => {
    expect((await found("rvg", "pastor")).map((hit) => `${hit.book}.${hit.chapter}`)).toEqual([
      "19.23",
      "23.40",
    ]);
    expect(await found("kjv", "pastor")).toEqual([]);
    expect((await found("kjv", "shepherd")).map((hit) => hit.book)).toEqual([19]);
    expect(await found("rvg", "shepherd")).toEqual([]);
  });

  it("finds accented words typed without their accents, and shows them as they are written", async () => {
    const [plain] = await found("rvg", "jehova");
    const [accented] = await found("rvg", "Jehová");
    expect(plain.text).toBe("[[Jehová]] es mi pastor; nada me faltará.");
    expect(accented).toEqual(plain);
    expect((await found("rvg", "faltara"))[0].text).toContain("[[faltará]]");
    // ñ is its own letter.
    expect(await found("rvg", "rebano")).toEqual([]);
    expect(await found("rvg", "rebaño")).toHaveLength(1);
  });

  it("serves a search of the Spanish text through the route", async () => {
    const response = await search({ q: "amo dios", t: "rvg" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      total: 1,
      hits: [
        { book: 43, chapter: 3, verse: 16, text: "Porque de tal manera [[amó]] [[Dios]] al mundo" },
      ],
    });
  });

  it("puts the marks back on the text as written, or leaves it unmarked", () => {
    expect(restoreHit("Jehová es mi pastor", "[[Jehova]] es mi pastor")).toBe(
      "[[Jehová]] es mi pastor",
    );
    expect(restoreHit("Él amó", "El [[amo]]")).toBe("Él [[amó]]");
    // Out of step: the verse is shown without marks, never mangled.
    expect(restoreHit("Jehová", "[[Jehova]] y más")).toBe("Jehová");
  });
});
