// @vitest-environment node
import { readFileSync } from "node:fs";

import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

import { ownTestClient } from "@/db/test-lifecycle";

/*
 * Migration 0021 (A4.2B) on a database that already holds accounts (active,
 * disabled, deleting, mid-setup), a sermon, its outline, and its document:
 * every migration before it is applied, those are saved, and then 0021 runs.
 * It adds two tables and three columns on `users`, so nothing that was there
 * may move, every account must read as built-in Balanced at revision 1, and
 * the code live while it runs (which knows nothing of presets) must still
 * insert and delete accounts.
 */

const tag = "0021_appearance_presets";

type Journal = { entries: { tag: string }[] };
const journal = JSON.parse(readFileSync("./drizzle/meta/_journal.json", "utf8")) as Journal;
const tags = journal.entries.map((entry) => entry.tag);
const statements = readFileSync(`./drizzle/${tag}.sql`, "utf8")
  .split("--> statement-breakpoint")
  .map((statement) => statement.trim())
  .filter(Boolean);

async function apply(pg: PGlite, name: string) {
  const file = readFileSync(`./drizzle/${name}.sql`, "utf8");
  for (const statement of file.split("--> statement-breakpoint")) {
    if (statement.trim()) await pg.exec(statement);
  }
}

const tables = ["ideas", "sermon_outlines", "sermon_outline_documents"];
const newColumns = [
  "default_builtin_appearance_preset",
  "default_personal_appearance_preset_id",
  "appearance_default_revision",
];

let pg: PGlite;
let usersBefore: Record<string, unknown>[];
let rowsBefore: Record<string, unknown[]>;
let me: string;
let other: string;

const one = async (sql: string, params: unknown[] = []) =>
  (await pg.query<{ id: string }>(sql, params)).rows[0].id;

const rows = async () => {
  const out: Record<string, unknown[]> = {};
  for (const table of tables)
    out[table] = (await pg.query(`select * from ${table} order by 1`)).rows;
  return out;
};

/** The SQLSTATE and constraint a statement was refused with, or null when it was not. */
async function refusal(sql: string, params: unknown[] = []) {
  try {
    await pg.query(sql, params);
    return null;
  } catch (error) {
    const { code, constraint } = error as { code?: string; constraint?: string };
    return { code, constraint };
  }
}

const preset = async (owner: string, name: string) =>
  one(
    `insert into appearance_presets (owner_id, name, appearance) values ($1, $2, '{"version":1}') returning id`,
    [owner, name],
  );

beforeAll(async () => {
  pg = ownTestClient(new PGlite());
  for (const name of tags.slice(0, tags.indexOf(tag))) await apply(pg, name);
  me = await one(
    `insert into users (clerk_user_id, role, church_name) values ('user_me', 'admin', 'Grace Chapel') returning id`,
  );
  other = await one(`insert into users (clerk_user_id) values ('user_other') returning id`);
  await one(
    `insert into users (clerk_user_id, status) values ('user_off', 'disabled') returning id`,
  );
  await one(
    `insert into users (clerk_user_id, status) values ('user_gone', 'deleting') returning id`,
  );
  const sermon = await one(
    `insert into ideas (owner_id, kind, title) values ($1, 'sermon', 'Grace') returning id`,
    [me],
  );
  const outline = await one(
    `insert into sermon_outlines (owner_id, sermon_id) values ($1, $2) returning id`,
    [me, sermon],
  );
  await pg.query(
    `insert into sermon_outline_documents (outline_id, owner_id, content) values ($1, $2, '{"type":"doc"}')`,
    [outline, me],
  );
  usersBefore = (await pg.query<Record<string, unknown>>(`select * from users order by id`)).rows;
  rowsBefore = await rows();
  await apply(pg, tag);
});

describe("migration 0021_appearance_presets", () => {
  it("only creates the two tables and adds to users", () => {
    for (const statement of statements) {
      expect(statement).toMatch(
        /^(CREATE TABLE "appearance_preset(s|_operations)"|CREATE UNIQUE INDEX "appearance_presets_owner_name_key"|ALTER TABLE "(users|appearance_presets|appearance_preset_operations)" ADD (COLUMN|CONSTRAINT))/,
      );
      // A key's own ON DELETE / ON UPDATE clause is not a statement that changes rows.
      const bare = statement.replace(/ON (DELETE|UPDATE) (restrict|no action)/g, "");
      expect(bare).not.toMatch(/\b(DROP|UPDATE|DELETE|RENAME|TRUNCATE|ALTER COLUMN)\b/i);
    }
    // Both tables exist before any key names them.
    const firstKey = statements.findIndex((statement) => statement.includes("FOREIGN KEY"));
    const lastTable = statements.findLastIndex((statement) => statement.startsWith("CREATE TABLE"));
    expect(firstKey).toBeGreaterThan(lastTable);
  });

  it("leaves every existing account and row as it was, on Balanced at revision 1", async () => {
    const after = (await pg.query<Record<string, unknown>>(`select * from users order by id`)).rows;
    expect(after).toHaveLength(usersBefore.length);
    after.forEach((row, index) => {
      const old = Object.fromEntries(
        Object.entries(row).filter(([column]) => !newColumns.includes(column)),
      );
      expect(old).toEqual(usersBefore[index]);
      expect(row.default_builtin_appearance_preset).toBe("balanced");
      expect(row.default_personal_appearance_preset_id).toBeNull();
      expect(row.appearance_default_revision).toBe(1);
    });
    expect(await rows()).toEqual(rowsBefore);
  });

  it("lets the code already live insert and delete accounts as before", async () => {
    const id = await one(`insert into users (clerk_user_id) values ('user_new') returning id`);
    const [row] = (
      await pg.query<Record<string, unknown>>(`select * from users where id = $1`, [id])
    ).rows;
    expect(row.default_builtin_appearance_preset).toBe("balanced");
    expect(row.appearance_default_revision).toBe(1);
    await pg.query(`delete from users where id = $1`, [id]);
  });

  it("refuses names that are blank, too long, untrimmed, or taken in any case", async () => {
    const insert = `insert into appearance_presets (owner_id, name, appearance) values ($1, $2, '{}')`;
    expect(await refusal(insert, [me, "   "])).toMatchObject({
      code: "23514",
      constraint: "appearance_presets_name_check",
    });
    expect(await refusal(insert, [me, "x".repeat(81)])).toMatchObject({ code: "23514" });
    expect(await refusal(insert, [me, " Sunday"])).toMatchObject({ code: "23514" });
    expect(await refusal(insert, [me, "x".repeat(80)])).toBeNull();

    await preset(me, "Sunday Morning");
    expect(await refusal(insert, [me, "sunday MORNING"])).toMatchObject({
      code: "23505",
      constraint: "appearance_presets_owner_name_key",
    });
    // Another account may use the same name.
    expect(await refusal(insert, [other, "Sunday Morning"])).toBeNull();
  });

  it("refuses a revision below 1, an appearance that is not an object, and one over 64 KiB", async () => {
    expect(
      await refusal(
        `insert into appearance_presets (owner_id, name, appearance, revision) values ($1, 'R', '{}', 0)`,
        [me],
      ),
    ).toMatchObject({ code: "23514", constraint: "appearance_presets_revision_check" });
    expect(
      await refusal(
        `insert into appearance_presets (owner_id, name, appearance) values ($1, 'A', '[]')`,
        [me],
      ),
    ).toMatchObject({ constraint: "appearance_presets_appearance_check" });
    // The limit is on jsonb's own text: `{"p": "…"}` is 9 bytes around the string.
    const fits = JSON.stringify({ p: "x".repeat(65_536 - 9) });
    const over = JSON.stringify({ p: "x".repeat(65_536 - 8) });
    const insert = `insert into appearance_presets (owner_id, name, appearance) values ($1, $2, $3::jsonb)`;
    expect(await refusal(insert, [me, "Fits", fits])).toBeNull();
    const [{ bytes }] = (
      await pg.query<{ bytes: number }>(
        `select octet_length(appearance::text) as bytes from appearance_presets where name = 'Fits'`,
      )
    ).rows;
    expect(bytes).toBe(65_536);
    expect(await refusal(insert, [me, "Over", over])).toMatchObject({
      code: "23514",
      constraint: "appearance_presets_appearance_check",
    });
  });

  it("holds an account to exactly one default, of its own presets only", async () => {
    const mine = await preset(me, "Mine");
    const theirs = await preset(other, "Theirs");
    const set = (builtin: string | null, personal: string | null, account = me) =>
      refusal(
        `update users set default_builtin_appearance_preset = $1, default_personal_appearance_preset_id = $2 where id = $3`,
        [builtin, personal, account],
      );

    expect(await set("balanced", mine)).toMatchObject({
      code: "23514",
      constraint: "users_default_appearance_preset_check",
    });
    expect(await set(null, null)).toMatchObject({
      constraint: "users_default_appearance_preset_check",
    });
    expect(await set("classic", null)).toMatchObject({
      constraint: "users_default_builtin_appearance_preset_check",
    });
    // Another account's preset, even written directly, is refused by the composite key.
    expect(await set(null, theirs)).toMatchObject({
      code: "23503",
      constraint: "users_default_appearance_preset_fk",
    });
    for (const builtin of ["minimal", "balanced", "expressive"]) {
      expect(await set(builtin, null)).toBeNull();
    }
    expect(await set(null, mine)).toBeNull();
    expect(
      await refusal(`update users set appearance_default_revision = 0 where id = $1`, [me]),
    ).toMatchObject({ constraint: "users_appearance_default_revision_check" });

    // The chosen preset cannot be deleted from under the default, nor its owner deleted.
    expect(await refusal(`delete from appearance_presets where id = $1`, [mine])).toMatchObject({
      code: "23001",
    });
    expect(await refusal(`delete from users where id = $1`, [other])).toMatchObject({
      code: "23001",
    });
    // Cleared first, both go (as account deletion does it).
    await set("balanced", null);
    expect(await refusal(`delete from appearance_presets where id = $1`, [mine])).toBeNull();
  });

  it("keeps operation records to one per owner and operation", async () => {
    const insert = `insert into appearance_preset_operations (owner_id, operation_id, kind, preset_id, fingerprint) values ($1, $2, $3, $4, $5)`;
    const op = "11111111-1111-4111-8111-111111111111";
    const print = "a".repeat(64);
    expect(await refusal(insert, [me, op, "create", op, print])).toBeNull();
    expect(await refusal(insert, [me, op, "create", op, print])).toMatchObject({ code: "23505" });
    expect(await refusal(insert, [other, op, "duplicate", op, print])).toBeNull();
    expect(await refusal(insert, [me, op.replace("1", "2"), "rename", op, print])).toMatchObject({
      constraint: "appearance_preset_operations_kind_check",
    });
    expect(await refusal(insert, [me, op.replace("1", "3"), "create", op, "short"])).toMatchObject({
      constraint: "appearance_preset_operations_fingerprint_check",
    });
  });
});
