// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { expected, readDataset, readPsalmTitles } from "../bible/dataset.mjs";
import {
  bibleIsCurrent,
  checkDataset,
  checkPsalmTitles,
  psalmTitlesAreCurrent,
  seedBible,
  seedPsalmTitles,
} from "./seed-bible.mjs";

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

describe("seedPsalmTitles", () => {
  const titles = readPsalmTitles();
  const title = async (psalm) =>
    (await db.query("select text from bible_psalm_titles where psalm = $1", [psalm])).rows[0]?.text;
  const titleCount = async () =>
    (await db.query("select count(*)::int as n from bible_psalm_titles")).rows[0].n;

  it("reports a database without them as not loaded", async () => {
    expect(await psalmTitlesAreCurrent(db, titles)).toBe(false);
  });

  it("reports a database that has not had the migration as not loaded", async () => {
    const empty = new PGlite();
    expect(await psalmTitlesAreCurrent(empty, titles)).toBe(false);
    await empty.close();
  });

  it("loads every title, records the edition, and leaves the verses alone", async () => {
    const versesBefore = await count();
    const firstVerse = await verse(19, 3, 1);
    await seedPsalmTitles(db, titles);
    expect(await titleCount()).toBe(expected.psalmTitles);
    expect(await title(3)).toBe("A Psalm of David, when he fled from Absalom his son.");
    expect(await title(1)).toBeUndefined();
    expect(await psalmTitlesAreCurrent(db, titles)).toBe(true);
    expect(await count()).toBe(versesBefore);
    expect(await verse(19, 3, 1)).toBe(firstVerse);
  });

  it("can be run again without duplicating anything", async () => {
    await seedPsalmTitles(db, titles);
    expect(await titleCount()).toBe(expected.psalmTitles);
    expect(await psalmTitlesAreCurrent(db, titles)).toBe(true);
  });

  it("sees a corrected title as a new edition and replaces the old one", async () => {
    const corrected = { ...titles, 3: "A corrected title." };
    expect(await psalmTitlesAreCurrent(db, corrected)).toBe(false);
    await seedPsalmTitles(db, corrected);
    expect(await title(3)).toBe("A corrected title.");
    expect(await psalmTitlesAreCurrent(db, titles)).toBe(false);
  });

  it("changes nothing when a load fails part-way", async () => {
    const failing = {
      query: (text, params) => {
        if (text.includes("insert into reference_datasets")) throw new Error("connection lost");
        return db.query(text, params);
      },
    };
    await expect(seedPsalmTitles(failing, titles)).rejects.toThrow("connection lost");
    expect(await title(3)).toBe("A corrected title.");
    expect(await titleCount()).toBe(expected.psalmTitles);
  });

  it("refuses titles that are incomplete, misplaced, or empty", () => {
    const { 3: removed, ...short } = titles;
    expect(removed).toBeTruthy();
    expect(() => checkPsalmTitles(short)).toThrow(/incomplete/);
    expect(() => checkPsalmTitles({ ...short, 151: "A Psalm." })).toThrow(/no psalm 151/);
    expect(() => checkPsalmTitles({ ...titles, 3: " " })).toThrow(/empty/);
  });

  it("is refused by the database for a psalm that does not exist or a blank title", async () => {
    await expect(
      db.query("insert into bible_psalm_titles (psalm, text) values (151, 'A Psalm.')"),
    ).rejects.toThrow();
    await expect(
      db.query("insert into bible_psalm_titles (psalm, text) values (1, '  ')"),
    ).rejects.toThrow();
  });
});
