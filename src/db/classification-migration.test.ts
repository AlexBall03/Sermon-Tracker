// @vitest-environment node
import { readFileSync } from "node:fs";

import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

/*
 * Migration 0007 (Phase 2D.1) on a database that already holds ideas: every
 * migration before it is applied, ideas are saved as the code of that day
 * saved them, and then 0007 runs. Nothing may be lost or rewritten, and the
 * code that was live while it ran must still be able to save.
 */

const tag = "0007_idea_classification";

type Journal = { entries: { tag: string }[] };
const journal = JSON.parse(readFileSync("./drizzle/meta/_journal.json", "utf8")) as Journal;
const tags = journal.entries.map((entry) => entry.tag);

async function apply(pg: PGlite, migration: string) {
  const file = readFileSync(`./drizzle/${migration}.sql`, "utf8");
  for (const statement of file.split("--> statement-breakpoint")) {
    if (statement.trim()) await pg.exec(statement);
  }
}

const owner = "11111111-1111-4111-8111-111111111111";
const sermon = "22222222-2222-4222-8222-222222222222";
const point = "33333333-3333-4333-8333-333333333333";
const thought = "44444444-4444-4444-8444-444444444444";
const faith = "55555555-5555-4555-8555-555555555555";

let pg: PGlite;
let before: unknown[];

const everything = async () =>
  (
    await pg.query(
      `select id, owner_id, kind, title, notes, status, sermon_type, subject, created_at, updated_at
       from ideas order by id`,
    )
  ).rows;

beforeAll(async () => {
  pg = new PGlite();
  const index = tags.indexOf(tag);
  expect(index).toBeGreaterThan(0);
  for (const earlier of tags.slice(0, index)) await apply(pg, earlier);

  await pg.exec(`
    insert into users (id, clerk_user_id) values ('${owner}', 'user_owner');
    insert into ideas (id, owner_id, kind, title, notes, status, sermon_type, subject, created_at, updated_at)
    values
      ('${sermon}', '${owner}', 'sermon', 'His Grace is Sufficient', 'Paul''s thorn.', 'developing',
       'expository', 'Grace', '2026-01-10T12:00:00Z', '2026-03-01T08:30:00Z'),
      ('${point}', '${owner}', 'point', 'Faith speaks first', null, 'ready', 'topical', null,
       '2026-02-01T00:00:00Z', '2026-02-02T00:00:00Z'),
      ('${thought}', '${owner}', 'undecided', 'The story is not over', null, 'captured', null, null,
       '2026-02-15T08:00:00Z', '2026-02-15T08:00:00Z');
    insert into tags (id, owner_id, name) values ('${faith}', '${owner}', 'Faith');
    insert into idea_tags (idea_id, tag_id, owner_id)
    values ('${sermon}', '${faith}', '${owner}'), ('${point}', '${faith}', '${owner}');
    insert into idea_scripture_references (idea_id, position, is_primary, book, chapter_start, verse_start, verse_end)
    values ('${sermon}', 0, true, 47, 12, 7, 10), ('${sermon}', 1, false, 19, 23, null, null);
  `);
  before = await everything();
  await apply(pg, tag);
});

describe("migration 0007, idea classification", () => {
  it("is the migration after the bilingual one, and only adds and widens", () => {
    expect(tags.indexOf(tag)).toBe(tags.indexOf("0006_scripture_translations_and_languages") + 1);
    const statements = readFileSync(`./drizzle/${tag}.sql`, "utf8").toLowerCase();
    // No row is rewritten or removed, and nothing is dropped but the two CHECKs it widens.
    expect(statements).not.toMatch(/\b(update|delete|truncate)\b/);
    expect(statements).not.toMatch(/drop (table|column|index)/);
    expect(statements).not.toMatch(/set not null|rename/);
    expect(statements.match(/drop constraint "(\w+)"/g)).toEqual([
      'drop constraint "ideas_status_check"',
      'drop constraint "ideas_sermon_type_check"',
    ]);
  });

  it("leaves every idea, and every column it had, exactly as it was", async () => {
    expect(await everything()).toEqual(before);
    expect(before).toHaveLength(3);
  });

  it("keeps the tags and the passages on the ideas they were on", async () => {
    const tagged = await pg.query(`select idea_id from idea_tags order by idea_id`);
    expect(tagged.rows).toEqual([{ idea_id: sermon }, { idea_id: point }]);
    const references = await pg.query(
      `select position, is_primary, book from idea_scripture_references
       where idea_id = '${sermon}' order by position`,
    );
    expect(references.rows).toEqual([
      { position: 0, is_primary: true, book: 47 },
      { position: 1, is_primary: false, book: 19 },
    ]);
  });

  it("gives every existing idea no stated format and no archive date", async () => {
    const rows = await pg.query(`select distinct intended_format, archived_at from ideas`);
    expect(rows.rows).toEqual([{ intended_format: "unspecified", archived_at: null }]);
  });

  it("still takes a save from the code that was live while it ran", async () => {
    // That code names these columns and no others, and writes `captured` and no type.
    await pg.exec(`
      insert into ideas (owner_id, kind, title, notes, status, sermon_type, subject)
      values ('${owner}', 'undecided', 'Saved by the old code', null, 'captured', null, null);
      update ideas set kind = 'sermon', title = 'Edited by the old code', notes = null,
        status = 'captured', sermon_type = null, subject = null
      where id = '${thought}';
    `);
    const saved = await pg.query(
      `select status, sermon_type, intended_format, archived_at from ideas
       where title in ('Saved by the old code', 'Edited by the old code')`,
    );
    expect(saved.rows).toEqual([
      { status: "captured", sermon_type: null, intended_format: "unspecified", archived_at: null },
      { status: "captured", sermon_type: null, intended_format: "unspecified", archived_at: null },
    ]);
  });

  it("gives a row that names nothing the new defaults", async () => {
    const made = await pg.query(
      `insert into ideas (owner_id, title) values ('${owner}', 'Bare')
       returning status, sermon_type, intended_format, archived_at`,
    );
    expect(made.rows).toEqual([
      {
        status: "idea",
        sermon_type: "unspecified",
        intended_format: "unspecified",
        archived_at: null,
      },
    ]);
  });

  it("admits the new values and refuses what is on no list", async () => {
    const set = (assignment: string) =>
      pg.query(`update ideas set ${assignment} where id = '${point}'`);
    for (const status of ["idea", "developing", "ready", "on_hold"]) {
      await expect(set(`status = '${status}'`)).resolves.toBeDefined();
    }
    for (const format of ["full_length", "mini", "flexible", "unspecified"]) {
      await expect(set(`intended_format = '${format}'`)).resolves.toBeDefined();
    }
    for (const type of ["topical", "textual", "expository", "unspecified"]) {
      await expect(set(`sermon_type = '${type}'`)).resolves.toBeDefined();
    }
    await expect(set(`archived_at = now()`)).resolves.toBeDefined();
    await expect(set(`archived_at = null`)).resolves.toBeDefined();

    await expect(set(`status = 'preached'`)).rejects.toThrow();
    await expect(set(`status = 'archived'`)).rejects.toThrow();
    await expect(set(`intended_format = 'long'`)).rejects.toThrow();
    await expect(set(`intended_format = null`)).rejects.toThrow();
    await expect(set(`sermon_type = 'verse_by_verse'`)).rejects.toThrow();
  });
});
