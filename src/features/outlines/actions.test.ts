// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ideas, outlineEntries, sermonOutlines, users } from "@/db/schema";
import { createTestDatabase } from "@/db/testing";
import type { Database } from "@/db/types";
import type { Authorization } from "@/features/auth/access";

// The access helper is mocked; the database is a real in-memory PostgreSQL.
const state = vi.hoisted(() => ({
  access: { ok: false, message: "Your session has ended. Sign in again." } as unknown,
  db: undefined as unknown,
  locale: "en",
}));

vi.mock("@/db", () => ({ getDb: () => state.db }));
vi.mock("@/i18n/server", () => ({ getLocale: async () => state.locale }));
vi.mock("@/features/auth/access", () => ({
  authorize: async (): Promise<Authorization> => state.access as Authorization,
}));

import {
  addEntry,
  createOutline,
  deleteOutline,
  moveEntry,
  removeEntry,
  setEntryReferences,
  setOutlineNumbering,
  updateEntry,
} from "./actions";
import { getOutline } from "./outlines";

let db: Database;
let me: string;
let other: string;

const nowhere = "0b6a3c1e-9d54-4c7e-8a55-1f1f6d3b2a10";
const signedOut = "Your session has ended. Sign in again.";

function signInAs(id: string) {
  state.access = {
    ok: true,
    user: {
      id,
      clerkUserId: "user_x",
      role: "user",
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };
}

async function stored(title: string, fields: Partial<typeof ideas.$inferInsert> = {}) {
  const [row] = await db
    .insert(ideas)
    .values({ ownerId: me, kind: "sermon", title, ...fields })
    .returning();
  return row.id;
}

/** An outline of mine with two points, made while signed in as me. */
async function outlined() {
  signInAs(me);
  const made = await createOutline(await stored("Grace"));
  const outlineId = made.outlineId!;
  const one = (await addEntry({ outlineId, title: "One" })).entry!.id;
  const two = (await addEntry({ outlineId, title: "Two" })).entry!.id;
  return { outlineId, one, two };
}

const everything = async () => ({
  outlines: await db.select().from(sermonOutlines).orderBy(sermonOutlines.id),
  entries: await db.select().from(outlineEntries).orderBy(outlineEntries.id),
});

beforeEach(async () => {
  db = await createTestDatabase();
  state.db = db;
  state.locale = "en";
  const created = await db
    .insert(users)
    .values([{ clerkUserId: "user_me" }, { clerkUserId: "user_other" }])
    .returning();
  [me, other] = created.map((row) => row.id);
  state.access = { ok: false, message: signedOut };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("outline actions", () => {
  it("reject a signed-out or disabled caller before touching the database", async () => {
    const { outlineId, one, two } = await outlined();
    const sermon = await stored("Another");
    const before = await everything();

    for (const message of [signedOut, "Your account has been disabled."]) {
      state.access = { ok: false, message };
      const results = await Promise.all([
        createOutline(sermon),
        setOutlineNumbering(outlineId, { version: 1, preset: "decimal" }),
        deleteOutline(outlineId),
        addEntry({ outlineId, title: "x" }),
        updateEntry(one, { title: "x" }),
        setEntryReferences(one, []),
        moveEntry(two, { parentId: one }),
        removeEntry(one),
      ]);
      for (const result of results) expect(result).toEqual({ ok: false, message });
    }
    expect(await everything()).toEqual(before);
  });

  it("answer another account's outline and entries as missing, and change nothing", async () => {
    const { outlineId, one, two } = await outlined();
    const mine = await stored("Mine too");
    const before = await everything();

    signInAs(other);
    const missing = { ok: false, code: "missing" };
    expect(await createOutline(mine)).toMatchObject(missing);
    expect(await setOutlineNumbering(outlineId, { version: 1, preset: "none" })).toMatchObject(
      missing,
    );
    expect(await deleteOutline(outlineId)).toMatchObject(missing);
    expect(await addEntry({ outlineId, title: "x" })).toMatchObject(missing);
    expect(await updateEntry(one, { title: "x" })).toMatchObject(missing);
    expect(await setEntryReferences(one, [])).toMatchObject(missing);
    expect(await moveEntry(two, { parentId: one })).toMatchObject(missing);
    expect(await removeEntry(one)).toMatchObject(missing);
    expect(await everything()).toEqual(before);
  });

  it("take the owner from the session, whatever the input names", async () => {
    signInAs(me);
    const sermon = await stored("Grace");
    const made = await createOutline(sermon);
    const added = await addEntry({
      outlineId: made.outlineId,
      title: "One",
      ownerId: other,
      owner_id: other,
      revision: 99,
      entryType: "conclusion",
    });
    expect(added.ok).toBe(true);
    const [row] = await db.select().from(outlineEntries);
    expect(row).toMatchObject({ ownerId: me, entryType: "point", revision: 0 });
    await updateEntry(row.id, { title: "Mine", ownerId: other, outlineId: nowhere, position: 7 });
    expect((await db.select().from(outlineEntries))[0]).toMatchObject({
      ownerId: me,
      outlineId: made.outlineId,
      position: 0,
      title: "Mine",
    });
  });

  it("refuse input that is not what they take", async () => {
    const { outlineId, one } = await outlined();
    const before = await everything();
    const invalid = { ok: false, code: "invalid" };
    const results = await Promise.all([
      createOutline("not-an-id"),
      createOutline(null),
      createOutline(nowhere, "not-an-id"),
      setOutlineNumbering(outlineId, { version: 1, preset: "fancy" }),
      setOutlineNumbering(outlineId, "traditional"),
      setOutlineNumbering("x", { version: 1, preset: "decimal" }),
      deleteOutline(42),
      addEntry({ title: "No outline" }),
      addEntry({ outlineId, title: "x".repeat(201) }),
      addEntry({ outlineId, type: "appendix" }),
      addEntry({ outlineId, type: "introduction", parentId: one }),
      addEntry({ outlineId, title: "x" }, "not-an-id"),
      addEntry(null),
      updateEntry(one, {}),
      updateEntry(one, { notes: "x".repeat(2001) }),
      updateEntry("x", { title: "x" }),
      setEntryReferences(one, [{ book: 99, chapterStart: 1 }]),
      setEntryReferences(one, [], -1),
      moveEntry(one, { parentId: "x" }),
      moveEntry(one, { parentId: null, position: -1 }),
      moveEntry(one, { parentId: null, expectedRevision: 1.5 }),
      removeEntry(one, "latest"),
      removeEntry({}),
    ]);
    for (const [index, result] of results.entries()) {
      expect(result, `input ${index}`).toMatchObject(invalid);
    }
    expect(await everything()).toEqual(before);
  });

  it("make an outline once, and answer a second request with the one there is", async () => {
    signInAs(me);
    const sermon = await stored("Grace");
    const made = await createOutline(sermon);
    expect(made).toMatchObject({ ok: true, message: "Outline created.", revision: 0 });
    expect(await createOutline(sermon)).toEqual({
      ok: false,
      code: "exists",
      message: "This sermon already has an outline.",
      outlineId: made.outlineId,
      revision: 0,
    });
    expect(await createOutline(await stored("A point", { kind: "point" }))).toMatchObject({
      ok: false,
      code: "not_sermon",
    });
    expect(await createOutline(nowhere)).toMatchObject({ ok: false, code: "missing" });
  });

  it("acknowledge each change with what it left: the shape's revision, and the entry", async () => {
    const { outlineId, one, two } = await outlined();
    expect(await addEntry({ outlineId, title: "Three", expectedRevision: 2 })).toMatchObject({
      ok: true,
      outlineId,
      revision: 3,
      entry: { title: "Three", position: 2, revision: 0 },
    });
    expect(await moveEntry(two, { parentId: one, expectedRevision: 3 })).toEqual({
      ok: true,
      message: "Moved.",
      outlineId,
      revision: 4,
      moved: { id: two, parentId: one, position: 0 },
    });
    expect(await updateEntry(two, { notes: "Brief", expectedRevision: 0 })).toMatchObject({
      ok: true,
      outlineId,
      entry: { id: two, parentId: one, notes: "Brief", revision: 1 },
    });
    expect(await removeEntry(one, 4)).toEqual({
      ok: true,
      message: "Removed from the outline.",
      outlineId,
      revision: 5,
    });
    expect((await getOutline(db, me, outlineId))?.entries.map((entry) => entry.title)).toEqual([
      "Three",
    ]);
  });

  it("say which kind of change was stale, with what is needed to catch up", async () => {
    const { outlineId, one, two } = await outlined();
    expect(await addEntry({ outlineId, title: "Late", expectedRevision: 0 })).toEqual({
      ok: false,
      code: "stale",
      message: "This outline was changed somewhere else. Reload it to carry on.",
      revision: 2,
    });
    expect(await moveEntry(two, { parentId: one, expectedRevision: 1 })).toMatchObject({
      code: "stale",
      revision: 2,
    });
    expect(await removeEntry(two, 0)).toMatchObject({ code: "stale", revision: 2 });

    await updateEntry(one, { title: "Edited" });
    expect(await updateEntry(one, { title: "Late", expectedRevision: 0 })).toMatchObject({
      ok: false,
      code: "stale_entry",
      entry: { id: one, title: "Edited", revision: 1 },
    });
    expect(await setEntryReferences(one, [], 0)).toMatchObject({ code: "stale_entry" });
  });

  it("say why a change of shape cannot be made, and make none of it", async () => {
    const { outlineId, one, two } = await outlined();
    await moveEntry(two, { parentId: one });
    const intro = await addEntry({ outlineId, type: "introduction" });
    const theirPoint = await stored("Theirs", { kind: "point", ownerId: other });
    const before = await everything();

    expect(await moveEntry(one, { parentId: two })).toMatchObject({ ok: false, code: "cycle" });
    expect(await moveEntry(one, { parentId: one })).toMatchObject({ code: "cycle" });
    expect(await moveEntry(two, { parentId: intro.entry!.id })).toMatchObject({
      code: "invalid_parent",
    });
    expect(await moveEntry(two, { parentId: nowhere })).toMatchObject({ code: "invalid_parent" });
    expect(await moveEntry(intro.entry!.id, { parentId: null })).toMatchObject({
      code: "section",
    });
    expect(await addEntry({ outlineId, type: "introduction" })).toMatchObject({
      code: "section_exists",
      message: "This outline already has an introduction.",
    });
    expect(await addEntry({ outlineId, sourcePointId: theirPoint })).toMatchObject({
      code: "unknown_source",
    });
    expect(await everything()).toEqual(before);
  });

  it("save a numbering style, and refuse one that is malformed", async () => {
    const { outlineId } = await outlined();
    const custom = {
      version: 1,
      preset: "custom",
      levels: [{ counter: "roman", prefix: "POINT ", suffix: "" }],
    };
    expect(await setOutlineNumbering(outlineId, custom)).toMatchObject({
      ok: true,
      message: "Numbering saved.",
      revision: 2,
    });
    expect((await getOutline(db, me, outlineId))?.numbering).toMatchObject(custom);
    expect(
      await setOutlineNumbering(outlineId, {
        ...custom,
        levels: [{ counter: "roman", prefix: "<script>" }],
      }),
    ).toEqual({ ok: false, code: "invalid", message: "That numbering style could not be used." });
    expect((await getOutline(db, me, outlineId))?.numbering).toMatchObject(custom);
  });

  it("delete an outline and keep the sermon", async () => {
    const { outlineId } = await outlined();
    expect(await deleteOutline(outlineId)).toEqual({
      ok: true,
      message: "Outline deleted. The sermon was kept.",
    });
    expect(await db.select().from(sermonOutlines)).toHaveLength(0);
    expect(await db.select().from(ideas)).toHaveLength(1);
    expect(await deleteOutline(outlineId)).toMatchObject({ ok: false, code: "missing" });
  });

  it("speak the account's language", async () => {
    const { outlineId, one } = await outlined();
    state.locale = "es";
    expect((await addEntry({ outlineId, title: "x".repeat(201) })).message).toBe(
      "Un encabezado puede tener hasta 200 caracteres.",
    );
    expect((await updateEntry(one, { notes: "x".repeat(2001) })).message).toBe(
      // Spanish writes four digits without a separator.
      "Las notas pueden tener hasta 2000 caracteres.",
    );
    expect((await moveEntry(one, { parentId: one })).message).toBe(
      "Un punto no puede colocarse bajo sí mismo ni bajo uno de sus propios subpuntos.",
    );
    expect((await addEntry({ outlineId: nowhere, title: "x" })).message).toBe(
      "Ese bosquejo ya no existe.",
    );
  });

  it("report a failure of the database without saying what it was", async () => {
    const { outlineId, one } = await outlined();
    const failure = new Error("connect postgresql://user:secret@host/db failed");
    state.db = {
      transaction: async () => {
        throw failure;
      },
      update: () => {
        throw failure;
      },
      delete: () => {
        throw failure;
      },
    };
    const results = await Promise.all([
      createOutline(
        await db
          .insert(ideas)
          .values({ ownerId: me, title: "x" })
          .returning()
          .then((r) => r[0].id),
      ),
      setOutlineNumbering(outlineId, { version: 1, preset: "decimal" }),
      deleteOutline(outlineId),
      addEntry({ outlineId, title: "x" }),
      updateEntry(one, { title: "x" }),
      setEntryReferences(one, []),
      moveEntry(one, { parentId: null }),
      removeEntry(one),
    ]);
    for (const result of results) {
      expect(result).toMatchObject({ ok: false, code: "failed" });
      expect(result.message).not.toMatch(/postgres|secret/);
    }
    const logged = vi.mocked(console.error).mock.calls.flat().join(" ");
    expect(logged).not.toContain("secret");
  });
});
