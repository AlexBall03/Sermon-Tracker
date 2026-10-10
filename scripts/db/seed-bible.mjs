// Loads the King James Bible into `bible_verses`. See docs/DATABASE.md.
//
// It is reference data, not a migration: the text lives in data/bible/kjv.json
// and a database records which edition it holds in `reference_datasets`.
// Loading is skipped when that edition is already there, so it is safe to run
// on every start and every deployment.

import { checksum, countVerses, datasetName, expected } from "../bible/dataset.mjs";

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
