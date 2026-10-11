// Loads the King James Bible into `bible_verses`, and the titles of the Psalms
// into `bible_psalm_titles`. See docs/DATABASE.md.
//
// It is reference data, not a migration: the text lives in data/bible/kjv.json
// (the titles in data/bible/kjv-psalm-titles.json) and a database records
// which edition of each it holds in `reference_datasets`.
// Loading is skipped when that edition is already there, so it is safe to run
// on every start and every deployment.

import {
  checksum,
  countVerses,
  datasetName,
  expected,
  psalmCount,
  titleRows,
  titlesChecksum,
  titlesDatasetName,
} from "../bible/dataset.mjs";

/** Refuses anything that is not a complete 66-book canon. */
export function checkDataset(books) {
  const chapters = books.reduce((total, book) => total + book.length, 0);
  const verses = countVerses(books);
  if (
    books.length !== expected.books ||
    chapters !== expected.chapters ||
    verses !== expected.verses
  ) {
    throw new Error(
      `The Bible dataset is incomplete: ${books.length} books, ${chapters} chapters, ${verses} verses.`,
    );
  }
  if (books.some((book) => book.some((chapter) => chapter.some((text) => !text?.trim())))) {
    throw new Error("The Bible dataset has an empty verse.");
  }
}

/** True when the database already holds exactly this edition. */
export async function bibleIsCurrent(db, books) {
  const table = await db.query(
    "select to_regclass('public.reference_datasets') is not null as present",
  );
  if (!table.rows[0].present) return false;
  const result = await db.query(
    "select checksum, row_count from reference_datasets where name = $1",
    [datasetName],
  );
  const loaded = result.rows[0];
  return loaded?.checksum === checksum(books) && loaded?.row_count === expected.verses;
}

/**
 * Replaces the stored text with the dataset, in one transaction: readers see
 * the old edition or the new one, never part of each, and a failure changes
 * nothing. `db` must be a single connection, not a pool.
 */
export async function seedBible(db, books) {
  checkDataset(books);
  await db.query("begin");
  try {
    await db.query("delete from bible_verses");
    for (const [index, chapters] of books.entries()) {
      const rows = chapters.flatMap((verses, chapter) =>
        verses.map((text, verse) => ({ c: chapter + 1, v: verse + 1, t: text })),
      );
      // One statement per book. A JSON parameter avoids array-literal quoting.
      await db.query(
        `insert into bible_verses (book, chapter, verse, text)
         select $1::smallint, c, v, t
         from jsonb_to_recordset($2::jsonb) as rows(c smallint, v smallint, t text)`,
        [index + 1, JSON.stringify(rows)],
      );
    }
    const stored = await db.query("select count(*)::int as verses from bible_verses");
    if (stored.rows[0].verses !== expected.verses) {
      throw new Error(
        `Expected ${expected.verses} verses, the database holds ${stored.rows[0].verses}.`,
      );
    }
    await db.query(
      `insert into reference_datasets (name, checksum, row_count) values ($1, $2, $3)
       on conflict (name) do update
         set checksum = excluded.checksum, row_count = excluded.row_count, loaded_at = now()`,
      [datasetName, checksum(books), expected.verses],
    );
    await db.query("commit");
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
}

/** Refuses anything that is not the full set of titles, each on a real psalm. */
export function checkPsalmTitles(titles) {
  const rows = titleRows(titles);
  if (rows.length !== expected.psalmTitles) {
    throw new Error(`The psalm titles are incomplete: ${rows.length} of ${expected.psalmTitles}.`);
  }
  for (const { psalm, text } of rows) {
    if (!Number.isInteger(psalm) || psalm < 1 || psalm > psalmCount) {
      throw new Error(`There is no psalm ${psalm} to give a title to.`);
    }
    if (typeof text !== "string" || !text.trim()) {
      throw new Error(`The title of psalm ${psalm} is empty.`);
    }
  }
}

/** True when the database already holds exactly these titles. */
export async function psalmTitlesAreCurrent(db, titles) {
  // Before its migration has run there is no table, and so nothing loaded.
  const tables = await db.query(
    `select to_regclass('public.reference_datasets') is not null
        and to_regclass('public.bible_psalm_titles') is not null as present`,
  );
  if (!tables.rows[0].present) return false;
  const result = await db.query(
    "select checksum, row_count from reference_datasets where name = $1",
    [titlesDatasetName],
  );
  const loaded = result.rows[0];
  return loaded?.checksum === titlesChecksum(titles) && loaded?.row_count === expected.psalmTitles;
}

/**
 * Replaces the stored psalm titles with the dataset, in one transaction, as
 * `seedBible` does for the verses. It never touches `bible_verses`. `db` must
 * be a single connection, not a pool.
 */
export async function seedPsalmTitles(db, titles) {
  checkPsalmTitles(titles);
  await db.query("begin");
  try {
    await db.query("delete from bible_psalm_titles");
    await db.query(
      `insert into bible_psalm_titles (psalm, text)
       select psalm, text
       from jsonb_to_recordset($1::jsonb) as rows(psalm smallint, text text)`,
      [JSON.stringify(titleRows(titles))],
    );
    const stored = await db.query("select count(*)::int as titles from bible_psalm_titles");
    if (stored.rows[0].titles !== expected.psalmTitles) {
      throw new Error(
        `Expected ${expected.psalmTitles} psalm titles, the database holds ${stored.rows[0].titles}.`,
      );
    }
    await db.query(
      `insert into reference_datasets (name, checksum, row_count) values ($1, $2, $3)
       on conflict (name) do update
         set checksum = excluded.checksum, row_count = excluded.row_count, loaded_at = now()`,
      [titlesDatasetName, titlesChecksum(titles), expected.psalmTitles],
    );
    await db.query("commit");
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
}
