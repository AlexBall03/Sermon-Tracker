// @vitest-environment node
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { ideas, outlineEntries, sermonOutlines, users } from "@/db/schema";
import { createTestDatabase } from "@/db/testing";
import type { Database } from "@/db/types";
import { archiveIdea, deleteIdea, setIdeaKind } from "@/features/ideas/ideas";
import { createEntry } from "./entries";
import { defaultNumbering, numberingConfigSchema } from "./numbering";
import {
  createOutline,
  deleteOutline,
  getOutline,
  getOutlineForSermon,
  listOutlines,
  setNumbering,
} from "./outlines";
import { outlineSchemas } from "./schemas";

/*
 * An outline's life, against a real in-memory PostgreSQL: what the service
 * allows, what the table refuses whatever the service does, and that none of
 * it touches the sermon.
 */

let db: Database;
let me: string;
let other: string;

const old = new Date("2026-01-01T00:00:00Z");
const { entryCreate } = outlineSchemas();

beforeEach(async () => {
  db = await createTestDatabase();
  const rows = await db
    .insert(users)
    .values([{ clerkUserId: "user_me" }, { clerkUserId: "user_other" }])
    .returning();
  [me, other] = rows.map((row) => row.id);
});

/** A row written directly, with old dates so any write to it would show. A sermon of mine by default. */
async function stored(title: string, fields: Partial<typeof ideas.$inferInsert> = {}) {
  const [row] = await db
    .insert(ideas)
    .values({ ownerId: me, kind: "sermon", title, createdAt: old, updatedAt: old, ...fields })
    .returning();
  return row.id;
}

async function outlined(title: string, owner = me) {
  const sermonId = await stored(title, { ownerId: owner });
  const outcome = await createOutline(db, owner, sermonId);
  if (outcome.status !== "created") throw new Error(outcome.status);
  return { sermonId, id: outcome.outline.id };
}

const point = (outlineId: string, title: string, owner = me) =>
  createEntry(db, owner, entryCreate.parse({ outlineId, title }));

const ideaRow = async (id: string) => (await db.select().from(ideas).where(eq(ideas.id, id)))[0];
const outlineRows = () => db.select().from(sermonOutlines);

describe("making an outline", () => {
  it("gives a sermon an empty outline with the default numbering", async () => {
    const sermonId = await stored("Grace");
    const outcome = await createOutline(db, me, sermonId);
    expect(outcome).toMatchObject({
      status: "created",
      outline: { sermonId, numbering: defaultNumbering, revision: 0 },
    });

    const outline = await getOutlineForSermon(db, me, sermonId);
    expect(outline).toMatchObject({
      sermonId,
      entries: [],
      sermon: { id: sermonId, title: "Grace", kind: "sermon", archivedAt: null },
    });
    expect(await getOutline(db, me, outline!.id)).toEqual(outline);
  });

  it("takes an ID from the browser", async () => {
    const sermonId = await stored("Grace");
    const id = "0b6a3c1e-9d54-4c7e-8a55-1f1f6d3b2a10";
    expect(await createOutline(db, me, sermonId, id)).toMatchObject({
      status: "created",
      outline: { id },
    });
  });

  it("answers a second request with the one there is, and makes none", async () => {
    const { sermonId, id } = await outlined("Grace");
    await point(id, "First");
    for (const requestId of [undefined, "0b6a3c1e-9d54-4c7e-8a55-1f1f6d3b2a10"]) {
      expect(await createOutline(db, me, sermonId, requestId)).toMatchObject({
        status: "exists",
        outline: { id, revision: 1 },
      });
    }
    expect(await outlineRows()).toHaveLength(1);
    expect((await getOutline(db, me, id))?.entries).toHaveLength(1);
  });

  it("makes one when several requests arrive at once", async () => {
    const sermonId = await stored("Grace");
    const outcomes = await Promise.all(
      Array.from({ length: 4 }, () => createOutline(db, me, sermonId)),
    );
    expect(outcomes.filter((outcome) => outcome.status === "created")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "exists")).toHaveLength(3);
    expect(await outlineRows()).toHaveLength(1);
  });

  it("refuses a point and an undecided idea", async () => {
    for (const kind of ["point", "undecided"] as const) {
      const id = await stored(`A ${kind}`, { kind });
      expect(await createOutline(db, me, id)).toEqual({ status: "not_sermon" });
    }
    expect(await outlineRows()).toHaveLength(0);
  });

  it("cannot be made for a sermon that is someone else's, or that does not exist", async () => {
    const theirs = await stored("Theirs", { ownerId: other });
    expect(await createOutline(db, me, theirs)).toEqual({ status: "missing" });
    expect(await createOutline(db, me, "0b6a3c1e-9d54-4c7e-8a55-1f1f6d3b2a10")).toEqual({
      status: "missing",
    });
    expect(await outlineRows()).toHaveLength(0);
  });

  it("cannot take an ID that another account's outline has", async () => {
    const theirs = await outlined("Theirs", other);
    const mine = await stored("Mine");
    expect(await createOutline(db, me, mine, theirs.id)).toEqual({ status: "unavailable" });
    expect(await getOutlineForSermon(db, me, mine)).toBeNull();
    expect(await outlineRows()).toHaveLength(1);
  });

  it("can be made for an archived sermon, which stays archived", async () => {
    const sermonId = await stored("Shelved", { archivedAt: old });
    expect((await createOutline(db, me, sermonId)).status).toBe("created");
    expect((await ideaRow(sermonId)).archivedAt).toEqual(old);
  });

  it("writes nothing to the sermon", async () => {
    const sermonId = await stored("Grace", { status: "developing" });
    const before = await ideaRow(sermonId);
    const created = await createOutline(db, me, sermonId);
    if (created.status !== "created") throw new Error(created.status);
    await point(created.outline.id, "First");
    await setNumbering(db, me, created.outline.id, { version: 1, preset: "decimal" });
    await deleteOutline(db, me, created.outline.id);
    expect(await ideaRow(sermonId)).toEqual(before);
  });
});

describe("reading an outline", () => {
  it("finds nothing for another account, by the outline or by the sermon", async () => {
    const { sermonId, id } = await outlined("Grace");
    await point(id, "First");
    expect(await getOutline(db, other, id)).toBeNull();
    expect(await getOutlineForSermon(db, other, sermonId)).toBeNull();
    expect((await listOutlines(db, other)).items).toEqual([]);
  });

  it("finds nothing for a sermon with no outline", async () => {
    expect(await getOutlineForSermon(db, me, await stored("Bare"))).toBeNull();
  });

  it("still returns the outline of a sermon since archived or filed as a point", async () => {
    const archived = await outlined("Archived");
    await archiveIdea(db, me, archived.sermonId);
    expect((await getOutline(db, me, archived.id))?.sermon.archivedAt).toBeInstanceOf(Date);

    const refiled = await outlined("Refiled");
    await setIdeaKind(db, me, refiled.sermonId, "point");
    expect((await getOutline(db, me, refiled.id))?.sermon.kind).toBe("point");
  });
});

describe("listing outlines", () => {
  it("lists the owner's, most recently worked on first, with how many entries each has", async () => {
    const first = await outlined("First");
    const second = await outlined("Second");
    await outlined("Someone else's", other);
    await db.update(sermonOutlines).set({ updatedAt: old }).where(eq(sermonOutlines.id, second.id));
    await point(first.id, "A");
    await point(first.id, "B");

    const page = await listOutlines(db, me);
    expect(page).toMatchObject({ total: 2, page: 1, totalPages: 1 });
    expect(page.items.map((item) => [item.sermon.title, item.entryCount])).toEqual([
      ["First", 2],
      // An empty outline is an outline.
      ["Second", 0],
    ]);
  });

  it("leaves out an archived sermon's unless asked, and a refiled idea's until it is filed back", async () => {
    await outlined("Active");
    const archived = await outlined("Archived");
    await archiveIdea(db, me, archived.sermonId);
    const refiled = await outlined("Refiled");
    await setIdeaKind(db, me, refiled.sermonId, "undecided");

    const titles = async (archive?: "active" | "archived" | "all") =>
      (await listOutlines(db, me, { archive })).items.map((item) => item.sermon.title).sort();
    expect(await titles()).toEqual(["Active"]);
    expect(await titles("archived")).toEqual(["Archived"]);
    expect(await titles("all")).toEqual(["Active", "Archived"]);

    await setIdeaKind(db, me, refiled.sermonId, "sermon");
    expect(await titles()).toEqual(["Active", "Refiled"]);
    // Nothing was deleted in between.
    expect(await outlineRows()).toHaveLength(3);
  });

  it("pages, and gives the last page for one past the end", async () => {
    for (const title of ["A", "B", "C"]) await outlined(title);
    const page = await listOutlines(db, me, { page: 9, pageSize: 2 });
    expect(page).toMatchObject({ total: 3, page: 2, pageSize: 2, totalPages: 2 });
    expect(page.items).toHaveLength(1);
    expect(await listOutlines(db, me, { pageSize: 0 })).toMatchObject({ pageSize: 24 });
  });
});

describe("changing the numbering", () => {
  it("changes the configuration and nothing else", async () => {
    const { id } = await outlined("Grace");
    const first = await point(id, "First");
    if (first.status !== "created") throw new Error(first.status);
    await createEntry(
      db,
      me,
      entryCreate.parse({ outlineId: id, parentId: first.entry.id, title: "Under", notes: "n" }),
    );
    const before = await db.select().from(outlineEntries);
    const outline = await getOutline(db, me, id);

    const custom = numberingConfigSchema.parse({
      version: 1,
      preset: "custom",
      levels: [{ counter: "roman", prefix: "POINT ", suffix: "" }],
    });
    for (const numbering of [{ version: 1, preset: "bullets" } as const, custom]) {
      const saved = await setNumbering(db, me, id, numbering);
      expect(saved).toMatchObject({ id, numbering, revision: outline!.revision });
      expect((await getOutline(db, me, id))?.numbering).toEqual(numbering);
    }
    // No title, note, parent, place, or revision of any entry moved.
    expect(await db.select().from(outlineEntries)).toEqual(before);
  });

  it("is refused for another account's outline, which keeps its own", async () => {
    const { id } = await outlined("Grace");
    expect(await setNumbering(db, other, id, { version: 1, preset: "none" })).toBeNull();
    expect((await getOutline(db, me, id))?.numbering).toEqual(defaultNumbering);
  });

  it("reads as the default when what is stored cannot be read", async () => {
    const { id } = await outlined("Grace");
    await db
      .update(sermonOutlines)
      .set({ numberingConfig: { version: 9, preset: "later" } as never })
      .where(eq(sermonOutlines.id, id));
    expect((await getOutline(db, me, id))?.numbering).toEqual(defaultNumbering);
  });
});

describe("deleting", () => {
  it("an outline removes its entries and keeps the sermon exactly as it was", async () => {
    const { sermonId, id } = await outlined("Grace");
    await point(id, "First");
    const before = await ideaRow(sermonId);

    expect(await deleteOutline(db, me, id)).toEqual({ sermonId });
    expect(await outlineRows()).toHaveLength(0);
    expect(await db.select().from(outlineEntries)).toHaveLength(0);
    expect(await ideaRow(sermonId)).toEqual(before);
    // And the sermon can be given one again.
    expect((await createOutline(db, me, sermonId)).status).toBe("created");
  });

  it("an outline is refused for another account, and is no error for one that is gone", async () => {
    const { id } = await outlined("Grace");
    expect(await deleteOutline(db, other, id)).toBeNull();
    expect(await outlineRows()).toHaveLength(1);
    expect(await deleteOutline(db, me, id)).not.toBeNull();
    expect(await deleteOutline(db, me, id)).toBeNull();
  });

  it("a sermon removes its outline and entries, and no one else's", async () => {
    const mine = await outlined("Mine");
    await point(mine.id, "First");
    const kept = await outlined("Kept");
    await point(kept.id, "Stays");

    expect(await deleteIdea(db, me, mine.sermonId)).toBe("deleted");
    expect((await outlineRows()).map((row) => row.id)).toEqual([kept.id]);
    expect((await db.select().from(outlineEntries)).map((row) => row.title)).toEqual(["Stays"]);
  });
});

describe("the database itself", () => {
  const insert = (values: typeof sermonOutlines.$inferInsert) =>
    db.insert(sermonOutlines).values(values);

  it("refuses a second outline for one sermon", async () => {
    const { sermonId } = await outlined("Grace");
    await expect(insert({ ownerId: me, sermonId })).rejects.toThrow();
  });

  it("refuses an outline that names another account's sermon, or an idea that is not there", async () => {
    const theirs = await stored("Theirs", { ownerId: other });
    await expect(insert({ ownerId: me, sermonId: theirs })).rejects.toThrow();
    await expect(
      insert({ ownerId: me, sermonId: "0b6a3c1e-9d54-4c7e-8a55-1f1f6d3b2a10" }),
    ).rejects.toThrow();
  });

  it("refuses a configuration that is not an object, or is too large", async () => {
    const sermonId = await stored("Grace");
    await expect(
      insert({ ownerId: me, sermonId, numberingConfig: ["traditional"] as never }),
    ).rejects.toThrow();
    await expect(
      insert({ ownerId: me, sermonId, numberingConfig: { pad: "x".repeat(4000) } as never }),
    ).rejects.toThrow();
  });
});
