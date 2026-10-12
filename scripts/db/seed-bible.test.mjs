// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";

import { datasets, expected, readDataset, readPsalmTitles } from "../bible/dataset.mjs";
import {
  bibleIsCurrent,
  checkDataset,
  checkPsalmTitles,
  psalmTitlesAreCurrent,
  seedBible,
  seedPsalmTitles,
} from "./seed-bible.mjs";

// The real dataset on an in-memory PostgreSQL with the committed migrations.
const { kjv, rvg } = datasets;
const books = readDataset();
let db;

const verse = async (book, chapter, number) =>
  (
    await db.query(
      "select text from scripture_verses where translation = $4 and book = $1 and chapter = $2 and verse = $3",
      [book, chapter, number, "kjv"],
    )
  ).rows[0]?.text;
const count = async (translation = "kjv") =>
  (
    await db.query("select count(*)::int as n from scripture_verses where translation = $1", [
      translation,
    ])
  ).rows[0].n;

beforeAll(async () => {
  db = new PGlite();
  await migrate(drizzle({ client: db }), { migrationsFolder: "./drizzle" });
}, 60_000);

describe("seedBible", () => {
  it("reports an empty database as not loaded", async () => {
    expect(await bibleIsCurrent(db, kjv, books)).toBe(false);
  });

  it("loads every verse and records the edition", async () => {
    await seedBible(db, kjv, books);
    expect(await count()).toBe(expected.verses);
    expect(await verse(43, 3, 16)).toMatch(/^For God so loved the world/);
    expect(await verse(66, 22, 21)).toMatch(/Amen\.$/);
    expect(await bibleIsCurrent(db, kjv, books)).toBe(true);
  }, 60_000);

  it("can be run again without duplicating anything", async () => {
    await seedBible(db, kjv, books);
    expect(await count()).toBe(expected.verses);
  }, 60_000);

  it("sees a corrected text as a new edition and replaces the old one", async () => {
    const corrected = structuredClone(books);
    corrected[0][0][0] = "A corrected first verse.";
    expect(await bibleIsCurrent(db, kjv, corrected)).toBe(false);
    await seedBible(db, kjv, corrected);
    expect(await verse(1, 1, 1)).toBe("A corrected first verse.");
    expect(await bibleIsCurrent(db, kjv, corrected)).toBe(true);
    expect(await bibleIsCurrent(db, kjv, books)).toBe(false);
  }, 60_000);

  it("changes nothing when a load fails part-way", async () => {
    let inserts = 0;
    const failing = {
      query: (text, params) => {
        if (text.includes("insert into scripture_verses") && ++inserts === 40) {
          throw new Error("connection lost");
        }
        return db.query(text, params);
      },
    };
    await expect(seedBible(failing, kjv, books)).rejects.toThrow("connection lost");
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
    (
      await db.query(
        "select text from scripture_psalm_titles where translation = 'kjv' and psalm = $1",
        [psalm],
      )
    ).rows[0]?.text;
  const titleCount = async (translation = "kjv") =>
    (
      await db.query(
        "select count(*)::int as n from scripture_psalm_titles where translation = $1",
        [translation],
      )
    ).rows[0].n;

  it("reports a database without them as not loaded", async () => {
    expect(await psalmTitlesAreCurrent(db, kjv, titles)).toBe(false);
  });

  it("reports a database that has not had the migration as not loaded", async () => {
    const empty = new PGlite();
    expect(await psalmTitlesAreCurrent(empty, kjv, titles)).toBe(false);
    await empty.close();
  });

  it("loads every title, records the edition, and leaves the verses alone", async () => {
    const versesBefore = await count();
    const firstVerse = await verse(19, 3, 1);
    await seedPsalmTitles(db, kjv, titles);
    expect(await titleCount()).toBe(expected.psalmTitles);
    expect(await title(3)).toBe("A Psalm of David, when he fled from Absalom his son.");
    expect(await title(1)).toBeUndefined();
    expect(await psalmTitlesAreCurrent(db, kjv, titles)).toBe(true);
    expect(await count()).toBe(versesBefore);
    expect(await verse(19, 3, 1)).toBe(firstVerse);
  });

  it("can be run again without duplicating anything", async () => {
    await seedPsalmTitles(db, kjv, titles);
    expect(await titleCount()).toBe(expected.psalmTitles);
    expect(await psalmTitlesAreCurrent(db, kjv, titles)).toBe(true);
  });

  it("sees a corrected title as a new edition and replaces the old one", async () => {
    const corrected = { ...titles, 3: "A corrected title." };
    expect(await psalmTitlesAreCurrent(db, kjv, corrected)).toBe(false);
    await seedPsalmTitles(db, kjv, corrected);
    expect(await title(3)).toBe("A corrected title.");
    expect(await psalmTitlesAreCurrent(db, kjv, titles)).toBe(false);
  });

  it("changes nothing when a load fails part-way", async () => {
    const failing = {
      query: (text, params) => {
        if (text.includes("insert into reference_datasets")) throw new Error("connection lost");
        return db.query(text, params);
      },
    };
    await expect(seedPsalmTitles(failing, kjv, titles)).rejects.toThrow("connection lost");
    expect(await title(3)).toBe("A corrected title.");
    expect(await titleCount()).toBe(expected.psalmTitles);
  });

  it("refuses titles that are incomplete, misplaced, or empty", () => {
    const { 3: removed, ...short } = titles;
    expect(removed).toBeTruthy();
    expect(() => checkPsalmTitles(kjv, short)).toThrow(/incomplete/);
    expect(() => checkPsalmTitles(kjv, { ...short, 151: "A Psalm." })).toThrow(/no psalm 151/);
    expect(() => checkPsalmTitles(kjv, { ...titles, 3: " " })).toThrow(/empty/);
  });

  it("is refused by the database for a psalm that does not exist or a blank title", async () => {
    await expect(
      db.query(
        "insert into scripture_psalm_titles (translation, psalm, text) values ('kjv', 151, 'A Psalm.')",
      ),
    ).rejects.toThrow();
    await expect(
      db.query(
        "insert into scripture_psalm_titles (translation, psalm, text) values ('kjv', 1, '  ')",
      ),
    ).rejects.toThrow();
    await expect(
      db.query(
        "insert into scripture_psalm_titles (translation, psalm, text) values ('nvi', 2, 'Salmo.')",
      ),
    ).rejects.toThrow();
  });
});

describe("a second translation", () => {
  const spanish = readDataset(rvg.path);
  const spanishTitles = readPsalmTitles(rvg.titlesPath);
  const text = async (translation, book, chapter, number) =>
    (
      await db.query(
        "select text from scripture_verses where translation = $1 and book = $2 and chapter = $3 and verse = $4",
        [translation, book, chapter, number],
      )
    ).rows[0]?.text;
  const titles = async (translation) =>
    (
      await db.query(
        "select count(*)::int as n from scripture_psalm_titles where translation = $1",
        [translation],
      )
    ).rows[0].n;

  it("is not loaded merely because the other is", async () => {
    expect(await bibleIsCurrent(db, rvg, spanish)).toBe(false);
    expect(await psalmTitlesAreCurrent(db, rvg, spanishTitles)).toBe(false);
  });

  it("loads beside the first and leaves it exactly as it was", async () => {
    const english = await text("kjv", 43, 3, 16);
    const englishTitles = await titles("kjv");
    await seedBible(db, rvg, spanish);
    await seedPsalmTitles(db, rvg, spanishTitles);

    expect(await count("rvg")).toBe(expected.verses);
    expect(await count("kjv")).toBe(expected.verses);
    expect(await text("rvg", 43, 3, 16)).toMatch(/^Porque de tal manera amó Dios al mundo/);
    expect(await text("kjv", 43, 3, 16)).toBe(english);
    expect(await titles("rvg")).toBe(rvg.psalmTitles);
    expect(await titles("kjv")).toBe(englishTitles);
    expect(await bibleIsCurrent(db, rvg, spanish)).toBe(true);
    expect(await psalmTitlesAreCurrent(db, rvg, spanishTitles)).toBe(true);
  }, 60_000);

  it("can be run again without duplicating anything", async () => {
    await seedBible(db, rvg, spanish);
    await seedPsalmTitles(db, rvg, spanishTitles);
    expect(await count("rvg")).toBe(expected.verses);
    expect(await titles("rvg")).toBe(rvg.psalmTitles);
  }, 60_000);

  it("is left alone when the first is loaded again", async () => {
    await seedBible(db, kjv, books);
    expect(await count("rvg")).toBe(expected.verses);
    expect(await text("rvg", 1, 1, 1)).toBe("En el principio creó Dios el cielo y la tierra.");
    expect(await text("kjv", 1, 1, 1)).toBe(
      "In the beginning God created the heaven and the earth.",
    );
  }, 60_000);

  it("is refused by the database under a name that is not a translation", async () => {
    await expect(
      db.query(
        "insert into scripture_verses (translation, book, chapter, verse, text) values ('rv1960', 1, 1, 1, 'x')",
      ),
    ).rejects.toThrow();
  });

  it("refuses the wrong number of titles for the translation", () => {
    expect(() => checkPsalmTitles(rvg, readPsalmTitles(kjv.titlesPath))).toThrow(/incomplete/);
  });

  it("never loads into the tables the earlier deployment still reads", async () => {
    const old = await db.query("select count(*)::int as n from bible_verses");
    expect(old.rows[0].n).toBe(0);
  });
});
