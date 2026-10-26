// @vitest-environment node
import { readFileSync } from "node:fs";

import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

/*
 * Migration 0020 (A2.1) on a database that already holds an account, a
 * sermon, its outline, and entries with a passage: every migration before it
 * is applied, those are saved, and then 0020 runs. It only adds a table, so
 * nothing that was there may move, and the code that is live while it runs
 * (which knows nothing of documents) must still be able to work on and
 * delete outlines and ideas.
 */

const tag = "0020_sermon_outline_documents";

type Journal = { entries: { tag: string }[] };
const journal = JSON.parse(readFileSync("./drizzle/meta/_journal.json", "utf8")) as Journal;
const tags = journal.entries.map((entry) => entry.tag);
const migration = readFileSync(`./drizzle/${tag}.sql`, "utf8");
const statements = migration
  .split("--> statement-breakpoint")
  .map((statement) => statement.trim())
  .filter(Boolean);

async function apply(pg: PGlite, name: string) {
  const file = readFileSync(`./drizzle/${name}.sql`, "utf8");
  for (const statement of file.split("--> statement-breakpoint")) {
    if (statement.trim()) await pg.exec(statement);
  }
}

const tables = [
  "users",
  "ideas",
  "sermon_outlines",
  "outline_entries",
  "outline_entry_scripture_references",
];

let pg: PGlite;
let before: Record<string, unknown[]>;
let owner: string;
let sermon: string;
let outline: string;
let entry: string;

const snapshot = async () => {
  const rows: Record<string, unknown[]> = {};
  for (const table of tables) {
    rows[table] = (await pg.query(`select * from ${table} order by 1`)).rows;
  }
  return rows;
};

beforeAll(async () => {
  pg = new PGlite();
  for (const name of tags.slice(0, tags.indexOf(tag))) await apply(pg, name);
  const one = async (sql: string, params: unknown[] = []) =>
    (await pg.query<{ id: string }>(sql, params)).rows[0].id;
  owner = await one(`insert into users (clerk_user_id) values ('user_me') returning id`);
  sermon = await one(
    `insert into ideas (owner_id, kind, title) values ($1, 'sermon', 'Grace') returning id`,
    [owner],
  );
  outline = await one(
    `insert into sermon_outlines (owner_id, sermon_id) values ($1, $2) returning id`,
    [owner, sermon],
  );
  entry = await one(
    `insert into outline_entries (outline_id, owner_id, position, title) values ($1, $2, 0, 'Point one') returning id`,
    [outline, owner],
  );
  await pg.query(
    `insert into outline_entry_scripture_references (entry_id, position, book, chapter_start) values ($1, 0, 43, 3)`,
    [entry],
  );

  before = await snapshot();
  await apply(pg, tag);
});

describe("migration 0020", () => {
  it("is the next one after 0019", () => {
    expect(tags[tags.indexOf(tag) - 1]).toBe("0019_notifications");
  });

  it("only adds: it creates one table and alters, drops, and rewrites nothing else", () => {
    expect(statements.filter((statement) => statement.startsWith("CREATE TABLE"))).toHaveLength(1);
    for (const statement of statements) {
      expect(statement).toMatch(/^(CREATE TABLE|ALTER TABLE) "sermon_outline_documents"/);
      expect(statement).not.toMatch(/\b(DROP|UPDATE "|DELETE FROM|TRUNCATE|RENAME)\b/);
    }
  });

  it("ties a document to its outline's owner, and to the account", async () => {
    const keys = await pg.query<{ name: string; definition: string }>(
      `select conname as name, pg_get_constraintdef(oid) as definition
         from pg_constraint
        where conrelid = 'sermon_outline_documents'::regclass and contype = 'f'
        order by conname`,
    );
    expect(keys.rows).toEqual([
      {
        name: "sermon_outline_documents_outline_fk",
        definition:
          "FOREIGN KEY (outline_id, owner_id) REFERENCES sermon_outlines(id, owner_id) ON DELETE CASCADE",
      },
      {
        name: "sermon_outline_documents_owner_id_users_id_fk",
        definition: "FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE RESTRICT",
      },
    ]);
  });

  it("leaves every row that was there exactly as it was", async () => {
    expect(await snapshot()).toEqual(before);
  });

  it("refuses a document of another account's outline, and one that is not an object", async () => {
    const stranger = (
      await pg.query<{ id: string }>(
        `insert into users (clerk_user_id) values ('user_other') returning id`,
      )
    ).rows[0].id;
    await expect(
      pg.query(
        `insert into sermon_outline_documents (outline_id, owner_id, content) values ($1, $2, '{}')`,
        [outline, stranger],
      ),
    ).rejects.toThrow();
    await expect(
      pg.query(
        `insert into sermon_outline_documents (outline_id, owner_id, content) values ($1, $2, '[]')`,
        [outline, owner],
      ),
    ).rejects.toThrow();
  });

  it("lets the code that was live go on changing and deleting outlines and ideas", async () => {
    await pg.query(
      `insert into sermon_outline_documents (outline_id, owner_id, content) values ($1, $2, '{"type":"doc"}')`,
      [outline, owner],
    );
    // The old code knows nothing of documents.
    await pg.query(`update outline_entries set title = 'Point one, renamed' where id = $1`, [
      entry,
    ]);
    await pg.query(`update sermon_outlines set revision = revision + 1 where id = $1`, [outline]);
    await pg.query(`delete from ideas where id = $1`, [sermon]);
    expect((await pg.query(`select 1 from sermon_outlines`)).rows).toHaveLength(0);
    expect((await pg.query(`select 1 from sermon_outline_documents`)).rows).toHaveLength(0);
  });
});
