// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { expected, readDataset } from "../bible/dataset.mjs";
import { bibleIsCurrent, checkDataset, seedBible } from "./seed-bible.mjs";

// The real dataset on an in-memory PostgreSQL with the committed migrations.
const books = readDataset();
let db;

const verse = async (book, chapter, number) =>
  (
    await db.query(
      "select text from bible_verses where book = $1 and chapter = $2 and verse = $3",
      [book, chapter, number],
    )
  ).rows[0]?.text;
const count = async () => (await db.query("select count(*)::int as n from bible_verses")).rows[0].n;

beforeAll(async () => {
  db = new PGlite();
  await migrate(drizzle({ client: db }), { migrationsFolder: "./drizzle" });
}, 60_000);

describe("seedBible", () => {
  it("reports an empty database as not loaded", async () => {
    expect(await bibleIsCurrent(db, books)).toBe(false);
  });

  it("loads every verse and records the edition", async () => {
    await seedBible(db, books);
    expect(await count()).toBe(expected.verses);
    expect(await verse(43, 3, 16)).toMatch(/^For God so loved the world/);
    expect(await verse(66, 22, 21)).toMatch(/Amen\.$/);
    expect(await bibleIsCurrent(db, books)).toBe(true);
  }, 60_000);

  it("can be run again without duplicating anything", async () => {
    await seedBible(db, books);
    expect(await count()).toBe(expected.verses);
  }, 60_000);

  it("sees a corrected text as a new edition and replaces the old one", async () => {
    const corrected = structuredClone(books);
    corrected[0][0][0] = "A corrected first verse.";
    expect(await bibleIsCurrent(db, corrected)).toBe(false);
    await seedBible(db, corrected);
    expect(await verse(1, 1, 1)).toBe("A corrected first verse.");
    expect(await bibleIsCurrent(db, corrected)).toBe(true);
    expect(await bibleIsCurrent(db, books)).toBe(false);
  }, 60_000);

  it("changes nothing when a load fails part-way", async () => {
    let inserts = 0;
    const failing = {
      query: (text, params) => {
        if (text.includes("insert into bible_verses") && ++inserts === 40) {
          throw new Error("connection lost");
        }
        return db.query(text, params);
      },
    };
    await expect(seedBible(failing, books)).rejects.toThrow("connection lost");
    expect(await count()).toBe(expected.verses);
    expect(await verse(1, 1, 1)).toBe("A corrected first verse.");
  }, 60_000);

  it("refuses a dataset that is not the whole canon", () => {
    expect(() => checkDataset(books.slice(0, 65))).toThrow(/incomplete/);
    const blank = structuredClone(books);
    blank[5][2][3] = " ";
    expect(() => checkDataset(blank)).toThrow(/empty verse/);
  });
});
