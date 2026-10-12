// Loads each Bible translation into `scripture_verses`, and its titles of the
// Psalms into `scripture_psalm_titles`. See docs/DATABASE.md.
//
// It is reference data, not a migration: each text lives in data/bible (see
// `datasets` in scripts/bible/dataset.mjs) and a database records which
// edition of each it holds in `reference_datasets`. Loading is skipped when
// that edition is already there, so it is safe to run on every start and
// every deployment. One translation is loaded at a time and no load touches
// another translation's rows.

import {
  checksum,
  countVerses,
  expected,
  psalmCount,
  titleRows,
  titlesChecksum,
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

async function tablesExist(db, ...names) {
  for (const name of ["reference_datasets", ...names]) {
    const table = await db.query("select to_regclass($1) is not null as present", [
      `public.${name}`,
    ]);
    if (!table.rows[0].present) return false;
  }
  return true;
}

async function recorded(db, name) {
  const result = await db.query(
    "select checksum, row_count from reference_datasets where name = $1",
    [name],
  );
  return result.rows[0];
}

async function record(db, name, sum, rows) {
  await db.query(
    `insert into reference_datasets (name, checksum, row_count) values ($1, $2, $3)
     on conflict (name) do update
       set checksum = excluded.checksum, row_count = excluded.row_count, loaded_at = now()`,
    [name, sum, rows],
  );
}

/** True when the database already holds exactly this edition of a translation's text. */
export async function bibleIsCurrent(db, dataset, books) {
  // Before its migration has run there is no table, and so nothing loaded.
  if (!(await tablesExist(db, "scripture_verses"))) return false;
  const loaded = await recorded(db, dataset.name);
  return loaded?.checksum === checksum(books) && loaded?.row_count === expected.verses;
}

/**
 * Replaces one translation's stored text with the dataset, in one
 * transaction: readers see the old edition or the new one, never part of
 * each, and a failure changes nothing. `db` must be a single connection, not
 * a pool.
 */
export async function seedBible(db, dataset, books) {
  checkDataset(books);
  await db.query("begin");
  try {
    await db.query("delete from scripture_verses where translation = $1", [dataset.id]);
    for (const [index, chapters] of books.entries()) {
      const rows = chapters.flatMap((verses, chapter) =>
        verses.map((text, verse) => ({ c: chapter + 1, v: verse + 1, t: text })),
      );
      // One statement per book. A JSON parameter avoids array-literal quoting.
      await db.query(
        `insert into scripture_verses (translation, book, chapter, verse, text)
         select $1, $2::smallint, c, v, t
         from jsonb_to_recordset($3::jsonb) as rows(c smallint, v smallint, t text)`,
        [dataset.id, index + 1, JSON.stringify(rows)],
      );
    }
    const stored = await db.query(
      "select count(*)::int as verses from scripture_verses where translation = $1",
      [dataset.id],
    );
    if (stored.rows[0].verses !== expected.verses) {
      throw new Error(
        `Expected ${expected.verses} verses, the database holds ${stored.rows[0].verses}.`,
      );
    }
    await record(db, dataset.name, checksum(books), expected.verses);
    await db.query("commit");
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
}

/** Refuses anything that is not the translation's full set of titles, each on a real psalm. */
export function checkPsalmTitles(dataset, titles) {
  const rows = titleRows(titles);
  if (rows.length !== dataset.psalmTitles) {
    throw new Error(`The psalm titles are incomplete: ${rows.length} of ${dataset.psalmTitles}.`);
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

/** True when the database already holds exactly these titles for the translation. */
export async function psalmTitlesAreCurrent(db, dataset, titles) {
  if (!(await tablesExist(db, "scripture_psalm_titles"))) return false;
  const loaded = await recorded(db, dataset.titlesName);
  return loaded?.checksum === titlesChecksum(titles) && loaded?.row_count === dataset.psalmTitles;
}

/**
 * Replaces one translation's stored psalm titles with the dataset, in one
 * transaction, as `seedBible` does for the verses. It never touches
 * `scripture_verses`. `db` must be a single connection, not a pool.
 */
export async function seedPsalmTitles(db, dataset, titles) {
  checkPsalmTitles(dataset, titles);
  await db.query("begin");
  try {
    await db.query("delete from scripture_psalm_titles where translation = $1", [dataset.id]);
    await db.query(
      `insert into scripture_psalm_titles (translation, psalm, text)
       select $1, psalm, text
       from jsonb_to_recordset($2::jsonb) as rows(psalm smallint, text text)`,
      [dataset.id, JSON.stringify(titleRows(titles))],
    );
    const stored = await db.query(
      "select count(*)::int as titles from scripture_psalm_titles where translation = $1",
      [dataset.id],
    );
    if (stored.rows[0].titles !== dataset.psalmTitles) {
      throw new Error(
        `Expected ${dataset.psalmTitles} psalm titles, the database holds ${stored.rows[0].titles}.`,
      );
    }
    await record(db, dataset.titlesName, titlesChecksum(titles), dataset.psalmTitles);
    await db.query("commit");
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
}
