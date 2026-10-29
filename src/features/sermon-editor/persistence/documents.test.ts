// @vitest-environment node
import type { JSONContent } from "@tiptap/core";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { ideas, outlineEntries, sermonOutlineDocuments, sermonOutlines, users } from "@/db/schema";
import { createTestDatabase } from "@/db/testing";
import type { Database } from "@/db/types";
import { documentFixtures } from "@/features/editor-lab/documents";
import { documentV4, pointV4, proseV4 } from "@/features/editor-lab/v4/fixtures";
import { createEntry, listEntries, updateEntry } from "@/features/outlines/entries";
import { createOutline, deleteOutline, getOutline } from "@/features/outlines/outlines";
import { outlineSchemas } from "@/features/outlines/schemas";
import { restoreSermonDocument, v4SchemaVersion } from "@/features/sermon-editor/document";
import { createDocument, getDocument, prepareDocument, updateDocument } from "./documents";
import { documentLimits, utf8Bytes } from "./model";

/*
 * Sermon document persistence (A2.1) against an in-memory PostgreSQL with the
 * committed migrations. PGlite is one connection, so two requests "at once"
 * are run one after the other: what is proved is that each write is a single
 * statement whose own conditions decide it, which is what holds under real
 * concurrency too.
 */

let db: Database;
let me: string;
let other: string;
let outlineId: string;
let sermonId: string;
let theirs: string;

const nowhere = "0b6a3c1e-9d54-4c7e-8a55-1f1f6d3b2a10";
const old = new Date("2026-01-01T00:00:00Z");
const schemas = outlineSchemas();

const sermon = (title: string, extra: JSONContent[] = []) =>
  documentV4([pointV4("p-1", title, 1), proseV4("Grace first.", 1), ...extra]);

/** The canonical form of a document, as the core writes it. */
function canonical(json: JSONContent) {
  const restored = restoreSermonDocument(json);
  if (!restored.ok) throw new Error(JSON.stringify(restored.problems));
  return restored.doc.toJSON();
}

async function outlined(title: string, owner: string) {
  const [idea] = await db
    .insert(ideas)
    .values({ ownerId: owner, kind: "sermon", title, createdAt: old, updatedAt: old })
    .returning();
  const outcome = await createOutline(db, owner, idea.id);
  if (outcome.status !== "created") throw new Error(outcome.status);
  return { sermonId: idea.id, id: outcome.outline.id };
}

const documentRows = () => db.select().from(sermonOutlineDocuments);

beforeEach(async () => {
  db = await createTestDatabase();
  const rows = await db
    .insert(users)
    .values([{ clerkUserId: "user_me" }, { clerkUserId: "user_other" }])
    .returning();
  [me, other] = rows.map((row) => row.id);
  ({ id: outlineId, sermonId } = await outlined("Grace", me));
  ({ id: theirs } = await outlined("Their sermon", other));
});

describe("creating and reading", () => {
  it("stores the canonical document at revision 0 and reads it back", async () => {
    const outcome = await createDocument(db, me, outlineId, sermon("Saved by grace"));
    expect(outcome).toMatchObject({ status: "created", document: { outlineId, revision: 0 } });

    const read = await getDocument(db, me, outlineId);
    expect(read.status).toBe("found");
    if (read.status !== "found") return;
    expect(read.document.content).toEqual(canonical(sermon("Saved by grace")));
    expect(read.document.revision).toBe(0);
    expect(restoreSermonDocument(read.document.content).ok).toBe(true);
  });

  it("stores an older document as v4, migrated by the core", async () => {
    const v3 = documentFixtures.lampAndPath;
    expect(v3.attrs?.schemaVersion).toBeLessThan(v4SchemaVersion);
    expect((await createDocument(db, me, outlineId, v3)).status).toBe("created");
    const [row] = await documentRows();
    expect(row.content.attrs?.schemaVersion).toBe(v4SchemaVersion);
    expect(row.content).toEqual(canonical(v3));
  });

  it("says unreadable, and repairs nothing, when what is stored is no longer accepted", async () => {
    await createDocument(db, me, outlineId, sermon("Grace"));
    const broken = { type: "doc", attrs: { schemaVersion: 99 }, content: [] };
    await db.update(sermonOutlineDocuments).set({ content: broken });
    expect(await getDocument(db, me, outlineId)).toMatchObject({
      status: "unreadable",
      revision: 0,
      problems: [{ code: "unsupported_version" }],
    });
    const [row] = await documentRows();
    expect(row.content).toEqual(broken);
  });

  it("never lets a create replace an unreadable document, or call it missing", async () => {
    await createDocument(db, me, outlineId, sermon("Grace"));
    const future = { type: "doc", attrs: { schemaVersion: 5 }, content: [{ type: "hologram" }] };
    await db.update(sermonOutlineDocuments).set({ content: future, revision: 3 });

    expect(await getDocument(db, me, outlineId)).toMatchObject({
      status: "unreadable",
      revision: 3,
    });
    expect(await createDocument(db, me, outlineId, sermon("Replacement"))).toEqual({
      status: "exists",
      revision: 3,
    });
    // Sending the future document itself is refused, whatever it is sent to.
    expect((await createDocument(db, me, outlineId, future)).status).toBe("invalid");
    expect((await updateDocument(db, me, outlineId, future, 3)).status).toBe("invalid");
    const [row] = await documentRows();
    expect(row).toMatchObject({ revision: 3, content: future });
  });
});

describe("what is refused", () => {
  const duplicate = documentV4([pointV4("same", "One", 1), pointV4("same", "Two", 1)]);
  const missingId = documentV4([{ type: "point", attrs: { depth: 1 }, content: [] }]);
  const cases: [string, unknown, string][] = [
    ["not a document", { type: "paragraph" }, "not_a_document"],
    ["not an object", "doc", "not_a_document"],
    ["a newer version", { ...sermon("Grace"), attrs: { schemaVersion: 5 } }, "unsupported_version"],
    ["two nodes with one ID", duplicate, "duplicate_id"],
    ["a node without its ID", missingId, "missing_id"],
  ];

  it.each(cases)("refuses %s, and stores nothing", async (_name, json, code) => {
    const outcome = await createDocument(db, me, outlineId, json);
    expect(outcome.status).toBe("invalid");
    if (outcome.status === "invalid") expect(outcome.problems.map((p) => p.code)).toContain(code);
    expect(await documentRows()).toHaveLength(0);
  });

  it("refuses an invalid save and keeps the document as it was", async () => {
    await createDocument(db, me, outlineId, sermon("Grace"));
    expect((await updateDocument(db, me, outlineId, duplicate, 0)).status).toBe("invalid");
    const [row] = await documentRows();
    expect(row).toMatchObject({ revision: 0, content: canonical(sermon("Grace")) });
  });

  it("refuses what is not JSON at all", () => {
    const cycle: Record<string, unknown> = { type: "doc" };
    cycle.self = cycle;
    expect(prepareDocument(cycle)).toMatchObject({ ok: false, status: "invalid" });
    expect(prepareDocument(BigInt(10))).toMatchObject({ ok: false, status: "invalid" });
  });

  it("answers text jsonb cannot store as invalid, never as a database error (A2.3A.1)", async () => {
    await createDocument(db, me, outlineId, sermon("Grace"));
    for (const [text, detail] of [
      ["a\u0000b", "nul"],
      ["a\ud800b", "unpaired_surrogate"],
    ]) {
      const json = sermon("Grace", [proseV4(text, 1)]);
      expect(await updateDocument(db, me, outlineId, json, 0)).toEqual({
        status: "invalid",
        problems: [{ code: "unstorable_text", path: "/content/2/content/0/text", detail }],
      });
      expect((await createDocument(db, me, outlineId, json)).status).toBe("invalid");
    }
    const [row] = await documentRows();
    expect(row).toMatchObject({ revision: 0, content: canonical(sermon("Grace")) });
    // Paired surrogates are ordinary text, and are stored.
    const emoji = sermon("Grace", [proseV4("Joy 😀 🙏", 1)]);
    expect(await updateDocument(db, me, outlineId, emoji, 0)).toMatchObject({ status: "updated" });
    expect((await getDocument(db, me, outlineId)).status).toBe("found");
  });
});

describe("whose outline", () => {
  it("answers missing for another account's outline and for none, writing nothing", async () => {
    expect(await createDocument(db, me, theirs, sermon("Mine now"))).toEqual({
      status: "missing",
    });
    expect(await createDocument(db, me, nowhere, sermon("Nowhere"))).toEqual({
      status: "missing",
    });
    expect(await documentRows()).toHaveLength(0);
  });

  it("neither shows nor saves another account's document", async () => {
    await createDocument(db, other, theirs, sermon("Theirs"));
    expect(await getDocument(db, me, theirs)).toEqual({ status: "missing" });
    expect(await updateDocument(db, me, theirs, sermon("Mine now"), 0)).toEqual({
      status: "missing",
    });
    expect(await getDocument(db, me, outlineId)).toEqual({ status: "missing" });
    const [row] = await documentRows();
    expect(row).toMatchObject({
      ownerId: other,
      revision: 0,
      content: canonical(sermon("Theirs")),
    });
  });

  it("answers missing for a save to an outline with no document", async () => {
    expect(await updateDocument(db, me, outlineId, sermon("Grace"), 0)).toEqual({
      status: "missing",
    });
  });
});

describe("one document to an outline", () => {
  it("answers exists for a second create and leaves the first exactly as it was", async () => {
    await createDocument(db, me, outlineId, sermon("First"));
    await updateDocument(db, me, outlineId, sermon("Edited"), 0);
    expect(await createDocument(db, me, outlineId, sermon("Second"))).toEqual({
      status: "exists",
      revision: 1,
    });
    const [row] = await documentRows();
    expect(row).toMatchObject({ revision: 1, content: canonical(sermon("Edited")) });
  });

  it("makes one of two creates sent together", async () => {
    const outcomes = await Promise.all([
      createDocument(db, me, outlineId, sermon("One")),
      createDocument(db, me, outlineId, sermon("Two")),
    ]);
    expect(outcomes.map((o) => o.status).sort()).toEqual(["created", "exists"]);
    const winner = outcomes.find((o) => o.status === "created")!;
    const rows = await documentRows();
    expect(rows).toHaveLength(1);
    if (winner.status === "created") expect(rows[0].content).toEqual(winner.document.content);
  });
});

describe("revisions", () => {
  beforeEach(async () => {
    await createDocument(db, me, outlineId, sermon("Draft"));
  });

  it("moves the revision on by one for each save made against the current one", async () => {
    expect(await updateDocument(db, me, outlineId, sermon("Second"), 0)).toMatchObject({
      status: "updated",
      revision: 1,
    });
    expect(await updateDocument(db, me, outlineId, sermon("Third"), 1)).toMatchObject({
      status: "updated",
      revision: 2,
    });
    const read = await getDocument(db, me, outlineId);
    expect(read).toMatchObject({ status: "found", document: { revision: 2 } });
    if (read.status === "found") expect(read.document.content).toEqual(canonical(sermon("Third")));
  });

  it("writes nothing for a stale save and says the current revision", async () => {
    await updateDocument(db, me, outlineId, sermon("Newer"), 0);
    expect(await updateDocument(db, me, outlineId, sermon("Older"), 0)).toEqual({
      status: "stale",
      revision: 1,
    });
    expect(await updateDocument(db, me, outlineId, sermon("Ahead"), 7)).toEqual({
      status: "stale",
      revision: 1,
    });
    const [row] = await documentRows();
    expect(row).toMatchObject({ revision: 1, content: canonical(sermon("Newer")) });
  });

  it("accepts one of two saves made against the same revision", async () => {
    const outcomes = await Promise.all([
      updateDocument(db, me, outlineId, sermon("Phone"), 0),
      updateDocument(db, me, outlineId, sermon("Laptop"), 0),
    ]);
    expect(outcomes.map((o) => o.status).sort()).toEqual(["stale", "updated"]);
    expect(outcomes.find((o) => o.status === "stale")).toEqual({ status: "stale", revision: 1 });
    const [row] = await documentRows();
    expect(row.revision).toBe(1);
    const won = outcomes[0].status === "updated" ? "Phone" : "Laptop";
    expect(row.content).toEqual(canonical(sermon(won)));
  });

  it("still writes, and moves the revision, when the document is the same", async () => {
    const [before] = await documentRows();
    expect(await updateDocument(db, me, outlineId, sermon("Draft"), 0)).toMatchObject({
      status: "updated",
      revision: 1,
    });
    const [after] = await documentRows();
    expect(after.content).toEqual(before.content);
    expect(after.updatedAt.getTime()).toBeGreaterThanOrEqual(before.updatedAt.getTime());
  });
});

describe("developing the sermon (A3)", () => {
  const sermonRow = async (id = sermonId) =>
    (await db.select().from(ideas).where(eq(ideas.id, id)))[0];

  beforeEach(async () => {
    await createDocument(db, me, outlineId, sermon("Draft"));
    await createDocument(db, other, theirs, sermon("Theirs"));
  });

  it("marks the sermon developed when a save changes what the document says", async () => {
    const before = await sermonRow();
    expect(before.lastDevelopedAt).toBeNull();
    expect(await updateDocument(db, me, outlineId, sermon("Grace"), 0)).toMatchObject({
      status: "updated",
      revision: 1,
    });
    const after = await sermonRow();
    expect(after.lastDevelopedAt).not.toBeNull();
    expect(after.updatedAt.getTime()).toBeGreaterThan(old.getTime());
    expect(after.lastDevelopedAt?.getTime()).toBe(after.updatedAt.getTime());
    // Nothing else of the sermon: not its revision, status, title, or archive.
    expect(after.revision).toBe(before.revision);
    expect(after.status).toBe(before.status);
    expect(after.title).toBe(before.title);
    expect(after.archivedAt).toBe(before.archivedAt);
  });

  it("does not mark it for a save of the same content, which still moves the revision", async () => {
    expect(await updateDocument(db, me, outlineId, sermon("Draft"), 0)).toMatchObject({
      status: "updated",
      revision: 1,
    });
    const after = await sermonRow();
    expect(after.lastDevelopedAt).toBeNull();
    expect(after.updatedAt).toEqual(old);
  });

  it("does not mark it for a stale, refused, or missing save", async () => {
    expect((await updateDocument(db, me, outlineId, sermon("Stale"), 5)).status).toBe("stale");
    expect((await updateDocument(db, me, outlineId, { type: "nope" }, 0)).status).toBe("invalid");
    const huge = sermon("Big", [proseV4("x".repeat(documentLimits.bytes), 1)]);
    expect((await updateDocument(db, me, outlineId, huge, 0)).status).toBe("too_large");
    expect((await updateDocument(db, me, nowhere, sermon("Nowhere"), 0)).status).toBe("missing");
    const after = await sermonRow();
    expect(after.lastDevelopedAt).toBeNull();
    expect(after.updatedAt).toEqual(old);
  });

  it("never marks another account's sermon, and refuses a save to their outline", async () => {
    const theirSermon = (
      await db.select().from(sermonOutlines).where(eq(sermonOutlines.id, theirs))
    )[0].sermonId;
    expect((await updateDocument(db, me, theirs, sermon("Mine now"), 0)).status).toBe("missing");
    await updateDocument(db, me, outlineId, sermon("Grace"), 0);
    expect((await sermonRow(theirSermon)).lastDevelopedAt).toBeNull();
    expect((await documentRows()).find((row) => row.outlineId === theirs)?.revision).toBe(0);
  });

  it("rolls the save back with the mark: neither is kept when either fails", async () => {
    await db.execute(sql`
      create function refuse_development() returns trigger language plpgsql as
        $$ begin raise exception 'refused for the test'; end $$
    `);
    await db.execute(sql`
      create trigger refuse_development before update on ideas
        for each row execute function refuse_development()
    `);
    const [before] = (await documentRows()).filter((row) => row.outlineId === outlineId);
    await expect(updateDocument(db, me, outlineId, sermon("Grace"), 0)).rejects.toThrow();
    const [after] = (await documentRows()).filter((row) => row.outlineId === outlineId);
    expect(after).toEqual(before);
    expect((await sermonRow()).lastDevelopedAt).toBeNull();

    // A save that changes nothing never reaches the sermon, so the trigger does not stop it.
    expect((await updateDocument(db, me, outlineId, sermon("Draft"), 0)).status).toBe("updated");
    await db.execute(sql`drop trigger refuse_development on ideas`);
    expect((await updateDocument(db, me, outlineId, sermon("Grace"), 1)).status).toBe("updated");
    expect((await sermonRow()).lastDevelopedAt).not.toBeNull();
  });
});

describe("size", () => {
  const limit = documentLimits.bytes;
  const withText = (text: string) => sermon("Long", [proseV4(text, 1)]);
  // What the document weighs without the long paragraph's text.
  const base = utf8Bytes(JSON.stringify(canonical(withText("x")))) - 1;

  it("accepts a document of exactly the limit", async () => {
    const json = withText("x".repeat(limit - base));
    expect(utf8Bytes(JSON.stringify(canonical(json)))).toBe(limit);
    expect((await createDocument(db, me, outlineId, json)).status).toBe("created");
  });

  it("refuses one byte more, says by how much, and stores nothing", async () => {
    const outcome = await createDocument(db, me, outlineId, withText("x".repeat(limit - base + 1)));
    expect(outcome).toEqual({ status: "too_large", bytes: limit + 1, limit });
    expect(await documentRows()).toHaveLength(0);
  });

  it("counts UTF-8 bytes, not characters", async () => {
    const text = "é".repeat(Math.ceil((limit - base) / 2) + 1);
    expect(text.length).toBeLessThan(limit);
    expect((await createDocument(db, me, outlineId, withText(text))).status).toBe("too_large");
  });

  it("refuses a save that is too large and keeps the document", async () => {
    await createDocument(db, me, outlineId, sermon("Draft"));
    const outcome = await updateDocument(db, me, outlineId, withText("x".repeat(limit)), 0);
    expect(outcome.status).toBe("too_large");
    const [row] = await documentRows();
    expect(row).toMatchObject({ revision: 0, content: canonical(sermon("Draft")) });
  });
});

describe("a failing database", () => {
  const broken = new Proxy(
    {},
    {
      get: () => () => {
        throw new Error("connection lost");
      },
    },
  ) as unknown as Database;

  it("throws, for the caller to report", async () => {
    await expect(getDocument(broken, me, outlineId)).rejects.toThrow("connection lost");
    await expect(createDocument(broken, me, outlineId, sermon("Grace"))).rejects.toThrow(
      "connection lost",
    );
    await expect(updateDocument(broken, me, outlineId, sermon("Grace"), 0)).rejects.toThrow(
      "connection lost",
    );
  });

  it("validates before it touches the database", async () => {
    expect((await createDocument(broken, me, outlineId, { type: "nope" })).status).toBe("invalid");
  });
});

describe("the legacy outline", () => {
  it("is not changed by a document, and does not change it", async () => {
    const added = await createEntry(
      db,
      me,
      schemas.entryCreate.parse({ outlineId, title: "Point one" }),
    );
    if (added.status !== "created") throw new Error(added.status);
    const outline = await getOutline(db, me, outlineId);
    const entries = await listEntries(db, me, outlineId);
    const idea = async () => (await db.select().from(ideas).where(eq(ideas.id, sermonId)))[0];
    const sermonBefore = await idea();

    await createDocument(db, me, outlineId, sermon("Grace"));
    // Creating a document is not developing the sermon.
    expect(await idea()).toEqual(sermonBefore);
    await updateDocument(db, me, outlineId, sermon("Grace, again"), 0);
    expect(await getOutline(db, me, outlineId)).toEqual(outline);
    expect(await listEntries(db, me, outlineId)).toEqual(entries);
    // A save that changes the words develops the sermon (A3): its two dates, and nothing else.
    const sermonAfter = await idea();
    expect(sermonAfter.lastDevelopedAt).not.toBeNull();
    expect({ ...sermonAfter, updatedAt: null, lastDevelopedAt: null }).toEqual({
      ...sermonBefore,
      updatedAt: null,
      lastDevelopedAt: null,
    });

    // Since A2.2 the document is the outline's authority: a legacy write is
    // refused, and neither the entries nor the document change.
    const [before] = await documentRows();
    expect(
      (await updateEntry(db, me, added.entry.id, { title: "Point one, renamed" })).status,
    ).toBe("document_authoritative");
    expect(await listEntries(db, me, outlineId)).toEqual(entries);
    expect(await documentRows()).toEqual([before]);
  });

  it("takes its document with it when the outline is deleted", async () => {
    await createDocument(db, me, outlineId, sermon("Grace"));
    await createDocument(db, other, theirs, sermon("Theirs"));
    expect(await deleteOutline(db, me, outlineId)).toEqual({ sermonId });
    expect((await documentRows()).map((row) => row.outlineId)).toEqual([theirs]);
  });

  it("takes its document with it when the sermon is deleted", async () => {
    await createDocument(db, me, outlineId, sermon("Grace"));
    await db.delete(ideas).where(eq(ideas.id, sermonId));
    expect(await db.select().from(sermonOutlines).where(eq(sermonOutlines.id, outlineId))).toEqual(
      [],
    );
    expect(await documentRows()).toHaveLength(0);
    expect(await db.select().from(outlineEntries)).toHaveLength(0);
  });
});
