// @vitest-environment node
import { readFileSync } from "node:fs";

import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

/*
 * Migration 0013 (Phase 3A) on a database that already holds accounts and
 * ideas: every migration before it is applied, ideas are saved, and then 0013
 * runs. It only adds tables, so nothing that was there may move, and the code
 * that is live while it runs must still be able to save and delete.
 */

const tag = "0013_outline_foundation";

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

const tables = ["users", "ideas", "idea_scripture_references", "sermon_points", "sermon_relations"];

let pg: PGlite;
let before: Record<string, unknown[]>;
let sermon: string;
let point: string;

const snapshot = async () => {
  const rows: Record<string, unknown[]> = {};
  for (const table of tables) {
    rows[table] = (await pg.query(`select * from ${table} order by 1, 2`)).rows;
  }
  return rows;
};

beforeAll(async () => {
  pg = new PGlite();
  for (const name of tags.slice(0, tags.indexOf(tag))) await apply(pg, name);

  const owner = (
    await pg.query<{ id: string }>(
      `insert into users (clerk_user_id) values ('user_me') returning id`,
    )
  ).rows[0].id;
  const idea = async (kind: string, title: string) =>
    (
      await pg.query<{ id: string }>(
        `insert into ideas (owner_id, kind, title) values ($1, $2, $3) returning id`,
        [owner, kind, title],
      )
    ).rows[0].id;
  sermon = await idea("sermon", "Grace");
  point = await idea("point", "Pray without ceasing");
  await pg.query(
    `insert into idea_scripture_references (idea_id, position, book, chapter_start) values ($1, 0, 43, 3)`,
    [sermon],
  );
  await pg.query(`insert into sermon_points (sermon_id, point_id, owner_id) values ($1, $2, $3)`, [
    sermon,
    point,
    owner,
  ]);

  before = await snapshot();
  await apply(pg, tag);
});

describe("migration 0013", () => {
  it("is the next one after 0012", () => {
    // Later migrations follow it; what matters here is what it was written on top of.
    expect(tags[tags.indexOf(tag) - 1]).toBe("0012_profile_and_preaching_class");
  });

  it("only adds: it creates three tables and alters, drops, and rewrites nothing", () => {
    expect(statements.filter((statement) => statement.startsWith("CREATE TABLE"))).toHaveLength(3);
    for (const statement of statements) {
      expect(statement).toMatch(
        /^(CREATE TABLE|CREATE (UNIQUE )?INDEX|ALTER TABLE "(sermon_outlines|outline_entr))/,
      );
      expect(statement).not.toMatch(/\b(DROP|UPDATE "|DELETE FROM|TRUNCATE|RENAME)\b/);
    }
  });

  it("clears only the link, and keeps the owner, when a saved point is deleted", () => {
    const key = statements.find((statement) =>
      statement.includes("outline_entries_source_point_fk"),
    );
    // The column list is the one thing written into the generated file by hand.
    expect(key).toContain(`ON DELETE set null ("source_point_id")`);
  });

  it("leaves every row that was there exactly as it was", async () => {
    expect(await snapshot()).toEqual(before);
  });

  it("lets the code that was live go on deleting ideas", async () => {
    // The old code knows nothing of outlines; its DELETE has new keys to satisfy.
    await pg.query(`delete from ideas where id = $1`, [point]);
    await pg.query(`delete from ideas where id = $1`, [sermon]);
    expect((await pg.query(`select 1 from ideas`)).rows).toHaveLength(0);
  });
});
