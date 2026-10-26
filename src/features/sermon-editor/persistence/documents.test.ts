// @vitest-environment node
import type { JSONContent } from "@tiptap/core";
import { eq } from "drizzle-orm";
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
    await updateDocument(db, me, outlineId, sermon("Grace, again"), 0);
    expect(await getOutline(db, me, outlineId)).toEqual(outline);
    expect(await listEntries(db, me, outlineId)).toEqual(entries);
    // Not the sermon either: no date moves, and nothing counts as developing it.
    expect(await idea()).toEqual(sermonBefore);

    // The legacy editor's writes go on as before, and leave the document alone.
    const [before] = await documentRows();
    expect(
      (await updateEntry(db, me, added.entry.id, { title: "Point one, renamed" })).status,
    ).toBe("updated");
    expect((await getOutline(db, me, outlineId))!.revision).toBe(outline!.revision);
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
