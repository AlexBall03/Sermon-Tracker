// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { biblePsalmTitles, bibleVerses } from "@/db/schema";
import { createTestDatabase } from "@/db/testing";
import type { Database } from "@/db/types";
import type { Authorization } from "@/features/auth/access";

// The access helper is mocked; the chapter is read from a real in-memory PostgreSQL.
const state = vi.hoisted(() => ({
  access: { ok: false, message: "Your session has ended. Sign in again." } as unknown,
  db: undefined as unknown,
}));

vi.mock("next/cache", () => ({ cacheLife: vi.fn() }));
vi.mock("@/db", () => ({ getDb: () => state.db }));
vi.mock("@/features/auth/access", () => ({
  authorize: async (): Promise<Authorization> => state.access as Authorization,
}));

import { GET } from "@/app/api/bible/[book]/[chapter]/route";
import { getChapterTitle, readChapter, readPsalmTitles } from "./passages";

let db: Database;
const jude = Array.from({ length: 25 }, (_, index) => `Jude verse ${index + 1}.`);

const request = (book: string, chapter: string) =>
  GET(new Request("http://localhost/api/bible"), { params: Promise.resolve({ book, chapter }) });

beforeEach(async () => {
  db = await createTestDatabase();
  state.db = db;
  // The test database has the tables but not the text; Jude is one short chapter.
  await db
    .insert(bibleVerses)
    .values(jude.map((text, index) => ({ book: 65, chapter: 1, verse: index + 1, text })));
  state.access = { ok: true, user: { id: "1", role: "user", status: "active" } };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("readChapter", () => {
  it("returns a chapter's verses in order", async () => {
    expect(await readChapter(db, 65, 1)).toEqual(jude);
  });

  it("fails rather than return a missing or partial chapter", async () => {
    await expect(readChapter(db, 43, 3)).rejects.toThrow(/unavailable/);
    await db.insert(bibleVerses).values({ book: 64, chapter: 1, verse: 1, text: "Only one." });
    await expect(readChapter(db, 64, 1)).rejects.toThrow(/unavailable/);
  });
});

describe("psalm titles", () => {
  it("fail rather than report that no psalm has a title", async () => {
    await expect(readPsalmTitles(db)).rejects.toThrow(/unavailable/);
  });

  it("are read by psalm number", async () => {
    await db.insert(biblePsalmTitles).values({ psalm: 23, text: "A Psalm of David." });
    expect(await readPsalmTitles(db)).toEqual({ 23: "A Psalm of David." });
    expect(await getChapterTitle(19, 23)).toBe("A Psalm of David.");
    expect(await getChapterTitle(19, 1)).toBeNull();
  });

  it("belong to no other book, which is not even asked about", async () => {
    state.db = undefined;
    expect(await getChapterTitle(43, 3)).toBeNull();
  });
});

describe("GET /api/bible/[book]/[chapter]", () => {
  it("serves a chapter to a signed-in account", async () => {
    const response = await request("65", "1");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toMatch(/^private/);
    expect(await response.json()).toEqual({ book: 65, chapter: 1, verses: jude, title: null });
  });

  it("sends a psalm's title beside its verses, and no title for a psalm without one", async () => {
    await db.insert(biblePsalmTitles).values({ psalm: 117, text: "A title for the test." });
    await db.insert(bibleVerses).values([
      { book: 19, chapter: 117, verse: 1, text: "O praise the LORD, all ye nations." },
      { book: 19, chapter: 117, verse: 2, text: "Praise ye the LORD." },
      { book: 19, chapter: 131, verse: 1, text: "One." },
      { book: 19, chapter: 131, verse: 2, text: "Two." },
      { book: 19, chapter: 131, verse: 3, text: "Three." },
    ]);
    const titled = await (await request("19", "117")).json();
    expect(titled.title).toBe("A title for the test.");
    // The title is beside the verses, never in them.
    expect(titled.verses).toEqual(["O praise the LORD, all ye nations.", "Praise ye the LORD."]);
    expect((await (await request("19", "131")).json()).title).toBeNull();
  });

  it("still serves the verses when the titles cannot be read, and does not let that be kept", async () => {
    // The table is empty here, as in a database whose titles are not yet loaded.
    await db.insert(bibleVerses).values([
      { book: 19, chapter: 117, verse: 1, text: "O praise the LORD, all ye nations." },
      { book: 19, chapter: 117, verse: 2, text: "Praise ye the LORD." },
    ]);
    const response = await request("19", "117");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect((await response.json()).verses).toHaveLength(2);
  });

  it("refuses anyone without access", async () => {
    state.access = { ok: false, message: "Your account does not have access." };
    const response = await request("65", "1");
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ message: "Your account does not have access." });
  });

  it("answers 404 for a chapter that does not exist, without querying", async () => {
    state.db = undefined;
    for (const [book, chapter] of [
      ["65", "2"],
      ["67", "1"],
      ["0", "1"],
      ["john", "3"],
      ["43", "3;select"],
      ["43", "-1"],
    ]) {
      expect((await request(book, chapter)).status, `${book}/${chapter}`).toBe(404);
    }
  });

  it("answers 503 with a fixed message when the text is not loaded", async () => {
    const response = await request("43", "3");
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ message: "The passage could not be loaded." });
  });
});
