// @vitest-environment node
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { appearancePresets, users } from "@/db/schema";
import type { Database } from "@/db/types";
import type { AppearanceSnapshot } from "@/features/editor-lab/styles/snapshot";
import {
  accountDefaultOf,
  clearAccountDefault,
  getAccountDefault,
  resolveAccountDefault,
  setAccountDefault,
} from "./defaults";
import { prepareAppearance } from "./model";
import { createPreset, deletePreset, renamePreset } from "./presets";
import { recordingDatabase, seedAccount } from "./testing";

/*
 * An account's default appearance (A4.2B, checkpoint D) on an in-memory
 * PostgreSQL: every target, stale and repeated changes, another account's
 * preset, and deleting the preset that is the default, with the account's
 * row read back after each.
 */

let db: Database;
let statements: string[];
let me: string;
let other: string;

const balanced: AppearanceSnapshot = {
  version: 1,
  preset: "balanced",
  presetRevision: 2,
  numbering: { version: 1, preset: "decimal" },
};

async function make(owner: string, name: string) {
  const outcome = await createPreset(db, owner, {
    operationId: crypto.randomUUID(),
    name,
    appearance: { ...balanced, preset: "minimal" },
  });
  if (outcome.status !== "created") throw new Error(outcome.status);
  return outcome.id;
}

const columns = async (owner: string) => {
  const [row] = await db
    .select({
      builtin: users.defaultBuiltinAppearancePreset,
      personal: users.defaultPersonalAppearancePresetId,
      revision: users.appearanceDefaultRevision,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(eq(users.id, owner));
  return row;
};

beforeEach(async () => {
  ({ db, statements } = await recordingDatabase());
  me = await seedAccount(db, "user_me");
  other = await seedAccount(db, "user_other");
});

describe("the default", () => {
  it("is built-in Balanced at revision 1 for a new account", async () => {
    expect(await getAccountDefault(db, me)).toEqual({
      target: { kind: "builtin", preset: "balanced" },
      revision: 1,
    });
    expect(await resolveAccountDefault(db, me)).toEqual({
      source: "builtin",
      preset: "balanced",
      revision: 1,
    });
  });

  it("is read from the account row a request already holds", async () => {
    const [row] = await db.select().from(users).where(eq(users.id, me));
    expect(accountDefaultOf(row)).toEqual({
      target: { kind: "builtin", preset: "balanced" },
      revision: 1,
    });
  });

  it("can be each built-in preset, one revision at a time", async () => {
    let revision = 1;
    for (const preset of ["minimal", "expressive", "balanced"] as const) {
      const outcome = await setAccountDefault(db, me, {
        target: { kind: "builtin", preset },
        expectedRevision: revision,
      });
      revision += 1;
      expect(outcome).toEqual({
        status: "updated",
        default: { target: { kind: "builtin", preset }, revision },
      });
      expect(await columns(me)).toMatchObject({ builtin: preset, personal: null, revision });
    }
  });

  it("can be one of the account's own presets, resolved to its snapshot to copy", async () => {
    const id = await make(me, "Mine");
    expect(
      await setAccountDefault(db, me, {
        target: { kind: "personal", presetId: id },
        expectedRevision: 1,
      }),
    ).toEqual({
      status: "updated",
      default: { target: { kind: "personal", presetId: id }, revision: 2 },
    });
    expect(await columns(me)).toMatchObject({ builtin: null, personal: id, revision: 2 });
    const prepared = prepareAppearance({ ...balanced, preset: "minimal" });
    if (!prepared.ok) throw new Error("refused");
    expect(await resolveAccountDefault(db, me)).toEqual({
      source: "personal",
      presetId: id,
      snapshot: prepared.snapshot,
      revision: 2,
    });
    // Renaming it changes nothing about the default.
    await renamePreset(db, me, { id, expectedRevision: 1, name: "Renamed" });
    expect(await columns(me)).toMatchObject({ personal: id, revision: 2 });
  });

  it("refuses another account's preset and one that does not exist, changing nothing", async () => {
    const theirs = await make(other, "Theirs");
    const before = await columns(me);
    for (const presetId of [theirs, "99999999-9999-4999-8999-999999999999"]) {
      expect(
        await setAccountDefault(db, me, {
          target: { kind: "personal", presetId },
          expectedRevision: 1,
        }),
      ).toEqual({ status: "not_found" });
    }
    expect(await columns(me)).toEqual(before);
  });

  it("refuses a stale revision, even for the default it already is", async () => {
    await setAccountDefault(db, me, {
      target: { kind: "builtin", preset: "minimal" },
      expectedRevision: 1,
    });
    const before = await columns(me);
    for (const preset of ["minimal", "expressive"] as const) {
      expect(
        await setAccountDefault(db, me, {
          target: { kind: "builtin", preset },
          expectedRevision: 1,
        }),
      ).toEqual({
        status: "conflict",
        default: { target: { kind: "builtin", preset: "minimal" }, revision: 2 },
      });
    }
    expect(await columns(me)).toEqual(before);
  });

  it("writes nothing when it is already what was asked", async () => {
    const before = await columns(me);
    statements.length = 0;
    expect(
      await setAccountDefault(db, me, {
        target: { kind: "builtin", preset: "balanced" },
        expectedRevision: 1,
      }),
    ).toMatchObject({ status: "unchanged" });
    expect(statements.some((statement) => statement.startsWith("update"))).toBe(false);
    expect(await columns(me)).toEqual(before);
  });

  it("clears to built-in Balanced", async () => {
    const id = await make(me, "Mine");
    await setAccountDefault(db, me, {
      target: { kind: "personal", presetId: id },
      expectedRevision: 1,
    });
    expect(await clearAccountDefault(db, me, 2)).toEqual({
      status: "updated",
      default: { target: { kind: "builtin", preset: "balanced" }, revision: 3 },
    });
    expect(await columns(me)).toMatchObject({ builtin: "balanced", personal: null });
  });

  it("refuses an account that may not change it", async () => {
    for (const state of ["disabled", "deleting", "pending"] as const) {
      const account = await seedAccount(db, `user_${state}`, state);
      expect(
        await setAccountDefault(db, account, {
          target: { kind: "builtin", preset: "minimal" },
          expectedRevision: 1,
        }),
      ).toEqual({ status: "account_unavailable" });
      expect(await columns(account)).toMatchObject({ builtin: "balanced", revision: 1 });
    }
  });

  it("locks the account's row before the preset's", async () => {
    const id = await make(me, "Mine");
    statements.length = 0;
    await setAccountDefault(db, me, {
      target: { kind: "personal", presetId: id },
      expectedRevision: 1,
    });
    const account = statements.findIndex((s) => /from "users" .* for no key update/.test(s));
    const preset = statements.findIndex((s) =>
      /from "appearance_presets" .* for key share/.test(s),
    );
    expect(account).toBeGreaterThan(-1);
    expect(preset).toBeGreaterThan(account);
  });
});

describe("deleting a preset", () => {
  it("that is not the default leaves the default alone", async () => {
    const chosen = await make(me, "Chosen");
    const spare = await make(me, "Spare");
    await setAccountDefault(db, me, {
      target: { kind: "personal", presetId: chosen },
      expectedRevision: 1,
    });
    expect(await deletePreset(db, me, { id: spare, expectedRevision: 1 })).toEqual({
      status: "deleted",
      defaultReset: false,
      defaultRevision: 2,
    });
    expect(await columns(me)).toMatchObject({ personal: chosen, revision: 2 });
  });

  it("that is the default puts the account back on Balanced in the same transaction", async () => {
    const chosen = await make(me, "Chosen");
    await setAccountDefault(db, me, {
      target: { kind: "personal", presetId: chosen },
      expectedRevision: 1,
    });
    expect(await deletePreset(db, me, { id: chosen, expectedRevision: 1 })).toEqual({
      status: "deleted",
      defaultReset: true,
      defaultRevision: 3,
    });
    expect(await columns(me)).toMatchObject({ builtin: "balanced", personal: null, revision: 3 });
    expect(await db.select().from(appearancePresets)).toEqual([]);
    // A change named against the default before is now stale.
    expect(
      await setAccountDefault(db, me, {
        target: { kind: "builtin", preset: "minimal" },
        expectedRevision: 2,
      }),
    ).toMatchObject({ status: "conflict" });
  });

  it("that is the default, at a stale revision, changes neither", async () => {
    const chosen = await make(me, "Chosen");
    await setAccountDefault(db, me, {
      target: { kind: "personal", presetId: chosen },
      expectedRevision: 1,
    });
    const before = await columns(me);
    expect(await deletePreset(db, me, { id: chosen, expectedRevision: 5 })).toEqual({
      status: "conflict",
      revision: 1,
    });
    expect(await columns(me)).toEqual(before);
    expect(await db.select().from(appearancePresets)).toHaveLength(1);
  });

  it("that is the default, failing part way, leaves the default as it was", async () => {
    const chosen = await make(me, "Chosen");
    await setAccountDefault(db, me, {
      target: { kind: "personal", presetId: chosen },
      expectedRevision: 1,
    });
    const before = await columns(me);
    await db.execute(sql`
      create function refuse() returns trigger language plpgsql as $$
      begin raise exception 'refused for the test'; end $$`);
    await db.execute(sql`
      create trigger refuse before delete on appearance_presets
      for each row execute function refuse()`);
    await expect(deletePreset(db, me, { id: chosen, expectedRevision: 1 })).rejects.toThrow();
    expect(await columns(me)).toEqual(before);
    expect(await db.select().from(appearancePresets)).toHaveLength(1);
  });

  it("is refused by the database itself if the default were not cleared first", async () => {
    const chosen = await make(me, "Chosen");
    await setAccountDefault(db, me, {
      target: { kind: "personal", presetId: chosen },
      expectedRevision: 1,
    });
    await expect(
      db.delete(appearancePresets).where(eq(appearancePresets.id, chosen)),
    ).rejects.toThrow();
    expect(await columns(me)).toMatchObject({ personal: chosen });
  });
});

describe("a personal default that no longer parses", () => {
  it("is reported, never quietly replaced", async () => {
    const chosen = await make(me, "Chosen");
    await setAccountDefault(db, me, {
      target: { kind: "personal", presetId: chosen },
      expectedRevision: 1,
    });
    await db
      .update(appearancePresets)
      .set({ appearance: { version: 9 } as never })
      .where(eq(appearancePresets.id, chosen));
    expect(await resolveAccountDefault(db, me)).toEqual({
      source: "unreadable",
      presetId: chosen,
      revision: 2,
    });
    expect(await columns(me)).toMatchObject({ personal: chosen });
  });
});
