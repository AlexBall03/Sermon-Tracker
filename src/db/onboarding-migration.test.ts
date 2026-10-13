// @vitest-environment node
import { readFileSync } from "node:fs";

import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

/*
 * Migration 0014 (Phase 4A) on a database that already holds accounts: every
 * migration before it is applied, accounts are saved with roles, statuses,
 * preferences, and profiles, and then 0014 runs. Each of them must come out
 * owing no setup and otherwise exactly as it was, and an account made
 * afterwards, as the code live during the migration would make it, must owe
 * setup.
 */

const tag = "0014_onboarding_lifecycle";

type Journal = { entries: { tag: string }[] };
const journal = JSON.parse(readFileSync("./drizzle/meta/_journal.json", "utf8")) as Journal;
const tags = journal.entries.map((entry) => entry.tag);

async function apply(pg: PGlite, migration: string) {
  const file = readFileSync(`./drizzle/${migration}.sql`, "utf8");
  for (const statement of file.split("--> statement-breakpoint")) {
    if (statement.trim()) await pg.exec(statement);
  }
}

type Row = Record<string, unknown> & { clerk_user_id: string };

const before = `id, clerk_user_id, role, status, locale, bible_translation, church_name,
                ministry_role, attends_preaching_class, created_at, updated_at`;

let pg: PGlite;
let earlier: Row[];

const accounts = async (columns: string) =>
  (await pg.query<Row>(`select ${columns} from users order by clerk_user_id`)).rows;

beforeAll(async () => {
  pg = new PGlite();
  const index = tags.indexOf(tag);
  expect(index).toBeGreaterThan(0);
  for (const previous of tags.slice(0, index)) await apply(pg, previous);

  await pg.exec(`
    insert into users (clerk_user_id, role, status, locale, bible_translation, church_name,
                       ministry_role, attends_preaching_class, created_at, updated_at)
    values
      ('user_admin', 'admin', 'active', 'en', null, 'Grace Baptist Church', 'Pastor', true,
       '2026-01-05T10:00:00Z', '2026-09-01T10:00:00Z'),
      ('user_blank', 'user', 'active', 'en', null, null, null, false,
       '2026-10-12T10:00:00Z', '2026-10-12T10:00:00Z'),
      ('user_disabled', 'user', 'disabled', 'es', 'kjv', null, 'Evangelista', false,
       '2026-03-01T10:00:00Z', '2026-03-02T10:00:00Z'),
      ('user_spanish', 'user', 'active', 'es', 'rvg', 'Iglesia Bautista', null, true,
       '2026-06-01T10:00:00Z', '2026-06-01T10:00:00Z');
  `);
  earlier = await accounts(before);
  await apply(pg, tag);
});

describe("migration 0014", () => {
  it("leaves every account that existed owing no setup", async () => {
    const rows = await accounts(
      "clerk_user_id, onboarding_status, onboarding_step, onboarding_completed_at, tour_state",
    );
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(row).toMatchObject({
        onboarding_status: "grandfathered",
        onboarding_step: "welcome",
        onboarding_completed_at: null,
        tour_state: "not_offered",
      });
    }
  });

  it("changes nothing else about them, whatever they had or had not filled in", async () => {
    expect(await accounts(before)).toEqual(earlier);
  });

  it("makes an account created afterwards owe setup, as the code live then inserts it", async () => {
    // The release before this one names none of the new columns.
    await pg.exec(
      `insert into users (clerk_user_id, role, locale) values ('user_new', 'user', 'en')`,
    );
    const [row] = (
      await pg.query<Row>(
        `select onboarding_status, onboarding_step, onboarding_completed_at, tour_state
         from users where clerk_user_id = 'user_new'`,
      )
    ).rows;
    expect(row).toEqual({
      onboarding_status: "pending",
      onboarding_step: "welcome",
      onboarding_completed_at: null,
      tour_state: "not_offered",
    });
    // And the accounts that were there are still not sent through it.
    const [{ pending }] = (
      await pg.query<{ pending: number }>(
        `select count(*)::int as pending from users where onboarding_status = 'pending'`,
      )
    ).rows;
    expect(pending).toBe(1);
  });

  it("refuses a status, a step, or a tour state that is not one", async () => {
    const set = (assignment: string) =>
      pg.exec(`update users set ${assignment} where clerk_user_id = 'user_blank'`);
    await expect(set("onboarding_status = 'skipped'")).rejects.toThrow();
    await expect(set("onboarding_step = 'tour'")).rejects.toThrow();
    await expect(set("tour_state = 'started'")).rejects.toThrow();
  });

  it("refuses finished without a date, and a date without finished", async () => {
    const set = (assignment: string) =>
      pg.exec(`update users set ${assignment} where clerk_user_id = 'user_blank'`);
    await expect(set("onboarding_status = 'completed'")).rejects.toThrow();
    await expect(set("onboarding_completed_at = now()")).rejects.toThrow();
    await set("onboarding_status = 'completed', onboarding_completed_at = now()");
  });
});
