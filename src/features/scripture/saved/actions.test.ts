// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { bibleFavorites, bibleHighlights, users } from "@/db/schema";
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

import { GET as getMarks } from "@/app/api/bible/[book]/[chapter]/marks/route";
import { deleteFavorite, saveFavorite, setHighlight, updateFavorite } from "./actions";
import { getFavorite } from "./favorites";
import { highlightsInChapter } from "./highlights";

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
const missing = { ok: false, message: "That saved passage no longer exists." };
const john = (...verses: number[]) => verses.map((verse) => ({ book: 43, chapter: 3, verse }));
const passage = (verses = john(16), extra: object = {}) => ({
  translation: "kjv",
  verses,
  ...extra,
});
const marks = async (book: string, chapter: string) =>
  getMarks(new Request("http://localhost/"), { params: Promise.resolve({ book, chapter }) });

describe("saved Scripture actions", () => {
  it("reject a signed-out, disabled, or uninvited caller before touching the database", async () => {
    for (const message of [
      "Your session has ended. Sign in again.",
      "Your account does not have access.",
    ]) {
      state.access = { ok: false, message };
      const refused = { ok: false, message };
      expect(await saveFavorite(passage())).toEqual(refused);
      expect(await updateFavorite(nowhere, { label: "x" })).toEqual(refused);
      expect(await deleteFavorite(nowhere)).toEqual(refused);
      expect(await setHighlight(passage(john(16), { color: "yellow" }))).toEqual(refused);
      const response = await marks("43", "3");
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ message });
    }
    expect(await db.select().from(bibleFavorites)).toEqual([]);
    expect(await db.select().from(bibleHighlights)).toEqual([]);
  });

  it("save a favorite for the signed-in account, whatever the input claims", async () => {
    signInAs(me);
    const result = await saveFavorite({
      ...passage(john(17, 16), { label: "  The   gospel ", notes: "  For Easter.  " }),
      ownerId: other,
      id: nowhere,
    });
    expect(result).toMatchObject({
      ok: true,
      message: "Saved John 3:16–17.",
      favorite: {
        reference: "John 3:16–17",
        label: "The gospel",
        notes: "For Easter.",
        verses: john(16, 17),
      },
    });
    expect(result.favorite!.id).not.toBe(nowhere);
    const [row] = await db.select().from(bibleFavorites);
    expect(row.ownerId).toBe(me);
  });

  it("answer a repeated save with the favorite there was", async () => {
    signInAs(me);
    const first = await saveFavorite(passage(john(16), { label: "First" }));
    const again = await saveFavorite(passage(john(16), { label: "Second" }));
    expect(again).toMatchObject({
      ok: true,
      existing: true,
      message: "John 3:16 is already saved.",
      favorite: { id: first.favorite!.id, label: "First" },
    });
    expect(await db.select().from(bibleFavorites)).toHaveLength(1);
  });

  it.each([
    ["no verses", passage([])],
    ["a verse that does not exist", passage([{ book: 43, chapter: 3, verse: 37 }])],
    ["a chapter that does not exist", passage([{ book: 43, chapter: 22, verse: 1 }])],
    ["a book that does not exist", passage([{ book: 67, chapter: 1, verse: 1 }])],
    ["a psalm title as verse 0", passage([{ book: 19, chapter: 3, verse: 0 }])],
    ["a fraction of a verse", passage([{ book: 43, chapter: 3, verse: 1.5 }])],
    ["a string for a number", passage([{ book: "43", chapter: 3, verse: 16 }] as never)],
    ["an unknown translation", { ...passage(), translation: "nvi" }],
    ["no translation", { verses: john(16) }],
    ["notes that are too long", passage(john(16), { notes: "n".repeat(2001) })],
    ["a label that is too long", passage(john(16), { label: "l".repeat(121) })],
    ["nothing", null],
  ])("refuse %s", async (_name, input) => {
    signInAs(me);
    expect((await saveFavorite(input)).ok).toBe(false);
    expect(await db.select().from(bibleFavorites)).toEqual([]);
  });

  it("accept notes of exactly the limit, and store an empty label or notes as none", async () => {
    signInAs(me);
    expect((await saveFavorite(passage(john(16), { notes: "n".repeat(2000) }))).ok).toBe(true);
    const blank = await saveFavorite(passage(john(17), { label: "   ", notes: "" }));
    expect(blank.favorite).toMatchObject({ label: null, notes: null });
  });

  it("refuse more verses than one favorite may hold", async () => {
    signInAs(me);
    // Psalm 119 has 176 verses and fits; with Psalm 118 it does not.
    const psalm = (chapter: number, count: number) =>
      Array.from({ length: count }, (_, index) => ({ book: 19, chapter, verse: index + 1 }));
    expect((await saveFavorite(passage(psalm(119, 176)))).ok).toBe(true);
    const tooMany = await saveFavorite(passage([...psalm(119, 176), ...psalm(118, 29)]));
    expect(tooMany).toEqual({ ok: false, message: "Choose 200 verses or fewer at a time." });
  });

  it("change a label, notes, and verses", async () => {
    signInAs(me);
    const { favorite } = await saveFavorite(passage(john(16)));
    expect(await updateFavorite(favorite!.id, { label: "Named", notes: "Noted." })).toMatchObject({
      ok: true,
      message: "Changes saved.",
      favorite: { label: "Named", notes: "Noted.", verses: john(16) },
    });
    expect(await updateFavorite(favorite!.id, { verses: john(16, 17) })).toMatchObject({
      ok: true,
      favorite: { reference: "John 3:16–17", label: "Named", notes: "Noted." },
    });
  });

  it("refuse an invalid change and leave the favorite as it was", async () => {
    signInAs(me);
    const { favorite } = await saveFavorite(passage(john(16), { notes: "Kept." }));
    expect((await updateFavorite(favorite!.id, { notes: "n".repeat(2001) })).ok).toBe(false);
    expect((await updateFavorite(favorite!.id, { verses: [] })).ok).toBe(false);
    expect(
      (await updateFavorite(favorite!.id, { verses: [{ book: 43, chapter: 3, verse: 99 }] })).ok,
    ).toBe(false);
    expect(await updateFavorite("not-an-id", { label: "x" })).toEqual(invalid);
    expect(await getFavorite(db, me, favorite!.id)).toMatchObject({
      notes: "Kept.",
      verses: john(16),
    });
  });

  it("report a clash with another favorite, naming it, and change neither", async () => {
    signInAs(me);
    const first = await saveFavorite(passage(john(16)));
    const second = await saveFavorite(passage(john(17)));
    expect(await updateFavorite(second.favorite!.id, { verses: john(16) })).toEqual({
      ok: false,
      message: "You have already saved that passage. Neither one was changed.",
      conflictId: first.favorite!.id,
    });
    expect(await getFavorite(db, me, second.favorite!.id)).toMatchObject({ verses: john(17) });
  });

  it("cannot change or delete another account's favorite, even with its real ID", async () => {
    signInAs(other);
    const theirs = (await saveFavorite(passage(john(16), { label: "Theirs" }))).favorite!;

    signInAs(me);
    expect(await updateFavorite(theirs.id, { label: "Mine now", verses: john(1) })).toEqual(
      missing,
    );
    expect(await deleteFavorite(theirs.id)).toEqual(missing);
    // A favorite that never existed gets the very same answer.
    expect(await updateFavorite(nowhere, { label: "x" })).toEqual(missing);
    expect(await deleteFavorite(nowhere)).toEqual(missing);
    expect(await deleteFavorite("1; drop table users")).toEqual(invalid);

    expect(await getFavorite(db, other, theirs.id)).toMatchObject({
      label: "Theirs",
      verses: john(16),
    });
  });

  it("delete a favorite and leave its verses' highlights", async () => {
    signInAs(me);
    const { favorite } = await saveFavorite(passage(john(16)));
    await setHighlight(passage(john(16), { color: "yellow" }));
    expect(await deleteFavorite(favorite!.id)).toEqual({
      ok: true,
      message: "Removed from your saved Scripture.",
    });
    expect(await getFavorite(db, me, favorite!.id)).toBeNull();
    expect(await highlightsInChapter(db, me, "kjv", 43, 3)).toEqual({ 16: "yellow" });
  });

  it("highlight, recolor, and clear for the signed-in account only", async () => {
    signInAs(other);
    await setHighlight(passage(john(16), { color: "blue" }));

    signInAs(me);
    expect(
      await setHighlight({ ...passage(john(16, 17), { color: "yellow" }), ownerId: other }),
    ).toEqual({
      ok: true,
      message: "Highlighted yellow.",
    });
    expect(await setHighlight(passage(john(17), { color: "red" }))).toMatchObject({ ok: true });
    expect(await highlightsInChapter(db, me, "kjv", 43, 3)).toEqual({ 16: "yellow", 17: "red" });
    expect(await setHighlight(passage(john(16, 17), { color: null }))).toEqual({
      ok: true,
      message: "Highlight removed.",
    });
    expect(await highlightsInChapter(db, me, "kjv", 43, 3)).toEqual({});
    // The other account's highlight on the same verse was never theirs to touch.
    expect(await highlightsInChapter(db, other, "kjv", 43, 3)).toEqual({ 16: "blue" });
  });

  it.each([
    ["a color that is not offered", passage(john(16), { color: "pink" })],
    ["no color at all", passage(john(16))],
    ["no verses", passage([], { color: "yellow" })],
    [
      "a verse that does not exist",
      passage([{ book: 43, chapter: 3, verse: 37 }], { color: "yellow" }),
    ],
    ["an unknown translation", { translation: "nvi", verses: john(16), color: "yellow" }],
  ])("refuse to highlight with %s", async (_name, input) => {
    signInAs(me);
    expect((await setHighlight(input)).ok).toBe(false);
    expect(await db.select().from(bibleHighlights)).toEqual([]);
  });

  it("report a failed write without saying why", async () => {
    signInAs(me);
    state.db = {
      transaction: async () => {
        throw new Error("connect ECONNREFUSED postgres://user:secret@host/db");
      },
      insert: () => {
        throw new Error("postgres://user:secret@host/db");
      },
    };
    expect(await saveFavorite(passage())).toEqual({
      ok: false,
      message: "The passage could not be saved. Try again.",
    });
    expect(await setHighlight(passage(john(16), { color: "yellow" }))).toEqual({
      ok: false,
      message: "The highlight could not be saved. Try again.",
    });
  });
});

describe("the chapter marks endpoint", () => {
  it("answers with the account's own marks, uncached", async () => {
    signInAs(other);
    await saveFavorite(passage(john(1)));
    await setHighlight(passage(john(1), { color: "blue" }));
    signInAs(me);
    const { favorite } = await saveFavorite(passage(john(16, 17), { label: "The gospel" }));
    await setHighlight(passage(john(16), { color: "yellow" }));

    const response = await marks("43", "3");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({
      highlights: { 16: "yellow" },
      favorites: [
        {
          id: favorite!.id,
          translation: "kjv",
          reference: "John 3:16–17",
          label: "The gospel",
          notes: null,
          verses: john(16, 17),
        },
      ],
    });
  });

  it.each([
    ["0", "1"],
    ["67", "1"],
    ["43", "22"],
    ["43", "x"],
    ["1e1", "1"],
  ])("has nothing for book %s chapter %s", async (book, chapter) => {
    signInAs(me);
    expect((await marks(book, chapter)).status).toBe(404);
  });

  it("says so when the marks cannot be read", async () => {
    signInAs(me);
    state.db = {
      select: () => {
        throw new Error("postgres://user:secret@host/db");
      },
    };
    const response = await marks("43", "3");
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ message: "Your highlights could not be loaded." });
  });
});
