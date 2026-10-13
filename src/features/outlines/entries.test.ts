// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";

import * as schema from "@/db/schema";
import {
  ideas,
  outlineEntries,
  outlineEntryScriptureReferences,
  sermonOutlines,
  users,
} from "@/db/schema";
import { createTestDatabase } from "@/db/testing";
import type { Database } from "@/db/types";
import { deleteIdea, setIdeaKind, updateIdea } from "@/features/ideas/ideas";
import { ideaUpdateSchema } from "@/features/ideas/schemas";
import {
  createEntry,
  deleteEntry,
  getEntry,
  listEntries,
  moveEntry,
  setEntryReferences,
  updateEntry,
} from "./entries";
import { outlineLimits } from "./model";
import { numberOutline } from "./numbering";
import { createOutline, getOutline, setNumbering } from "./outlines";
import { outlineSchemas } from "./schemas";

/*
 * The entries of an outline, against a real in-memory PostgreSQL: the tree
 * the service keeps, what it refuses and leaves untouched, and what the table
 * refuses whatever the service does.
 */

let db: Database;
let me: string;
let other: string;
let outlineId: string;
let sermonId: string;

const old = new Date("2026-01-01T00:00:00Z");
const schemas = outlineSchemas();
const nowhere = "0b6a3c1e-9d54-4c7e-8a55-1f1f6d3b2a10";

async function stored(title: string, fields: Partial<typeof ideas.$inferInsert> = {}) {
  const [row] = await db
    .insert(ideas)
    .values({ ownerId: me, kind: "sermon", title, createdAt: old, updatedAt: old, ...fields })
    .returning();
  return row.id;
}

async function outlined(title: string, owner = me) {
  const sermon = await stored(title, { ownerId: owner });
  const outcome = await createOutline(db, owner, sermon);
  if (outcome.status !== "created") throw new Error(outcome.status);
  return { sermonId: sermon, id: outcome.outline.id };
}

beforeEach(async () => {
  db = await createTestDatabase();
  const rows = await db
    .insert(users)
    .values([{ clerkUserId: "user_me" }, { clerkUserId: "user_other" }])
    .returning();
  [me, other] = rows.map((row) => row.id);
  ({ id: outlineId, sermonId } = await outlined("Grace"));
});

type Fields = Partial<ReturnType<typeof schemas.entryCreate.parse>>;

const create = (fields: Fields = {}, id?: string, owner = me) =>
  createEntry(db, owner, schemas.entryCreate.parse({ outlineId, ...fields }), id);

/** Adds a point and returns its ID. */
async function add(title: string, parentId: string | null = null, position?: number) {
  const outcome = await create({ title, parentId, position });
  if (outcome.status !== "created") throw new Error(outcome.status);
  return outcome.entry.id;
}

/** The outline as it would be drawn: one line an entry, indented by its depth. */
const drawn = async (id = outlineId, owner = me) =>
  (await listEntries(db, owner, id)).map(
    (entry) => `${"  ".repeat(entry.depth)}${entry.type === "point" ? entry.title : entry.type}`,
  );

const revision = async (id = outlineId) => (await getOutline(db, me, id))!.revision;
const entryRows = () => db.select().from(outlineEntries).orderBy(outlineEntries.id);

/** Every list of siblings in every outline is 0, 1, 2, … with none missing. */
async function expectTidy() {
  const places = new Map<string, number[]>();
  for (const row of await entryRows()) {
    if (row.entryType !== "point") continue;
    const key = `${row.outlineId}/${row.parentId}`;
    places.set(key, [...(places.get(key) ?? []), row.position]);
  }
  for (const values of places.values()) {
    expect(values.sort((a, b) => a - b)).toEqual(values.map((_, index) => index));
  }
}

/*
 *   One
 *     One A
 *       One A i
 *     One B
 *   Two
 *   Three
 */
async function tree() {
  const one = await add("One");
  const oneA = await add("One A", one);
  const oneAi = await add("One A i", oneA);
  const oneB = await add("One B", one);
  const two = await add("Two");
  const three = await add("Three");
  return { one, oneA, oneAi, oneB, two, three };
}

describe("adding entries", () => {
  it("adds main points in the order they are made, and counts each as a change of shape", async () => {
    expect(await revision()).toBe(0);
    const first = await create({ title: "First" });
    expect(first).toMatchObject({
      status: "created",
      revision: 1,
      entry: {
        outlineId,
        parentId: null,
        type: "point",
        position: 0,
        title: "First",
        notes: null,
        sourcePointId: null,
        revision: 0,
        references: [],
      },
    });
    await add("Second");
    await add("Third");
    expect(await drawn()).toEqual(["First", "Second", "Third"]);
    expect(await revision()).toBe(3);
  });

  it("adds a point under another, as deep as is wanted", async () => {
    await tree();
    expect(await drawn()).toEqual(["One", "  One A", "    One A i", "  One B", "Two", "Three"]);
    await expectTidy();
  });

  it("puts a point at the place it is given, and moves the ones after it down", async () => {
    const { one } = await tree();
    await add("Zero", null, 0);
    await add("One A-and-a-half", one, 1);
    await add("Past the end", one, 99);
    expect(await drawn()).toEqual([
      "Zero",
      "One",
      "  One A",
      "    One A i",
      "  One A-and-a-half",
      "  One B",
      "  Past the end",
      "Two",
      "Three",
    ]);
    await expectTidy();
  });

  it("nests far deeper than any outline is drawn", async () => {
    let parent: string | null = null;
    for (let depth = 0; depth < 40; depth += 1) parent = await add(`Level ${depth + 1}`, parent);
    const entries = await listEntries(db, me, outlineId);
    expect(entries.map((entry) => entry.depth)).toEqual(Array.from({ length: 40 }, (_, i) => i));
    expect(entries.at(-1)?.path).toEqual(Array(40).fill(1));
    // And it is still numbered at the bottom.
    await setNumbering(db, me, outlineId, { version: 1, preset: "traditional" });
    const outline = await getOutline(db, me, outlineId);
    const labels = numberOutline(outline!.entries, outline!.numbering);
    expect(labels.get(entries.at(-1)!.id)).toBe("(a)");
  });

  it("may have an empty title, and keeps its title on one line", async () => {
    const empty = await create({});
    expect(empty).toMatchObject({ status: "created", entry: { title: "", notes: null } });
    const tidy = await create({ title: "  The   Importance\n of Prayer ", notes: "  \n " });
    expect(tidy).toMatchObject({ entry: { title: "The Importance of Prayer", notes: null } });
  });

  it("saves once when the same ID is submitted again, and returns the first one's row", async () => {
    const first = await create({ title: "First" }, nowhere);
    const again = await create({ title: "Something else", notes: "changed" }, nowhere);
    expect(first.status).toBe("created");
    expect(again).toMatchObject({
      status: "existing",
      revision: 1,
      entry: { id: nowhere, title: "First", notes: null },
    });
    // Even when the retry names the revision the first attempt was made against.
    expect(await create({ title: "x", expectedRevision: 0 }, nowhere)).toMatchObject({
      status: "existing",
    });
    expect(await entryRows()).toHaveLength(1);
    expect(await revision()).toBe(1);
  });

  it("cannot take an ID used in another outline, of the owner's or of anyone's", async () => {
    await create({ title: "First" }, nowhere);
    const second = await outlined("Second");
    const theirs = await outlined("Theirs", other);
    const before = await entryRows();

    expect(await create({ outlineId: second.id, title: "x" }, nowhere)).toEqual({
      status: "unavailable",
    });
    expect(
      await createEntry(
        db,
        other,
        schemas.entryCreate.parse({ outlineId: theirs.id, title: "x" }),
        nowhere,
      ),
    ).toEqual({ status: "unavailable" });
    expect(await entryRows()).toEqual(before);
  });

  it("is refused past the most an outline may hold", async () => {
    const values = Array.from({ length: outlineLimits.entries }, (_, position) => ({
      outlineId,
      ownerId: me,
      position,
      title: `Point ${position}`,
    }));
    await db.insert(outlineEntries).values(values);
    expect(await create({ title: "One too many" })).toEqual({ status: "full" });
    expect(await create({ type: "conclusion" })).toEqual({ status: "full" });
    expect(await entryRows()).toHaveLength(outlineLimits.entries);
  });
});

describe("the introduction and the conclusion", () => {
  it("are shown first and last, whenever they were made, and are not numbered", async () => {
    await create({ type: "conclusion", notes: "Call to prayer" });
    await add("One");
    await create({ type: "introduction", title: "A question" });
    await add("Two");
    expect(await drawn()).toEqual(["introduction", "One", "Two", "conclusion"]);

    const outline = await getOutline(db, me, outlineId);
    const labels = outline!.entries.map(
      (entry) => numberOutline(outline!.entries, outline!.numbering).get(entry.id) ?? "",
    );
    expect(labels).toEqual(["", "I.", "II.", ""]);
  });

  it("are one of each", async () => {
    await create({ type: "introduction" });
    await create({ type: "conclusion" });
    const before = await entryRows();
    expect(await create({ type: "introduction" })).toEqual({ status: "section_exists" });
    expect(await create({ type: "conclusion" })).toEqual({ status: "section_exists" });
    expect(await entryRows()).toEqual(before);
    expect(await revision()).toBe(2);
  });

  it("are under nothing, are made from nothing, and have nothing under them", async () => {
    const one = await add("One");
    const point = await stored("A point", { kind: "point" });
    for (const type of ["introduction", "conclusion"] as const) {
      expect(schemas.entryCreate.safeParse({ outlineId, type, parentId: one }).success).toBe(false);
      expect(schemas.entryCreate.safeParse({ outlineId, type, sourcePointId: point }).success).toBe(
        false,
      );
    }
    const intro = await create({ type: "introduction" });
    if (intro.status !== "created") throw new Error(intro.status);
    expect(await create({ title: "Under the introduction", parentId: intro.entry.id })).toEqual({
      status: "invalid_parent",
    });
    expect(
      await moveEntry(db, me, one, schemas.entryMove.parse({ parentId: intro.entry.id })),
    ).toEqual({ status: "invalid_parent" });
  });

  it("cannot be moved, and can be edited and removed", async () => {
    const one = await add("One");
    const intro = await create({ type: "introduction" });
    if (intro.status !== "created") throw new Error(intro.status);
    const id = intro.entry.id;

    for (const move of [{ parentId: null, position: 1 }, { parentId: one }]) {
      expect(await moveEntry(db, me, id, schemas.entryMove.parse(move))).toEqual({
        status: "section",
      });
    }
    expect(
      await updateEntry(db, me, id, schemas.entryUpdate.parse({ notes: "Open with Psalm 23" })),
    ).toMatchObject({
      status: "updated",
      entry: { type: "introduction", notes: "Open with Psalm 23" },
    });
    expect(await deleteEntry(db, me, id)).toMatchObject({ status: "deleted", removed: 1 });
    expect(await drawn()).toEqual(["One"]);
    // And there can be one again.
    expect((await create({ type: "introduction" })).status).toBe("created");
  });
});

describe("moving a point", () => {
  const move = (
    id: string,
    parentId: string | null,
    position?: number,
    expectedRevision?: number,
  ) => moveEntry(db, me, id, schemas.entryMove.parse({ parentId, position, expectedRevision }));

  it("among the points it is beside", async () => {
    const { three, one } = await tree();
    const before = await revision();
    expect(await move(three, null, 0)).toMatchObject({
      status: "moved",
      entry: { id: three, parentId: null, position: 0 },
      revision: before + 1,
    });
    expect(await drawn()).toEqual(["Three", "One", "  One A", "    One A i", "  One B", "Two"]);
    await move(one, null);
    expect(await drawn()).toEqual(["Three", "Two", "One", "  One A", "    One A i", "  One B"]);
    await expectTidy();
  });

  it("under another point, with everything under it", async () => {
    const { one, three } = await tree();
    await move(one, three);
    expect(await drawn()).toEqual([
      "Two",
      "Three",
      "  One",
      "    One A",
      "      One A i",
      "    One B",
    ]);
    await expectTidy();
  });

  it("out to the main points, at a place, and back", async () => {
    const { one, oneA, two } = await tree();
    await move(oneA, null, 1);
    expect(await drawn()).toEqual(["One", "  One B", "One A", "  One A i", "Two", "Three"]);
    await move(oneA, two);
    await move(oneA, one, 0);
    expect(await drawn()).toEqual(["One", "  One A", "    One A i", "  One B", "Two", "Three"]);
    await expectTidy();
  });

  it("renumbers the outline, and changes no title, note, or source", async () => {
    const { three } = await tree();
    const words = async () =>
      (await entryRows()).map(({ id, title, notes, sourcePointId, revision: r, updatedAt }) => ({
        id,
        title,
        notes,
        sourcePointId,
        revision: r,
        updatedAt,
      }));
    const before = await words();
    const labels = async () => {
      const outline = await getOutline(db, me, outlineId);
      const numbers = numberOutline(outline!.entries, outline!.numbering);
      return outline!.entries.map((entry) => `${numbers.get(entry.id)} ${entry.title}`);
    };
    expect(await labels()).toEqual([
      "I. One",
      "A. One A",
      "1. One A i",
      "B. One B",
      "II. Two",
      "III. Three",
    ]);
    await move(three, null, 0);
    expect(await labels()).toEqual([
      "I. Three",
      "II. One",
      "A. One A",
      "1. One A i",
      "B. One B",
      "III. Two",
    ]);
    expect(await words()).toEqual(before);
  });

  it("to where it already is writes nothing and is not a change of shape", async () => {
    const { two } = await tree();
    const before = await entryRows();
    const at = await revision();
    expect(await move(two, null, 1)).toMatchObject({ status: "moved", revision: at });
    expect(await entryRows()).toEqual(before);
    expect(await revision()).toBe(at);
  });

  it("is refused under itself or under anything that is under it, and nothing moves", async () => {
    const { one, oneA, oneAi, oneB } = await tree();
    const before = await entryRows();
    const at = await revision();
    for (const parent of [one, oneA, oneAi, oneB]) {
      expect(await move(one, parent)).toEqual({ status: "cycle" });
    }
    expect(await entryRows()).toEqual(before);
    expect(await revision()).toBe(at);
  });

  it("is refused under a point of another outline, of the owner's or of anyone's", async () => {
    const { two } = await tree();
    const second = await outlined("Second");
    const [mine] = await db
      .insert(outlineEntries)
      .values({ outlineId: second.id, ownerId: me, position: 0, title: "Elsewhere" })
      .returning();
    const theirs = await outlined("Theirs", other);
    const [foreign] = await db
      .insert(outlineEntries)
      .values({ outlineId: theirs.id, ownerId: other, position: 0, title: "Theirs" })
      .returning();
    const before = await entryRows();

    for (const parent of [mine.id, foreign.id, nowhere]) {
      expect(await move(two, parent)).toEqual({ status: "invalid_parent" });
      expect(await create({ title: "x", parentId: parent })).toEqual({ status: "invalid_parent" });
    }
    expect(await entryRows()).toEqual(before);
  });

  it("is refused for another account, whose request finds nothing", async () => {
    const { two, one } = await tree();
    const before = await entryRows();
    const asOther = (id: string, input: object) =>
      moveEntry(db, other, id, schemas.entryMove.parse(input));
    expect(await asOther(two, { parentId: null, position: 0 })).toEqual({ status: "missing" });
    expect(await asOther(two, { parentId: one })).toEqual({ status: "missing" });
    expect(await move(nowhere, null)).toEqual({ status: "missing" });
    expect(await entryRows()).toEqual(before);
  });
});

describe("removing an entry", () => {
  it("removes everything under it, closes the gap, and says how many went", async () => {
    const { one } = await tree();
    const at = await revision();
    expect(await deleteEntry(db, me, one)).toEqual({
      status: "deleted",
      outlineId,
      removed: 4,
      revision: at + 1,
    });
    expect(await drawn()).toEqual(["Two", "Three"]);
    await expectTidy();
  });

  it("removes a point from under another and leaves the rest", async () => {
    const { oneA } = await tree();
    expect(await deleteEntry(db, me, oneA)).toMatchObject({ removed: 2 });
    expect(await drawn()).toEqual(["One", "  One B", "Two", "Three"]);
    await expectTidy();
  });

  it("removes its passages with it", async () => {
    const id = await add("With a passage");
    await setEntryReferences(db, me, id, schemas.entryReferences.parse([john316]));
    await deleteEntry(db, me, id);
    expect(await db.select().from(outlineEntryScriptureReferences)).toHaveLength(0);
  });

  it("is refused for another account, and finds nothing for one that is gone", async () => {
    const { two } = await tree();
    const before = await entryRows();
    expect(await deleteEntry(db, other, two)).toEqual({ status: "missing" });
    expect(await entryRows()).toEqual(before);
    expect((await deleteEntry(db, me, two)).status).toBe("deleted");
    expect(await deleteEntry(db, me, two)).toEqual({ status: "missing" });
  });
});

const john316 = { book: 43, chapterStart: 3, verseStart: 16, chapterEnd: null, verseEnd: null };
const psalm23 = { book: 19, chapterStart: 23, verseStart: null, chapterEnd: null, verseEnd: null };

describe("an entry's words", () => {
  const update = (id: string, change: object, owner = me) =>
    updateEntry(db, owner, id, schemas.entryUpdate.parse(change));

  it("change one field at a time, and a field left out is left alone", async () => {
    const id = await add("Prayer");
    expect(await update(id, { notes: "Three kinds" })).toMatchObject({
      status: "updated",
      entry: { title: "Prayer", notes: "Three kinds", revision: 1 },
    });
    expect(await update(id, { title: "The Importance of Prayer" })).toMatchObject({
      entry: { title: "The Importance of Prayer", notes: "Three kinds", revision: 2 },
    });
    expect(await update(id, { notes: null })).toMatchObject({
      entry: { title: "The Importance of Prayer", notes: null, revision: 3 },
    });
    expect(await update(id, { notes: "   " })).toMatchObject({ entry: { notes: null } });
    expect(await update(id, { title: "" })).toMatchObject({ entry: { title: "" } });
  });

  it("are not a change of shape, and say the outline was worked on", async () => {
    const id = await add("Prayer");
    await db.update(sermonOutlines).set({ updatedAt: old }).where(eq(sermonOutlines.id, outlineId));
    const at = await revision();
    await update(id, { title: "Prayer, again" });
    const outline = await getOutline(db, me, outlineId);
    expect(outline!.revision).toBe(at);
    expect(outline!.updatedAt.getTime()).toBeGreaterThan(old.getTime());
  });

  it("are refused when too long, or when there is nothing to save", async () => {
    const parse = (change: object) => schemas.entryUpdate.safeParse(change);
    expect(parse({ title: "x".repeat(outlineLimits.title) }).success).toBe(true);
    expect(parse({ title: "x".repeat(outlineLimits.title + 1) }).success).toBe(false);
    expect(parse({ notes: "x".repeat(outlineLimits.notes) }).success).toBe(true);
    expect(parse({ notes: "x".repeat(outlineLimits.notes + 1) }).success).toBe(false);
    expect(parse({}).success).toBe(false);
    expect(parse({ expectedRevision: 0 }).success).toBe(false);
    expect(parse({ title: 5 }).success).toBe(false);
  });

  it("cannot be changed by another account, which finds nothing", async () => {
    const id = await add("Prayer");
    const before = await entryRows();
    expect(await update(id, { title: "Theirs now" }, other)).toEqual({ status: "missing" });
    expect(
      await setEntryReferences(db, other, id, schemas.entryReferences.parse([john316])),
    ).toEqual({ status: "missing" });
    expect(await getEntry(db, other, id)).toBeNull();
    expect(await listEntries(db, other, outlineId)).toEqual([]);
    expect(await entryRows()).toEqual(before);
    expect(await db.select().from(outlineEntryScriptureReferences)).toHaveLength(0);
  });

  it("hold passages, in order, replaced as a whole and never twice", async () => {
    const id = await add("Prayer");
    const saved = await setEntryReferences(
      db,
      me,
      id,
      schemas.entryReferences.parse([psalm23, john316, { ...psalm23 }]),
    );
    expect(saved).toMatchObject({
      status: "updated",
      entry: { references: [psalm23, john316], revision: 1 },
    });
    expect((await getEntry(db, me, id))?.references).toEqual([psalm23, john316]);
    expect((await listEntries(db, me, outlineId))[0].references).toEqual([psalm23, john316]);

    await setEntryReferences(db, me, id, schemas.entryReferences.parse([john316]));
    expect((await getEntry(db, me, id))?.references).toEqual([john316]);
    await setEntryReferences(db, me, id, []);
    expect((await getEntry(db, me, id))?.references).toEqual([]);
    // Numbers only: no text and no translation is stored.
    expect(Object.keys(outlineEntryScriptureReferences)).not.toContain("translation");
  });

  it("refuse a passage the Bible does not have, and more than an entry may hold", async () => {
    const parse = (value: unknown) => schemas.entryReferences.safeParse(value);
    expect(parse([{ ...john316, verseStart: 99 }]).success).toBe(false);
    expect(parse([{ ...john316, book: 67 }]).success).toBe(false);
    const many = Array.from({ length: outlineLimits.references + 1 }, (_, index) => ({
      ...john316,
      verseStart: index + 1,
    }));
    expect(parse(many).success).toBe(false);
    expect(parse(many.slice(1)).success).toBe(true);
    const spanish = outlineSchemas("es").entryReferences.safeParse(many);
    expect(spanish.error?.issues[0].message).toBe("Un punto puede tener hasta 10 pasajes.");
  });
});

describe("stale changes", () => {
  it("a change of shape made against an older shape is refused, and nothing is written", async () => {
    const { one, two, three } = await tree();
    const at = await revision();
    const before = await entryRows();
    const stale = { status: "stale", revision: at };

    expect(await create({ title: "Late", expectedRevision: at - 1 })).toEqual(stale);
    expect(
      await moveEntry(
        db,
        me,
        three,
        schemas.entryMove.parse({ parentId: one, expectedRevision: at - 1 }),
      ),
    ).toEqual(stale);
    expect(await deleteEntry(db, me, two, at - 1)).toEqual(stale);
    expect(await entryRows()).toEqual(before);
    expect(await revision()).toBe(at);

    // Made against the shape as it is, each goes through and moves the revision on.
    expect(await create({ title: "On time", expectedRevision: at })).toMatchObject({
      status: "created",
      revision: at + 1,
    });
    expect(await deleteEntry(db, me, two, at + 1)).toMatchObject({ revision: at + 2 });
  });

  it("two editors moving from the same shape: the first is made and the second is told", async () => {
    const { one, two, three } = await tree();
    const at = await revision();
    const first = await moveEntry(
      db,
      me,
      three,
      schemas.entryMove.parse({ parentId: null, position: 0, expectedRevision: at }),
    );
    const second = await moveEntry(
      db,
      me,
      two,
      schemas.entryMove.parse({ parentId: one, expectedRevision: at }),
    );
    expect(first).toMatchObject({ status: "moved", revision: at + 1 });
    expect(second).toEqual({ status: "stale", revision: at + 1 });
    expect(await drawn()).toEqual(["Three", "One", "  One A", "    One A i", "  One B", "Two"]);
  });

  it("an edit made against older words is refused, with the entry as it stands", async () => {
    const id = await add("Prayer");
    await updateEntry(db, me, id, schemas.entryUpdate.parse({ title: "First edit" }));
    const late = await updateEntry(
      db,
      me,
      id,
      schemas.entryUpdate.parse({ title: "Second edit", expectedRevision: 0 }),
    );
    expect(late).toMatchObject({ status: "stale", entry: { title: "First edit", revision: 1 } });
    expect(
      await setEntryReferences(db, me, id, schemas.entryReferences.parse([john316]), 0),
    ).toMatchObject({ status: "stale", entry: { references: [] } });
    expect((await getEntry(db, me, id))?.title).toBe("First edit");

    expect(
      await updateEntry(
        db,
        me,
        id,
        schemas.entryUpdate.parse({ title: "Second edit", expectedRevision: 1 }),
      ),
    ).toMatchObject({ status: "updated", entry: { title: "Second edit", revision: 2 } });
  });

  it("a move does not make an edit stale, and an edit does not make a move stale", async () => {
    const { one, two } = await tree();
    const at = await revision();
    // Moved by one editor while another was typing in it.
    await moveEntry(db, me, two, schemas.entryMove.parse({ parentId: one, expectedRevision: at }));
    expect(
      await updateEntry(
        db,
        me,
        two,
        schemas.entryUpdate.parse({ title: "Two, edited", expectedRevision: 0 }),
      ),
    ).toMatchObject({ status: "updated", entry: { parentId: one, title: "Two, edited" } });
    // And the edit did not move the shape's revision.
    expect(
      await moveEntry(
        db,
        me,
        two,
        schemas.entryMove.parse({ parentId: null, expectedRevision: at + 1 }),
      ),
    ).toMatchObject({ status: "moved", revision: at + 2 });
  });

  it("several changes of shape at once all land, one after another", async () => {
    const outcomes = await Promise.all(
      ["a", "b", "c", "d", "e"].map((title) => create({ title, position: 0 })),
    );
    expect(outcomes.every((outcome) => outcome.status === "created")).toBe(true);
    expect(await drawn()).toHaveLength(5);
    expect(await revision()).toBe(5);
    await expectTidy();
  });
});

describe("an entry made from a saved point", () => {
  it("copies the point's title and notes, remembers it, and is edited apart from it", async () => {
    const point = await stored("Pray without ceasing", { kind: "point", notes: "1 Thess 5" });
    const before = (await db.select().from(ideas).where(eq(ideas.id, point)))[0];

    const made = await create({ sourcePointId: point });
    expect(made).toMatchObject({
      status: "created",
      entry: { title: "Pray without ceasing", notes: "1 Thess 5", sourcePointId: point },
    });
    if (made.status !== "created") throw new Error(made.status);

    await updateEntry(db, me, made.entry.id, schemas.entryUpdate.parse({ title: "Keep praying" }));
    expect((await getEntry(db, me, made.entry.id))?.sourcePointId).toBe(point);
    // The point is exactly as it was: nothing was written back, and no date moved.
    expect((await db.select().from(ideas).where(eq(ideas.id, point)))[0]).toEqual(before);

    // And an edit to the point does not reach the entry.
    await updateIdea(db, me, point, ideaUpdateSchema.parse({ kind: "point", title: "Renamed" }));
    expect((await getEntry(db, me, made.entry.id))?.title).toBe("Keep praying");
  });

  it("uses the words the request gives in place of the point's", async () => {
    const point = await stored("Pray without ceasing", { kind: "point", notes: "1 Thess 5" });
    expect(await create({ sourcePointId: point, title: "My wording", notes: null })).toMatchObject({
      entry: { title: "My wording", notes: null, sourcePointId: point },
    });
  });

  it("cuts notes longer than an entry holds", async () => {
    const point = await stored("Long", { kind: "point", notes: "é".repeat(5000) });
    const made = await create({ sourcePointId: point });
    if (made.status !== "created") throw new Error(made.status);
    expect([...made.entry.notes!].length).toBe(outlineLimits.notes);
  });

  it("can be used by many entries, in many outlines", async () => {
    const point = await stored("Reused", { kind: "point" });
    const second = await outlined("Second");
    await create({ sourcePointId: point });
    await create({ sourcePointId: point });
    await create({ outlineId: second.id, sourcePointId: point });
    const rows = await entryRows();
    expect(rows.map((row) => row.sourcePointId)).toEqual([point, point, point]);
  });

  it("is refused for another account's point, a sermon, and an idea that is not there", async () => {
    const theirs = await stored("Their point", { kind: "point", ownerId: other, notes: "secret" });
    const sermon = await stored("A sermon");
    for (const sourcePointId of [theirs, sermon, nowhere]) {
      expect(await create({ sourcePointId })).toEqual({ status: "unknown_source" });
    }
    expect(await entryRows()).toHaveLength(0);
    expect(await revision()).toBe(0);
  });

  it("keeps its words and loses only the link when the point is deleted", async () => {
    const point = await stored("Pray without ceasing", { kind: "point", notes: "1 Thess 5" });
    const kept = await stored("Another point", { kind: "point" });
    const first = await create({ sourcePointId: point });
    const second = await create({ sourcePointId: kept });
    if (first.status !== "created" || second.status !== "created") throw new Error("setup");

    expect(await deleteIdea(db, me, point)).toBe("deleted");
    expect(await getEntry(db, me, first.entry.id)).toMatchObject({
      outlineId,
      title: "Pray without ceasing",
      notes: "1 Thess 5",
      sourcePointId: null,
    });
    // Its owner is still its owner, and the other entry's link is untouched.
    expect((await entryRows()).map((row) => row.ownerId)).toEqual([me, me]);
    expect((await getEntry(db, me, second.entry.id))?.sourcePointId).toBe(kept);
    expect(await drawn()).toEqual(["Pray without ceasing", "Another point"]);
  });

  it("keeps the link when the point is filed as something else", async () => {
    const point = await stored("Pray", { kind: "point" });
    const made = await create({ sourcePointId: point });
    if (made.status !== "created") throw new Error(made.status);
    await setIdeaKind(db, me, point, "sermon");
    expect((await getEntry(db, me, made.entry.id))?.sourcePointId).toBe(point);
  });
});

describe("another account", () => {
  it("cannot add to an outline that is not its own", async () => {
    expect(await create({ title: "Mine now" }, undefined, other)).toEqual({ status: "missing" });
    expect(await create({ outlineId: nowhere, title: "x" })).toEqual({ status: "missing" });
    expect(await entryRows()).toHaveLength(0);
  });

  it("cannot place its own entry under a point of someone else's outline", async () => {
    const mine = await add("Mine");
    const theirs = await outlined("Theirs", other);
    expect(
      await createEntry(
        db,
        other,
        schemas.entryCreate.parse({ outlineId: theirs.id, title: "x", parentId: mine }),
      ),
    ).toEqual({ status: "invalid_parent" });
  });
});

describe("the sermon", () => {
  it("is not written to by anything done to its outline's entries", async () => {
    const before = (await db.select().from(ideas).where(eq(ideas.id, sermonId)))[0];
    const { one, two } = await tree();
    await updateEntry(db, me, one, schemas.entryUpdate.parse({ title: "Edited", notes: "n" }));
    await setEntryReferences(db, me, one, schemas.entryReferences.parse([john316]));
    await moveEntry(db, me, two, schemas.entryMove.parse({ parentId: one }));
    await deleteEntry(db, me, one);
    expect((await db.select().from(ideas).where(eq(ideas.id, sermonId)))[0]).toEqual(before);
  });
});

describe("locking", () => {
  it("every write locks the outline's row before it touches an entry", async () => {
    const statements: string[] = [];
    const logged = drizzle({
      client: new PGlite(),
      schema,
      logger: { logQuery: (query) => statements.push(query) },
    });
    await migrate(logged, { migrationsFolder: "./drizzle" });
    const [owner] = await logged.insert(users).values({ clerkUserId: "user_me" }).returning();
    const [sermon] = await logged
      .insert(ideas)
      .values({ ownerId: owner.id, kind: "sermon", title: "Grace" })
      .returning();

    const isLock = (query: string) =>
      /from "sermon_outlines"/.test(query) && /for update/i.test(query);
    const isWrite = (query: string) =>
      /^\s*(insert into|update|delete from) "outline_entr/i.test(query);
    /** Runs one operation and checks the lock came before its first write to an entry. */
    async function locksFirst<T>(run: () => Promise<T>) {
      statements.length = 0;
      const result = await run();
      const lock = statements.findIndex(isLock);
      const write = statements.findIndex(isWrite);
      expect(lock).toBeGreaterThanOrEqual(0);
      expect(write).toBeGreaterThan(lock);
      return result;
    }

    // Making an outline locks the sermon's row before it looks for one.
    statements.length = 0;
    const made = await createOutline(logged, owner.id, sermon.id);
    if (made.status !== "created") throw new Error(made.status);
    const ideaLock = statements.findIndex(
      (query) => /from "ideas"/.test(query) && /for update/i.test(query),
    );
    expect(ideaLock).toBeGreaterThanOrEqual(0);
    expect(statements.findIndex((q) => /insert into "sermon_outlines"/.test(q))).toBeGreaterThan(
      ideaLock,
    );

    const parse = (fields: object) =>
      schemas.entryCreate.parse({ outlineId: made.outline.id, ...fields });
    const first = await locksFirst(() => createEntry(logged, owner.id, parse({ title: "One" })));
    const second = await locksFirst(() => createEntry(logged, owner.id, parse({ title: "Two" })));
    if (first.status !== "created" || second.status !== "created") throw new Error("setup");
    await locksFirst(() =>
      moveEntry(logged, owner.id, second.entry.id, schemas.entryMove.parse({ position: 0 })),
    );
    await locksFirst(() =>
      updateEntry(logged, owner.id, first.entry.id, schemas.entryUpdate.parse({ title: "x" })),
    );
    await locksFirst(() => setEntryReferences(logged, owner.id, first.entry.id, [john316]));
    await locksFirst(() => deleteEntry(logged, owner.id, first.entry.id));
  });
});

describe("the database itself", () => {
  const insert = (values: Partial<typeof outlineEntries.$inferInsert>) =>
    db.insert(outlineEntries).values({ outlineId, ownerId: me, position: 0, ...values });

  it("refuses an entry in an outline that is another account's, or is not there", async () => {
    const theirs = await outlined("Theirs", other);
    await expect(insert({ outlineId: theirs.id })).rejects.toThrow();
    await expect(insert({ outlineId: theirs.id, ownerId: other })).resolves.toBeDefined();
    await expect(insert({ outlineId: nowhere })).rejects.toThrow();
  });

  it("refuses a parent in another outline, and an entry that is its own parent", async () => {
    const second = await outlined("Second");
    const [elsewhere] = await insert({ outlineId: second.id }).returning();
    await expect(insert({ parentId: elsewhere.id })).rejects.toThrow();
    await expect(insert({ id: nowhere, parentId: nowhere })).rejects.toThrow();
  });

  it("refuses a second introduction or conclusion, and either one under a point", async () => {
    const [point] = await insert({}).returning();
    for (const entryType of ["introduction", "conclusion"] as const) {
      await insert({ entryType });
      await expect(insert({ entryType })).rejects.toThrow();
      await expect(insert({ entryType, parentId: point.id })).rejects.toThrow();
    }
    await expect(insert({ entryType: "appendix" as never, position: 5 })).rejects.toThrow();
  });

  it("refuses two points at one place, among the main points and under a parent", async () => {
    const [point] = await insert({}).returning();
    await expect(insert({})).rejects.toThrow();
    await insert({ parentId: point.id });
    await expect(insert({ parentId: point.id })).rejects.toThrow();
    // The same place in another outline is another place.
    const second = await outlined("Second");
    await expect(insert({ outlineId: second.id })).resolves.toBeDefined();
  });

  it("refuses a title or notes too long, and notes that are empty", async () => {
    await expect(insert({ title: "x".repeat(201) })).rejects.toThrow();
    await expect(insert({ notes: "x".repeat(2001) })).rejects.toThrow();
    await expect(insert({ notes: "" })).rejects.toThrow();
    await expect(
      insert({ title: "x".repeat(200), notes: "x".repeat(2000) }),
    ).resolves.toBeDefined();
  });

  it("refuses an entry made from another account's point", async () => {
    const theirs = await stored("Their point", { kind: "point", ownerId: other });
    await expect(insert({ sourcePointId: theirs })).rejects.toThrow();
    await expect(insert({ sourcePointId: nowhere })).rejects.toThrow();
  });

  it("refuses a passage that is not one, as on an idea", async () => {
    const [entry] = await insert({}).returning();
    const reference = (values: object) =>
      db
        .insert(outlineEntryScriptureReferences)
        .values({ entryId: entry.id, position: 0, book: 43, chapterStart: 3, ...values });
    await expect(reference({ book: 67 })).rejects.toThrow();
    await expect(reference({ chapterStart: 0 })).rejects.toThrow();
    await expect(reference({ verseEnd: 5 })).rejects.toThrow();
    await expect(reference({ chapterEnd: 2 })).rejects.toThrow();
    await expect(reference({ entryId: nowhere })).rejects.toThrow();
    await reference({ verseStart: 16 });
    await expect(reference({ verseStart: 17 })).rejects.toThrow();
  });
});
