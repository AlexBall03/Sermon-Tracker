// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { bibleVerses } from "@/db/schema";
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
import { readChapter } from "./passages";

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

describe("GET /api/bible/[book]/[chapter]", () => {
  it("serves a chapter to a signed-in account", async () => {
    const response = await request("65", "1");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toMatch(/^private/);
    expect(await response.json()).toEqual({ book: 65, chapter: 1, verses: jude });
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
