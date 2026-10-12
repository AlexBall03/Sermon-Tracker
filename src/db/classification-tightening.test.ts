// @vitest-environment node
import { readFileSync } from "node:fs";

import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

/*
 * Migration 0008 (Phase 2D.3) on a database that holds ideas from before the
 * classifications were renamed: every migration before it is applied, ideas
 * are saved in the old words and the new, and then 0008 runs. The two old
 * values become the new ones, nothing else about any idea moves, and the code
 * that is live while it runs must still be able to save.
 */

const tag = "0008_idea_classification_tightening";

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
const other = "66666666-6666-4666-8666-666666666666";
const oldSermon = "22222222-2222-4222-8222-222222222222";
const oldPoint = "33333333-3333-4333-8333-333333333333";
const oldArchived = "44444444-4444-4444-8444-444444444444";
const current = "77777777-7777-4777-8777-777777777777";
const theirs = "88888888-8888-4888-8888-888888888888";
const faith = "55555555-5555-4555-8555-555555555555";

type Row = Record<string, unknown> & { id: string };

let pg: PGlite;
let before: Row[];

const everything = async () =>
  (
    await pg.query<Row>(
      `select id, owner_id, kind, title, notes, status, intended_format, sermon_type, subject,
              archived_at, created_at, updated_at
       from ideas order by id`,
    )
  ).rows;

beforeAll(async () => {
  pg = new PGlite();
  const index = tags.indexOf(tag);
  expect(index).toBeGreaterThan(0);
  for (const earlier of tags.slice(0, index)) await apply(pg, earlier);

  await pg.exec(`
    insert into users (id, clerk_user_id) values ('${owner}', 'user_owner'), ('${other}', 'user_other');
    insert into ideas (id, owner_id, kind, title, notes, status, intended_format, sermon_type, subject,
                       archived_at, created_at, updated_at)
    values
      ('${oldSermon}', '${owner}', 'sermon', 'A textual sermon on grace', 'Expository notes, topically arranged.',
       'captured', 'unspecified', null, 'Grace', null, '2026-01-10T12:00:00Z', '2026-03-01T08:30:00Z'),
      ('${oldPoint}', '${owner}', 'point', 'Faith speaks first', null,
       'captured', 'unspecified', 'topical', null, null, '2026-02-01T00:00:00Z', '2026-02-02T00:00:00Z'),
      ('${oldArchived}', '${other}', 'undecided', 'The story is not over', null,
       'captured', 'mini', null, null, '2026-05-05T05:05:05Z', '2026-02-15T08:00:00Z', '2026-02-16T08:00:00Z'),
      ('${current}', '${owner}', 'sermon', 'His Grace is Sufficient', 'Paul''s thorn.',
       'ready', 'full_length', 'expository', 'Grace', '2026-06-06T06:06:06Z', '2026-04-01T00:00:00Z',
       '2026-04-02T00:00:00Z'),
      ('${theirs}', '${other}', 'sermon', 'On hold', null,
       'on_hold', 'flexible', 'unspecified', null, null, '2026-04-03T00:00:00Z', '2026-04-04T00:00:00Z');
    insert into tags (id, owner_id, name) values ('${faith}', '${owner}', 'Faith');
    insert into idea_tags (idea_id, tag_id, owner_id)
    values ('${oldSermon}', '${faith}', '${owner}'), ('${current}', '${faith}', '${owner}');
    insert into idea_scripture_references (idea_id, position, is_primary, book, chapter_start, verse_start, verse_end)
    values ('${oldSermon}', 0, true, 47, 12, 7, 10), ('${oldSermon}', 1, false, 19, 23, null, null);
  `);
  before = await everything();
  await apply(pg, tag);
});

describe("migration 0008, tightening the idea classifications", () => {
  it("is the migration after 0007, rewrites the two old values first, and drops nothing", () => {
    expect(tags.indexOf(tag)).toBe(tags.indexOf("0007_idea_classification") + 1);
    const statements = readFileSync(`./drizzle/${tag}.sql`, "utf8")
      .toLowerCase()
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim());
    expect(statements.slice(0, 2)).toEqual([
      `update "ideas" set "status" = 'idea' where "status" = 'captured';`,
      `update "ideas" set "sermon_type" = 'unspecified' where "sermon_type" is null;`,
    ]);
    const rest = statements.slice(2).join("\n");
    expect(rest).not.toMatch(/\b(update|delete|truncate)\b/);
    expect(rest).not.toMatch(/drop (table|column|index)|rename/);
  });

  it("turns `captured` into `idea` and no type into `unspecified`, and changes nothing else", async () => {
    const expected = before.map((row) => ({
      ...row,
      status: row.status === "captured" ? "idea" : row.status,
      sermon_type: row.sermon_type ?? "unspecified",
    }));
    expect(await everything()).toEqual(expected);
    // Three were in the old words, and each kept what it did say.
    const after = new Map((await everything()).map((row) => [row.id, row]));
    expect(after.get(oldSermon)).toMatchObject({ status: "idea", sermon_type: "unspecified" });
    expect(after.get(oldPoint)).toMatchObject({ status: "idea", sermon_type: "topical" });
    expect(after.get(oldArchived)).toMatchObject({
      status: "idea",
      sermon_type: "unspecified",
      intended_format: "mini",
      owner_id: other,
    });
    expect(after.get(oldArchived)?.archived_at).toEqual(new Date("2026-05-05T05:05:05Z"));
  });

  it("leaves an idea already in the new words exactly as it was", async () => {
    const rows = await everything();
    for (const id of [current, theirs]) {
      expect(rows.find((row) => row.id === id)).toEqual(before.find((row) => row.id === id));
    }
  });

  it("keeps the tags and the passages on the ideas they were on", async () => {
    const tagged = await pg.query(`select idea_id from idea_tags order by idea_id`);
    expect(tagged.rows).toEqual([{ idea_id: oldSermon }, { idea_id: current }]);
    const references = await pg.query(
      `select position, is_primary, book from idea_scripture_references
       where idea_id = '${oldSermon}' order by position`,
    );
    expect(references.rows).toEqual([
      { position: 0, is_primary: true, book: 47 },
      { position: 1, is_primary: false, book: 19 },
    ]);
  });

  it("refuses the old values from then on", async () => {
    const set = (assignment: string) =>
      pg.query(`update ideas set ${assignment} where id = '${current}'`);
    await expect(set(`status = 'captured'`)).rejects.toThrow();
    await expect(set(`sermon_type = null`)).rejects.toThrow();
    await expect(set(`status = 'archived'`)).rejects.toThrow();
    for (const status of ["idea", "developing", "on_hold", "ready"]) {
      await expect(set(`status = '${status}'`)).resolves.toBeDefined();
    }
    for (const type of ["topical", "textual", "unspecified", "expository"]) {
      await expect(set(`sermon_type = '${type}'`)).resolves.toBeDefined();
    }
  });

  it("still takes a save from the code that is live while it runs", async () => {
    // The 2D.1 and 2D.2 releases name every classification, in the new words, or none.
    await pg.exec(`
      insert into ideas (owner_id, kind, title, notes, status, intended_format, sermon_type, subject)
      values ('${owner}', 'point', 'Saved by the live code', null, 'idea', 'unspecified', 'unspecified', null);
      update ideas set kind = 'point', title = 'Edited by the live code', notes = null, subject = null
      where id = '${oldPoint}';
    `);
    const bare = await pg.query(
      `insert into ideas (owner_id, title) values ('${owner}', 'Bare')
       returning status, sermon_type, intended_format, archived_at`,
    );
    expect(bare.rows).toEqual([
      {
        status: "idea",
        sermon_type: "unspecified",
        intended_format: "unspecified",
        archived_at: null,
      },
    ]);
  });
});
