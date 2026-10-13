// @vitest-environment node
import { readFileSync } from "node:fs";

import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

/*
 * Migration 0009 (Phase 2E.1) on a database that already holds accounts and
 * ideas: every migration before it is applied, ideas are saved with tags and
 * references, and then 0009 runs. It only adds tables, so nothing that was
 * there may move, and the code that is live while it runs must still be able
 * to save and delete.
 */

const tag = "0009_preaching_history";

type Journal = { entries: { tag: string }[] };
const journal = JSON.parse(readFileSync("./drizzle/meta/_journal.json", "utf8")) as Journal;
const tags = journal.entries.map((entry) => entry.tag);
const migration = readFileSync(`./drizzle/${tag}.sql`, "utf8");

async function apply(pg: PGlite, name: string) {
  const file = readFileSync(`./drizzle/${name}.sql`, "utf8");
  for (const statement of file.split("--> statement-breakpoint")) {
    if (statement.trim()) await pg.exec(statement);
  }
}

const owner = "11111111-1111-4111-8111-111111111111";
const other = "66666666-6666-4666-8666-666666666666";
const sermon = "22222222-2222-4222-8222-222222222222";
const point = "33333333-3333-4333-8333-333333333333";
const archived = "44444444-4444-4444-8444-444444444444";
const theirs = "88888888-8888-4888-8888-888888888888";
const faith = "55555555-5555-4555-8555-555555555555";

const tables = [
  "users",
  "ideas",
  "tags",
  "idea_tags",
  "idea_scripture_references",
  "bible_favorites",
  "bible_highlights",
  "app_settings",
];

let pg: PGlite;
let before: Record<string, unknown[]>;

async function everything() {
  const rows: Record<string, unknown[]> = {};
  for (const table of tables) {
    rows[table] = (await pg.query(`select * from ${table} order by 1, 2`)).rows;
  }
  return rows;
}

const constraints = async (table: string) =>
  (
    await pg.query<{ name: string; definition: string }>(
      `select conname as name, pg_get_constraintdef(oid) as definition
       from pg_constraint where conrelid = '${table}'::regclass order by conname`,
    )
  ).rows;

beforeAll(async () => {
  pg = new PGlite();
  const index = tags.indexOf(tag);
  expect(index).toBe(9);
  for (const earlier of tags.slice(0, index)) await apply(pg, earlier);

  await pg.exec(`
    insert into users (id, clerk_user_id) values ('${owner}', 'user_owner'), ('${other}', 'user_other');
    insert into ideas (id, owner_id, kind, title, notes, status, intended_format, sermon_type, subject,
                       archived_at, created_at, updated_at)
    values
      ('${sermon}', '${owner}', 'sermon', 'His Grace is Sufficient', 'Paul''s thorn.',
       'ready', 'full_length', 'expository', 'Grace', null, '2026-04-01T00:00:00Z', '2026-04-02T00:00:00Z'),
      ('${point}', '${owner}', 'point', 'Faith speaks first', null,
       'idea', 'unspecified', 'unspecified', null, null, '2026-02-01T00:00:00Z', '2026-02-02T00:00:00Z'),
      ('${archived}', '${owner}', 'sermon', 'The story is not over', null,
       'on_hold', 'mini', 'topical', null, '2026-05-05T05:05:05Z', '2026-02-15T08:00:00Z',
       '2026-02-16T08:00:00Z'),
      ('${theirs}', '${other}', 'sermon', 'Someone else''s sermon', null,
       'developing', 'flexible', 'textual', null, null, '2026-03-01T00:00:00Z', '2026-03-02T00:00:00Z');
    insert into tags (id, owner_id, name) values ('${faith}', '${owner}', 'Faith');
    insert into idea_tags (idea_id, tag_id, owner_id) values ('${sermon}', '${faith}', '${owner}');
    insert into idea_scripture_references (idea_id, position, is_primary, book, chapter_start, verse_start)
    values ('${sermon}', 0, true, 47, 12, 9), ('${point}', 0, false, 45, 10, 17);
  `);

  before = await everything();
  await apply(pg, tag);
});

describe("migration 0009", () => {
  it("only adds: it creates three tables and alters, drops, and rewrites nothing", () => {
    const statements = migration
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      .filter(Boolean);
    expect(statements.filter((statement) => statement.startsWith("CREATE TABLE"))).toHaveLength(3);
    for (const statement of statements) {
      expect(statement).toMatch(/^(CREATE TABLE|CREATE (UNIQUE )?INDEX|ALTER TABLE "preaching_)/);
      expect(statement).not.toMatch(/\b(DROP|UPDATE "|DELETE FROM|TRUNCATE|RENAME)\b/);
    }
  });

  it("leaves every account, idea, tag, and reference exactly as it was", async () => {
    expect(await everything()).toEqual(before);
    expect(before.ideas).toHaveLength(4);
  });

  it("leaves the constraints on ideas and tags as they were", async () => {
    const names = (await constraints("ideas")).map((row) => row.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "ideas_id_owner_key",
        "ideas_kind_check",
        "ideas_status_check",
        "ideas_sermon_type_check",
        "ideas_intended_format_check",
      ]),
    );
    await expect(
      pg.exec(`update ideas set status = 'captured' where id = '${point}'`),
    ).rejects.toThrow();
    await expect(
      pg.exec(`insert into tags (owner_id, name) values ('${owner}', 'FAITH')`),
    ).rejects.toThrow();
  });

  it("starts with no history, no venues, and no contexts for anyone", async () => {
    for (const table of ["preaching_occurrences", "preaching_venues", "preaching_contexts"]) {
      expect((await pg.query(`select 1 from ${table}`)).rows).toHaveLength(0);
    }
  });

  it("ties an occasion to its owner's sermon, venue, and context, and restricts all three", async () => {
    const keys = (await constraints("preaching_occurrences")).filter((row) =>
      row.definition.startsWith("FOREIGN KEY"),
    );
    expect(Object.fromEntries(keys.map((row) => [row.name, row.definition]))).toEqual({
      preaching_occurrences_owner_id_users_id_fk:
        "FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE RESTRICT",
      preaching_occurrences_sermon_fk:
        "FOREIGN KEY (sermon_id, owner_id) REFERENCES ideas(id, owner_id) ON DELETE RESTRICT",
      preaching_occurrences_venue_fk:
        "FOREIGN KEY (venue_id, owner_id) REFERENCES preaching_venues(id, owner_id) ON DELETE RESTRICT",
      preaching_occurrences_context_fk:
        "FOREIGN KEY (context_id, owner_id) REFERENCES preaching_contexts(id, owner_id) ON DELETE RESTRICT",
    });

    const indexes = await pg.query<{ indexname: string }>(
      `select indexname from pg_indexes where tablename like 'preaching_%' order by indexname`,
    );
    expect(indexes.rows.map((row) => row.indexname)).toEqual(
      expect.arrayContaining([
        "preaching_contexts_owner_name_key",
        "preaching_occurrences_context_idx",
        "preaching_occurrences_owner_date_idx",
        "preaching_occurrences_sermon_idx",
        "preaching_occurrences_venue_idx",
        "preaching_venues_owner_name_key",
      ]),
    );
  });

  it("lets the code that was live before it go on saving and deleting ideas", async () => {
    // That code knows nothing of history: it inserts, updates, and deletes ideas as before.
    await pg.exec(`
      insert into ideas (owner_id, kind, title, status, intended_format, sermon_type)
      values ('${owner}', 'undecided', 'Saved by the old code', 'idea', 'unspecified', 'unspecified');
      update ideas set kind = 'sermon', title = 'Faith speaks first, again' where id = '${point}';
    `);
    await pg.exec(`delete from ideas where id = '${point}' and owner_id = '${owner}'`);
    const left = await pg.query<{ id: string }>(`select id from ideas where id = '${point}'`);
    expect(left.rows).toHaveLength(0);
    // Its references went with it, as they always did.
    const references = await pg.query(
      `select 1 from idea_scripture_references where idea_id = '${point}'`,
    );
    expect(references.rows).toHaveLength(0);
  });

  it("then holds history for an existing sermon, archived or not, and keeps it from deletion", async () => {
    await pg.exec(`
      insert into preaching_occurrences (owner_id, sermon_id, preached_on, time_of_day)
      values ('${owner}', '${sermon}', '2026-10-11', 'am'), ('${owner}', '${archived}', '2026-10-04', null);
    `);
    await expect(pg.exec(`delete from ideas where id = '${sermon}'`)).rejects.toThrow();
    await expect(
      pg.exec(
        `insert into preaching_occurrences (owner_id, sermon_id, preached_on) values ('${owner}', '${theirs}', '2026-10-11')`,
      ),
    ).rejects.toThrow();
    const day = await pg.query<{ day: string }>(
      `select preached_on::text as day from preaching_occurrences where sermon_id = '${sermon}'`,
    );
    expect(day.rows).toEqual([{ day: "2026-10-11" }]);
  });
});
