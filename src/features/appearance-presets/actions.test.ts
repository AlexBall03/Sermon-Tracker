// @vitest-environment node
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { appearancePresets, users, type AppUser } from "@/db/schema";
import type { Database } from "@/db/types";
import type { Authorization } from "@/features/auth/access";
import type { AppearanceSnapshot } from "@/features/editor-lab/styles/snapshot";

// The access helper is mocked; the database is a real in-memory PostgreSQL.
const state = vi.hoisted(() => ({
  access: { ok: false, message: "Your session has ended. Sign in again." } as unknown,
  db: undefined as unknown,
  locale: "en" as "en" | "es",
}));

vi.mock("@/db", () => ({ getDb: () => state.db }));
vi.mock("@/i18n/server", () => ({ getLocale: async () => state.locale }));
vi.mock("@/features/auth/access", () => ({
  authorize: async (): Promise<Authorization> => state.access as Authorization,
}));

import { requestDeletion } from "@/features/account/deletion";
import {
  createAppearancePreset,
  deleteAppearancePreset,
  duplicateAppearancePreset,
  getAppearanceDefault,
  getAppearancePreset,
  listAppearancePresets,
  renameAppearancePreset,
  replaceAppearancePresetAppearance,
  setAppearanceDefault,
} from "./actions";
import { recordingDatabase, seedAccount } from "./testing";

/*
 * The preset actions (A4.2B, checkpoint F): who may call them, that the owner
 * is always the session's, that another account's preset is invisible, and
 * that an account being deleted is refused under the lock even when the
 * request was authorised just before.
 */

let db: Database;
let me: string;
let other: string;

const balanced: AppearanceSnapshot = {
  version: 1,
  preset: "balanced",
  presetRevision: 2,
  numbering: { version: 1, preset: "decimal" },
};

async function signInAs(id: string) {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  state.access = { ok: true, user: user as AppUser };
}

const refusals = [
  "Your session has ended. Sign in again.",
  "Your account does not have access.",
  "Finish setting up your account first.",
];

beforeEach(async () => {
  ({ db } = await recordingDatabase());
  state.db = db;
  state.locale = "en";
  me = await seedAccount(db, "user_me");
  other = await seedAccount(db, "user_other");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const create = (name: string, appearance: unknown = balanced) =>
  createAppearancePreset({ operationId: crypto.randomUUID(), name, appearance });

describe("preset actions", () => {
  it("refuse a signed-out, disabled, or unfinished account before touching the database", async () => {
    state.db = undefined;
    const calls = [
      () => create("A"),
      () => listAppearancePresets(),
      () => getAppearancePreset(crypto.randomUUID()),
      () => renameAppearancePreset({ id: crypto.randomUUID(), expectedRevision: 1, name: "B" }),
      () =>
        replaceAppearancePresetAppearance({
          id: crypto.randomUUID(),
          expectedRevision: 1,
          appearance: balanced,
        }),
      () =>
        duplicateAppearancePreset({
          operationId: crypto.randomUUID(),
          sourceId: crypto.randomUUID(),
          name: "C",
        }),
      () => deleteAppearancePreset({ id: crypto.randomUUID(), expectedRevision: 1 }),
      () => getAppearanceDefault(),
      () =>
        setAppearanceDefault({
          target: { kind: "builtin", preset: "minimal" },
          expectedRevision: 1,
        }),
    ];
    for (const message of refusals) {
      state.access = { ok: false, message };
      for (const call of calls) {
        expect(await call()).toEqual({ ok: false, message, code: "unauthorized" });
      }
    }
  });

  it("let an active account make, read, change, and delete its own presets", async () => {
    await signInAs(me);
    const created = await create("Sunday");
    expect(created).toMatchObject({ ok: true, replayed: false, preset: { name: "Sunday" } });
    const id = created.id!;

    expect(await listAppearancePresets({ pageSize: 10 })).toMatchObject({
      ok: true,
      page: { total: 1, items: [{ id, name: "Sunday" }] },
    });
    expect(await getAppearancePreset(id)).toMatchObject({
      ok: true,
      preset: { id },
      appearance: { preset: "balanced" },
    });
    expect(
      await renameAppearancePreset({ id, expectedRevision: 1, name: "Evening" }),
    ).toMatchObject({ ok: true, preset: { name: "Evening", revision: 2 } });
    expect(
      await renameAppearancePreset({ id, expectedRevision: 2, name: "Evening" }),
    ).toMatchObject({ ok: true, unchanged: true });
    expect(
      await replaceAppearancePresetAppearance({
        id,
        expectedRevision: 2,
        appearance: { ...balanced, preset: "expressive" },
      }),
    ).toMatchObject({ ok: true, preset: { revision: 3, basePreset: "expressive" } });
    const copy = await duplicateAppearancePreset({
      operationId: crypto.randomUUID(),
      sourceId: id,
      name: "Copy",
    });
    expect(copy).toMatchObject({ ok: true, preset: { name: "Copy", revision: 1 } });
    expect(
      await setAppearanceDefault({
        target: { kind: "personal", presetId: id },
        expectedRevision: 1,
      }),
    ).toMatchObject({
      ok: true,
      default: { target: { kind: "personal", presetId: id }, revision: 2 },
    });
    expect(await deleteAppearancePreset({ id, expectedRevision: 3 })).toEqual({
      ok: true,
      message: "Preset deleted. Your default appearance is now Balanced.",
      defaultReset: true,
      defaultRevision: 3,
    });
  });

  it("answer with typed codes, in the account's language", async () => {
    await signInAs(me);
    const id = (await create("Taken")).id!;
    expect(await create("taken")).toMatchObject({ ok: false, code: "duplicate_name" });
    expect(await create("Bad", { ...balanced, version: 2 })).toMatchObject({
      ok: false,
      code: "invalid",
    });
    expect(await renameAppearancePreset({ id, expectedRevision: 9, name: "X" })).toMatchObject({
      ok: false,
      code: "conflict",
      revision: 1,
    });
    state.locale = "es";
    expect(await create("TAKEN")).toEqual({
      ok: false,
      code: "duplicate_name",
      message: "Ya tienes un estilo predefinido con ese nombre.",
    });
  });

  it("refuse malformed input before any database work", async () => {
    await signInAs(me);
    state.db = undefined;
    for (const input of [
      null,
      "Sunday",
      { name: "No operation", appearance: balanced },
      { operationId: "not-a-uuid", name: "A", appearance: balanced },
      { operationId: crypto.randomUUID(), name: "", appearance: balanced },
      { operationId: crypto.randomUUID(), name: "A", appearance: balanced, extra: 1 },
    ]) {
      expect(await createAppearancePreset(input)).toMatchObject({ ok: false, code: "invalid" });
    }
    expect(await renameAppearancePreset({ id: "x", expectedRevision: 1, name: "A" })).toMatchObject(
      {
        code: "invalid",
      },
    );
    expect(
      await deleteAppearancePreset({ id: crypto.randomUUID(), expectedRevision: 0 }),
    ).toMatchObject({ code: "invalid" });
    expect(await listAppearancePresets({ pageSize: 101 })).toMatchObject({ code: "invalid" });
  });

  it("take the owner only from the session", async () => {
    await signInAs(me);
    expect(
      await createAppearancePreset({
        operationId: crypto.randomUUID(),
        name: "Theirs",
        appearance: balanced,
        ownerId: other,
      }),
    ).toMatchObject({ ok: false, code: "invalid" });
    const mine = (await create("Mine")).id!;
    expect(await db.select().from(appearancePresets)).toEqual([
      expect.objectContaining({ id: mine, ownerId: me }),
    ]);
  });

  it("show another account's preset to no one but its owner", async () => {
    await signInAs(other);
    const theirs = (await create("Private name")).id!;
    await signInAs(me);
    const notFound = { ok: false, code: "not_found", message: "That preset no longer exists." };
    expect(await getAppearancePreset(theirs)).toEqual(notFound);
    expect(await getAppearancePreset(crypto.randomUUID())).toEqual(notFound);
    expect(await renameAppearancePreset({ id: theirs, expectedRevision: 1, name: "Mine" })).toEqual(
      notFound,
    );
    expect(await deleteAppearancePreset({ id: theirs, expectedRevision: 1 })).toEqual(notFound);
    expect(
      await duplicateAppearancePreset({
        operationId: crypto.randomUUID(),
        sourceId: theirs,
        name: "Stolen",
      }),
    ).toEqual(notFound);
    expect(
      await setAppearanceDefault({
        target: { kind: "personal", presetId: theirs },
        expectedRevision: 1,
      }),
    ).toEqual(notFound);
    const list = await listAppearancePresets();
    expect(list.page?.total).toBe(0);
    expect(JSON.stringify(list)).not.toContain("Private name");
    expect(await db.select().from(appearancePresets)).toEqual([
      expect.objectContaining({ id: theirs, name: "Private name", ownerId: other, revision: 1 }),
    ]);
  });

  it("refuse an account locked for deletion after its request was authorised", async () => {
    await signInAs(me);
    const id = (await create("Before")).id!;
    // Authorised as active just before; deletion is requested before the action runs.
    expect(await requestDeletion(db, me)).toEqual({ ok: true });
    const unavailable = { ok: false, code: "account_unavailable" };
    expect(await create("After")).toMatchObject(unavailable);
    expect(await renameAppearancePreset({ id, expectedRevision: 1, name: "X" })).toMatchObject(
      unavailable,
    );
    expect(await deleteAppearancePreset({ id, expectedRevision: 1 })).toMatchObject(unavailable);
    expect(
      await setAppearanceDefault({
        target: { kind: "builtin", preset: "minimal" },
        expectedRevision: 1,
      }),
    ).toMatchObject(unavailable);
    expect(await db.select().from(appearancePresets)).toHaveLength(1);
  });

  it("read the default from the session's account row, with no query", async () => {
    await signInAs(me);
    state.db = undefined;
    expect(await getAppearanceDefault()).toMatchObject({
      ok: true,
      default: { target: { kind: "builtin", preset: "balanced" }, revision: 1 },
    });
  });

  it("log a failure by its kind and code only, never the name or appearance", async () => {
    await signInAs(me);
    const leaked = "Secret Sermon Name";
    state.db = {
      transaction: async () => {
        throw Object.assign(new Error(`Failed query: insert … params: ${leaked}`), {
          code: "08006",
        });
      },
    };
    expect(await create(leaked)).toMatchObject({ ok: false, code: "failed" });
    const logged = vi.mocked(console.error).mock.calls.flat().map(String).join(" ");
    expect(logged).toContain("08006");
    expect(logged).not.toContain(leaked);
  });
});
