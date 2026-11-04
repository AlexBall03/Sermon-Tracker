// @vitest-environment node
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { appearancePresetOperations, appearancePresets, users } from "@/db/schema";
import type { Database } from "@/db/types";
import type { AppearanceSnapshot } from "@/features/editor-lab/styles/snapshot";
import { prepareAppearance, presetLimits } from "./model";
import {
  constraintOutcome,
  createPreset,
  deletePreset,
  duplicatePreset,
  getPreset,
  listPresets,
  renamePreset,
  replacePresetAppearance,
} from "./presets";
import { recordingDatabase, seedAccount } from "./testing";

/*
 * The preset service on an in-memory PostgreSQL with the committed
 * migrations (A4.2B, checkpoints C and E). PGlite is one connection, so true
 * races are not here: they ran on a disposable multi-connection PostgreSQL
 * (docs/HANDOFF-PS-A4.2B.md). Here: every outcome, the state the database is
 * left in after each, and the order of the locks each change takes.
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
const expressive: AppearanceSnapshot = { ...balanced, preset: "expressive" };
const materialized = (snapshot: AppearanceSnapshot) => {
  const prepared = prepareAppearance(snapshot);
  if (!prepared.ok) throw new Error("refused");
  return prepared.snapshot;
};

const op = () => crypto.randomUUID();
const nowhere = "99999999-9999-4999-8999-999999999999";

async function make(owner: string, name: string, appearance: unknown = balanced) {
  const outcome = await createPreset(db, owner, { operationId: op(), name, appearance });
  if (outcome.status !== "created") throw new Error(outcome.status);
  return outcome.id;
}

const rowsOf = (owner: string) =>
  db.select().from(appearancePresets).where(eq(appearancePresets.ownerId, owner));
const rowOf = async (id: string) =>
  (await db.select().from(appearancePresets).where(eq(appearancePresets.id, id)))[0];
const count = async (owner: string) => (await rowsOf(owner)).length;

beforeEach(async () => {
  ({ db, statements } = await recordingDatabase());
  me = await seedAccount(db, "user_me");
  other = await seedAccount(db, "user_other");
});

describe("create", () => {
  it("saves the materialized snapshot at revision 1 and remembers the operation", async () => {
    const operationId = op();
    const outcome = await createPreset(db, me, {
      operationId,
      name: "  Sunday Morning ",
      appearance: balanced,
    });
    expect(outcome).toMatchObject({ status: "created", replayed: false });
    if (outcome.status !== "created") return;
    expect(outcome.preset).toMatchObject({
      id: outcome.id,
      name: "Sunday Morning",
      revision: 1,
      basePreset: "balanced",
    });
    const row = await rowOf(outcome.id);
    expect(row.ownerId).toBe(me);
    expect(row.appearance).toEqual(materialized(balanced));
    const [ledger] = await db.select().from(appearancePresetOperations);
    expect(ledger).toMatchObject({
      ownerId: me,
      operationId,
      kind: "create",
      presetId: outcome.id,
    });
    expect(Object.keys(ledger)).not.toContain("appearance");
  });

  it("refuses an invalid appearance before any statement is sent", async () => {
    statements.length = 0;
    expect(
      await createPreset(db, me, {
        operationId: op(),
        name: "Bad",
        appearance: { ...balanced, version: 2 },
      }),
    ).toEqual({ status: "invalid" });
    expect(statements).toEqual([]);
    expect(await count(me)).toBe(0);
  });

  it("refuses a name the account already has in any case, and allows it to another account", async () => {
    await make(me, "Sunday Morning");
    expect(
      await createPreset(db, me, {
        operationId: op(),
        name: "SUNDAY morning",
        appearance: balanced,
      }),
    ).toEqual({ status: "duplicate_name" });
    expect(await count(me)).toBe(1);
    await make(other, "Sunday Morning");
    expect(await count(other)).toBe(1);
  });

  it("keeps an account to 100 presets", async () => {
    await db.insert(appearancePresets).values(
      Array.from({ length: presetLimits.perAccount - 1 }, (_, index) => ({
        ownerId: me,
        name: `Preset ${index}`,
        appearance: materialized(balanced),
      })),
    );
    await make(me, "The hundredth");
    expect(
      await createPreset(db, me, { operationId: op(), name: "One more", appearance: balanced }),
    ).toEqual({ status: "limit_reached", limit: 100 });
    expect(await count(me)).toBe(100);
    // The limit is per account.
    await make(other, "Mine");
  });

  it("refuses an account that may not change presets, writing nothing", async () => {
    for (const state of ["disabled", "deleting", "pending"] as const) {
      const account = await seedAccount(db, `user_${state}`, state);
      expect(
        await createPreset(db, account, { operationId: op(), name: "A", appearance: balanced }),
      ).toEqual({ status: "account_unavailable" });
      expect(await count(account)).toBe(0);
    }
    expect(
      await createPreset(db, nowhere, { operationId: op(), name: "A", appearance: balanced }),
    ).toEqual({ status: "account_unavailable" });
  });
});

describe("list and get", () => {
  it("list metadata only, in name order whatever the case, a bounded page at a time", async () => {
    await make(me, "beta");
    await make(me, "Alpha", expressive);
    await make(me, "gamma");
    await make(other, "Aardvark");
    statements.length = 0;
    const page = await listPresets(db, me, { page: 1, pageSize: 2 });
    expect(statements).toHaveLength(1);
    expect(page.total).toBe(3);
    expect(page.items.map((item) => item.name)).toEqual(["Alpha", "beta"]);
    expect(page.items[0]).toMatchObject({ basePreset: "expressive", revision: 1 });
    expect(page.items[0]).not.toHaveProperty("appearance");
    expect(statements[0]).not.toContain('"appearance" from');

    const second = await listPresets(db, me, { page: 2, pageSize: 2 });
    expect(second.items.map((item) => item.name)).toEqual(["gamma"]);
    expect(second.total).toBe(3);
    const past = await listPresets(db, me, { page: 9, pageSize: 2 });
    expect(past).toMatchObject({ items: [], total: 3 });

    const full = await listPresets(db, me, { page: 1, pageSize: 100, withAppearance: true });
    expect(full.items[0].appearance).toEqual(materialized(expressive));
    // Never more than the largest page.
    expect((await listPresets(db, me, { page: 1, pageSize: 10_000 })).pageSize).toBe(100);
  });

  it("get the account's own preset; another account's is the same as none", async () => {
    const mine = await make(me, "Mine");
    const theirs = await make(other, "Theirs");
    expect(await getPreset(db, me, mine)).toMatchObject({
      status: "found",
      preset: { id: mine, name: "Mine", appearance: materialized(balanced) },
    });
    expect(await getPreset(db, me, theirs)).toEqual({ status: "not_found" });
    expect(await getPreset(db, me, nowhere)).toEqual({ status: "not_found" });
  });

  it("report a stored appearance that no longer parses as unreadable, without it", async () => {
    const id = await make(me, "Old");
    await db
      .update(appearancePresets)
      .set({ appearance: { version: 9 } as never })
      .where(eq(appearancePresets.id, id));
    const outcome = await getPreset(db, me, id);
    expect(outcome).toMatchObject({ status: "unreadable", preset: { id, name: "Old" } });
    expect(JSON.stringify(outcome)).not.toContain("version");
    const listed = await listPresets(db, me, { page: 1, pageSize: 10, withAppearance: true });
    expect(listed.items[0].appearance).toBeNull();
  });
});

describe("rename", () => {
  it("changes the name and the revision only", async () => {
    const id = await make(me, "Old");
    const before = await rowOf(id);
    const outcome = await renamePreset(db, me, { id, expectedRevision: 1, name: "New" });
    expect(outcome).toMatchObject({ status: "updated", preset: { name: "New", revision: 2 } });
    const after = await rowOf(id);
    expect(after.appearance).toEqual(before.appearance);
    expect(after.createdAt).toEqual(before.createdAt);
  });

  it("writes nothing for the name it already has, and refuses a stale revision even then", async () => {
    const id = await make(me, "Same");
    const before = await rowOf(id);
    expect(await renamePreset(db, me, { id, expectedRevision: 1, name: "Same" })).toMatchObject({
      status: "unchanged",
      preset: { revision: 1 },
    });
    expect(await rowOf(id)).toEqual(before);
    expect(await renamePreset(db, me, { id, expectedRevision: 2, name: "Same" })).toEqual({
      status: "conflict",
      revision: 1,
    });
    expect(await renamePreset(db, me, { id, expectedRevision: 2, name: "Other" })).toEqual({
      status: "conflict",
      revision: 1,
    });
    expect(await rowOf(id)).toEqual(before);
  });

  it("allows a change of case only, and refuses another preset's name", async () => {
    const id = await make(me, "grace");
    await make(me, "Mercy");
    expect(await renamePreset(db, me, { id, expectedRevision: 1, name: "Grace" })).toMatchObject({
      status: "updated",
      preset: { name: "Grace", revision: 2 },
    });
    expect(await renamePreset(db, me, { id, expectedRevision: 2, name: "MERCY" })).toEqual({
      status: "duplicate_name",
    });
    expect((await rowOf(id)).name).toBe("Grace");
  });

  it("cannot reach another account's preset", async () => {
    const theirs = await make(other, "Theirs");
    expect(await renamePreset(db, me, { id: theirs, expectedRevision: 1, name: "Mine" })).toEqual({
      status: "not_found",
    });
    expect((await rowOf(theirs)).name).toBe("Theirs");
  });
});

describe("replace the appearance", () => {
  it("stores the new materialized appearance and keeps the name", async () => {
    const id = await make(me, "Look");
    const outcome = await replacePresetAppearance(db, me, {
      id,
      expectedRevision: 1,
      appearance: expressive,
    });
    expect(outcome).toMatchObject({
      status: "updated",
      preset: { name: "Look", revision: 2, basePreset: "expressive" },
    });
    expect((await rowOf(id)).appearance).toEqual(materialized(expressive));
  });

  it("writes nothing for the same appearance, in any key order", async () => {
    const id = await make(me, "Look");
    const before = await rowOf(id);
    const reordered = Object.fromEntries(Object.entries(balanced).reverse());
    expect(
      await replacePresetAppearance(db, me, { id, expectedRevision: 1, appearance: reordered }),
    ).toMatchObject({ status: "unchanged" });
    expect(await rowOf(id)).toEqual(before);
  });

  it("refuses an invalid appearance, a stale revision, and another account's preset", async () => {
    const id = await make(me, "Look");
    const theirs = await make(other, "Theirs");
    expect(
      await replacePresetAppearance(db, me, {
        id,
        expectedRevision: 1,
        appearance: { ...balanced, sermon: "text" },
      }),
    ).toEqual({ status: "invalid" });
    expect(
      await replacePresetAppearance(db, me, { id, expectedRevision: 3, appearance: expressive }),
    ).toEqual({ status: "conflict", revision: 1 });
    expect(
      await replacePresetAppearance(db, me, {
        id: theirs,
        expectedRevision: 1,
        appearance: expressive,
      }),
    ).toEqual({ status: "not_found" });
    expect((await rowOf(id)).revision).toBe(1);
    expect((await rowOf(theirs)).appearance).toEqual(materialized(balanced));
  });
});

describe("duplicate", () => {
  it("makes an independent copy at revision 1 and leaves the source as it was", async () => {
    const source = await make(me, "Source", expressive);
    const before = await rowOf(source);
    const outcome = await duplicatePreset(db, me, {
      operationId: op(),
      sourceId: source,
      name: "Copy",
    });
    expect(outcome).toMatchObject({ status: "created", preset: { name: "Copy", revision: 1 } });
    if (outcome.status !== "created") return;
    expect(outcome.id).not.toBe(source);
    expect((await rowOf(outcome.id)).appearance).toEqual(before.appearance);
    expect(await rowOf(source)).toEqual(before);

    await replacePresetAppearance(db, me, {
      id: source,
      expectedRevision: 1,
      appearance: balanced,
    });
    expect((await rowOf(outcome.id)).appearance).toEqual(materialized(expressive));
  });

  it("refuses a missing or foreign source, and a taken name, revealing nothing", async () => {
    const theirs = await make(other, "Theirs");
    const mine = await make(me, "Mine");
    for (const sourceId of [theirs, nowhere]) {
      expect(await duplicatePreset(db, me, { operationId: op(), sourceId, name: "Copy" })).toEqual({
        status: "not_found",
      });
    }
    expect(
      await duplicatePreset(db, me, { operationId: op(), sourceId: mine, name: "mine" }),
    ).toEqual({ status: "duplicate_name" });
    expect(await count(me)).toBe(1);
    expect(await count(other)).toBe(1);
  });
});

describe("delete", () => {
  it("removes a preset at the revision named, and refuses a stale or foreign one", async () => {
    const id = await make(me, "Gone");
    const theirs = await make(other, "Theirs");
    expect(await deletePreset(db, me, { id, expectedRevision: 2 })).toEqual({
      status: "conflict",
      revision: 1,
    });
    expect(await rowOf(id)).toBeDefined();
    expect(await deletePreset(db, me, { id: theirs, expectedRevision: 1 })).toEqual({
      status: "not_found",
    });
    expect(await rowOf(theirs)).toBeDefined();
    expect(await deletePreset(db, me, { id, expectedRevision: 1 })).toEqual({
      status: "deleted",
      defaultReset: false,
      defaultRevision: 1,
    });
    expect(await rowOf(id)).toBeUndefined();
    expect(await deletePreset(db, me, { id, expectedRevision: 1 })).toEqual({
      status: "not_found",
    });
  });
});

describe("retries and operation identity", () => {
  it("answer a create sent again with the preset it made, and make no second", async () => {
    const operationId = op();
    const request = { operationId, name: "Once", appearance: balanced };
    const first = await createPreset(db, me, request);
    const again = await createPreset(db, me, request);
    expect(again).toMatchObject({ status: "created", replayed: true });
    if (first.status !== "created" || again.status !== "created") return;
    expect(again.id).toBe(first.id);
    expect(await count(me)).toBe(1);
  });

  it("refuse an operation ID reused for a different request", async () => {
    const operationId = op();
    const id = await (async () => {
      const outcome = await createPreset(db, me, {
        operationId,
        name: "Once",
        appearance: balanced,
      });
      return outcome.status === "created" ? outcome.id : "";
    })();
    expect(
      await createPreset(db, me, { operationId, name: "Twice", appearance: balanced }),
    ).toEqual({ status: "operation_reused" });
    expect(
      await createPreset(db, me, { operationId, name: "Once", appearance: expressive }),
    ).toEqual({ status: "operation_reused" });
    expect(await duplicatePreset(db, me, { operationId, sourceId: id, name: "Once" })).toEqual({
      status: "operation_reused",
    });
    expect(await count(me)).toBe(1);
  });

  it("never let an old retry undo a rename or a replacement made since", async () => {
    const operationId = op();
    const request = { operationId, name: "Original", appearance: balanced };
    const first = await createPreset(db, me, request);
    if (first.status !== "created") throw new Error("not created");
    await renamePreset(db, me, { id: first.id, expectedRevision: 1, name: "Renamed" });
    await replacePresetAppearance(db, me, {
      id: first.id,
      expectedRevision: 2,
      appearance: expressive,
    });

    const retry = await createPreset(db, me, request);
    expect(retry).toMatchObject({
      status: "created",
      replayed: true,
      id: first.id,
      preset: { name: "Renamed", revision: 3, basePreset: "expressive" },
    });
    const row = await rowOf(first.id);
    expect(row).toMatchObject({ name: "Renamed", revision: 3 });
    expect(row.appearance).toEqual(materialized(expressive));
    expect(await count(me)).toBe(1);
  });

  it("never bring back a preset deleted since its create", async () => {
    const request = { operationId: op(), name: "Brief", appearance: balanced };
    const first = await createPreset(db, me, request);
    if (first.status !== "created") throw new Error("not created");
    await deletePreset(db, me, { id: first.id, expectedRevision: 1 });
    expect(await createPreset(db, me, request)).toEqual({
      status: "created",
      replayed: true,
      id: first.id,
      preset: null,
    });
    expect(await count(me)).toBe(0);
  });

  it("answer a duplicate sent again with the copy it made", async () => {
    const source = await make(me, "Source");
    const request = { operationId: op(), sourceId: source, name: "Copy" };
    const first = await duplicatePreset(db, me, request);
    const again = await duplicatePreset(db, me, request);
    expect(again).toMatchObject({ status: "created", replayed: true });
    if (first.status !== "created" || again.status !== "created") return;
    expect(again.id).toBe(first.id);
    expect(await count(me)).toBe(2);
  });

  it("keep one account's operation IDs apart from another's", async () => {
    const operationId = op();
    const mine = await createPreset(db, me, { operationId, name: "Same", appearance: balanced });
    const theirs = await createPreset(db, other, {
      operationId,
      name: "Different",
      appearance: expressive,
    });
    expect(theirs).toMatchObject({ status: "created", replayed: false });
    if (mine.status !== "created" || theirs.status !== "created") return;
    expect(theirs.id).not.toBe(mine.id);
    expect((await rowOf(mine.id)).name).toBe("Same");
  });

  it("remember an operation for at least 30 days, and only then forget it, altering no preset", async () => {
    const recent = { operationId: op(), name: "Recent", appearance: balanced };
    const old = { operationId: op(), name: "Old", appearance: balanced };
    const recentMade = await createPreset(db, me, recent);
    const oldMade = await createPreset(db, me, old);
    if (recentMade.status !== "created" || oldMade.status !== "created") throw new Error("x");
    const age = (operationId: string, days: number) =>
      db
        .update(appearancePresetOperations)
        .set({ createdAt: sql`now() - make_interval(days => ${days})` })
        .where(eq(appearancePresetOperations.operationId, operationId));
    await age(recent.operationId, 29);
    await age(old.operationId, 31);

    // A record past retention is still answered until something prunes it.
    expect(await createPreset(db, me, old)).toMatchObject({ replayed: true, id: oldMade.id });
    // The account's next new create prunes it; the 29-day one stays.
    await make(me, "Trigger");
    const left = await db.select().from(appearancePresetOperations);
    expect(left.map((row) => row.operationId)).not.toContain(old.operationId);
    expect(left.map((row) => row.operationId)).toContain(recent.operationId);
    expect(await createPreset(db, me, recent)).toMatchObject({ replayed: true, id: recentMade.id });

    // Forgotten, the same request is a new create: a new name clash, never a change to "Old".
    const before = await rowOf(oldMade.id);
    expect(await createPreset(db, me, old)).toEqual({ status: "duplicate_name" });
    expect(await rowOf(oldMade.id)).toEqual(before);
  });
});

describe("failures", () => {
  it("leave nothing behind when a create fails part way", async () => {
    await db.execute(sql`
      create function refuse() returns trigger language plpgsql as $$
      begin raise exception 'refused for the test'; end $$`);
    await db.execute(sql`
      create trigger refuse before insert on appearance_preset_operations
      for each row execute function refuse()`);
    await expect(
      createPreset(db, me, { operationId: op(), name: "Half", appearance: balanced }),
    ).rejects.toThrow();
    expect(await count(me)).toBe(0);
  });

  it("map a constraint's refusal only after its transaction ended", async () => {
    await make(me, "Taken");
    const refusal = async (work: Promise<unknown>) =>
      work.then(
        () => null,
        (error) => error,
      );
    const unique = await refusal(
      db.insert(appearancePresets).values({ ownerId: me, name: "TAKEN", appearance: {} as never }),
    );
    expect(constraintOutcome(unique)).toEqual({ status: "duplicate_name" });
    const oversized = await refusal(
      db.execute(
        sql`insert into appearance_presets (owner_id, name, appearance) values (${me}, 'Big', ${JSON.stringify({ p: "x".repeat(70_000) })}::jsonb)`,
      ),
    );
    expect(constraintOutcome(oversized)).toEqual({ status: "too_large" });
    const other = await refusal(
      db.execute(
        sql`insert into appearance_presets (owner_id, name, appearance) values (${me}, '', '{}')`,
      ),
    );
    expect(constraintOutcome(other)).toBeNull();
  });

  it("send no statement inside a transaction after a constraint refused one", async () => {
    // A name taken behind the check's back (as a parallel request would): the index decides.
    statements.length = 0;
    await db.execute(sql`
      create function sneak() returns trigger language plpgsql as $$
      begin
        insert into appearance_presets (owner_id, name, appearance) values (new.owner_id, new.name, new.appearance);
        return new;
      end $$`);
    await db.execute(sql`
      create trigger sneak before insert on appearance_presets
      for each row when (pg_trigger_depth() = 0) execute function sneak()`);
    statements.length = 0;
    expect(
      await createPreset(db, me, { operationId: op(), name: "Raced", appearance: balanced }),
    ).toEqual({ status: "duplicate_name" });
    const failed = statements.findIndex((statement) =>
      statement.startsWith('insert into "appearance_presets"'),
    );
    expect(failed).toBeGreaterThan(-1);
    // Nothing after the refused insert but the rollback itself.
    expect(
      statements.slice(failed + 1).filter((statement) => !/^rollback/i.test(statement)),
    ).toEqual([]);
    expect(await count(me)).toBe(0);
  });
});

describe("locks", () => {
  it("take the account's row first and the preset's second, for every change", async () => {
    const id = await make(me, "Locked");
    const changes: (() => Promise<unknown>)[] = [
      () => renamePreset(db, me, { id, expectedRevision: 1, name: "L2" }),
      () => replacePresetAppearance(db, me, { id, expectedRevision: 2, appearance: expressive }),
      () => deletePreset(db, me, { id, expectedRevision: 3 }),
    ];
    for (const change of changes) {
      statements.length = 0;
      await change();
      const account = statements.findIndex((statement) =>
        /from "users" where "users"\."id" = \$1 for no key update/.test(statement),
      );
      const preset = statements.findIndex((statement) =>
        /from "appearance_presets" .* for update/.test(statement),
      );
      expect(account).toBeGreaterThan(-1);
      expect(preset).toBeGreaterThan(account);
    }
    statements.length = 0;
    await make(me, "Created");
    expect(statements.findIndex((statement) => /for no key update/.test(statement))).toBe(
      statements.findIndex((statement) => /select/.test(statement)),
    );
  });

  it("take none to read", async () => {
    await make(me, "Read");
    statements.length = 0;
    await listPresets(db, me, { page: 1, pageSize: 25 });
    expect(statements.join("\n")).not.toMatch(/for (update|no key update|share|key share)/);
  });
});

describe("account rows", () => {
  it("are never changed by a preset change but the default's own columns", async () => {
    const [before] = await db.select().from(users).where(eq(users.id, me));
    const id = await make(me, "A");
    await renamePreset(db, me, { id, expectedRevision: 1, name: "B" });
    await deletePreset(db, me, { id, expectedRevision: 2 });
    const [after] = await db.select().from(users).where(eq(users.id, me));
    expect(after).toEqual(before);
  });
});
