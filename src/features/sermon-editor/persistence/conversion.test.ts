// @vitest-environment node
import type { JSONContent } from "@tiptap/core";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { ideas, outlineEntries, sermonOutlineDocuments, sermonOutlines, users } from "@/db/schema";
import { createTestDatabase } from "@/db/testing";
import type { Database } from "@/db/types";
import {
  createEntry,
  deleteEntry,
  listEntries,
  moveEntry,
  setEntryReferences,
  updateEntry,
} from "@/features/outlines/entries";
import {
  createOutline,
  deleteOutline,
  getOutline,
  setNumbering,
} from "@/features/outlines/outlines";
import { outlineSchemas } from "@/features/outlines/schemas";
import { restoreSermonDocument, v4SchemaVersion } from "@/features/sermon-editor/document";
import { convertOutline } from "./conversion";
import { getDocument } from "./documents";
import { documentLimits } from "./model";

/*
 * Converting a legacy outline into its sermon document, and the authority
 * that follows (A2.2), against an in-memory PostgreSQL with the committed
 * migrations. PGlite is one connection, so requests "at once" run in turn;
 * the race on two real connections is run against the development database
 * (docs/HANDOFF-PS-A2.md).
 */

let db: Database;
let me: string;
let other: string;
let sermonId: string;
let outlineId: string;
let theirs: string;

const schemas = outlineSchemas();
const old = new Date("2026-01-01T00:00:00Z");
const romans = { book: 45, chapterStart: 8, verseStart: 28, chapterEnd: null, verseEnd: null };
const john = { book: 43, chapterStart: 3, verseStart: 16, chapterEnd: null, verseEnd: 17 };

async function outlined(owner: string, title = "Grace") {
  const [idea] = await db
    .insert(ideas)
    .values({ ownerId: owner, kind: "sermon", title, createdAt: old, updatedAt: old })
    .returning();
  const outcome = await createOutline(db, owner, idea.id);
  if (outcome.status !== "created") throw new Error(outcome.status);
  return { sermonId: idea.id, id: outcome.outline.id };
}

async function add(input: Record<string, unknown>, owner = me, outline = outlineId) {
  const outcome = await createEntry(
    db,
    owner,
    schemas.entryCreate.parse({ outlineId: outline, ...input }),
  );
  if (outcome.status !== "created") throw new Error(outcome.status);
  return outcome.entry;
}

/** Everything a legacy outline is, to compare before and after. */
async function legacyState(id = outlineId) {
  const [outline] = await db.select().from(sermonOutlines).where(eq(sermonOutlines.id, id));
  const entries = await db.select().from(outlineEntries).where(eq(outlineEntries.outlineId, id));
  const [sermon] = await db.select().from(ideas).where(eq(ideas.id, sermonId));
  return {
    outline,
    entries: entries.sort((a, b) => a.id.localeCompare(b.id)),
    references: await db.execute(
      sql`select * from outline_entry_scripture_references order by entry_id, position`,
    ),
    sermon: {
      updatedAt: sermon.updatedAt,
      lastDevelopedAt: sermon.lastDevelopedAt,
      revision: sermon.revision,
    },
  };
}

const documents = () => db.select().from(sermonOutlineDocuments);

/** The outline's points as the stored document holds them, in order. */
const points = (content: JSONContent) =>
  (content.content ?? []).filter((node) => node.type === "point");

beforeEach(async () => {
  db = await createTestDatabase();
  const rows = await db
    .insert(users)
    .values([{ clerkUserId: "user_me" }, { clerkUserId: "user_other" }])
    .returning();
  [me, other] = rows.map((row) => row.id);
  ({ id: outlineId, sermonId } = await outlined(me));
  ({ id: theirs } = await outlined(other, "Their sermon"));
});

/** A full outline: sections, nesting, a saved point, passages, notes with spacing, custom numbering. */
async function richOutline() {
  const [point] = await db
    .insert(ideas)
    .values({ ownerId: me, kind: "point", title: "Grace is a gift", notes: "Eph 2" })
    .returning();
  const intro = await add({ type: "introduction", title: "Opening" });
  const first = await add({ title: "Called" });
  const under = await add({ title: "Before time", parentId: first.id });
  const deeper = await add({ title: "In Christ", parentId: under.id });
  const saved = await add({ sourcePointId: point.id });
  const second = await add({ title: "Kept", notes: "Held fast" });
  const conclusion = await add({ type: "conclusion", title: "Closing" });
  await setEntryReferences(db, me, first.id, [romans, john]);
  // Whitespace and blank lines exactly as stored: the form trims them, the table does not.
  await db
    .update(outlineEntries)
    .set({ notes: "  Leading space\n\nafter a blank line  \n" })
    .where(eq(outlineEntries.id, deeper.id));
  await updateEntry(db, me, second.id, { title: "Kept to the end" });
  const numbering = schemas.numbering.parse({
    version: 1,
    preset: "custom",
    levels: [
      { counter: "roman", prefix: "§ " },
      { counter: "alpha", case: "lower", suffix: ")" },
    ],
    overflow: "repeat",
    repeatFrom: 1,
  });
  expect((await setNumbering(db, me, outlineId, numbering)).status).toBe("updated");
  return { intro, first, under, deeper, saved, second, conclusion, point, numbering };
}

describe("converting a legacy outline", () => {
  it("stores the whole outline as a v4 document at revision 0, and changes nothing else", async () => {
    const outline = await richOutline();
    const before = await legacyState();

    const outcome = await convertOutline(db, me, outlineId);
    expect(outcome).toMatchObject({ status: "converted", document: { outlineId, revision: 0 } });
    expect(await legacyState()).toEqual(before);

    const [row] = await documents();
    expect(row).toMatchObject({ outlineId, ownerId: me, revision: 0 });
    const content = row.content;
    expect(restoreSermonDocument(content).ok).toBe(true);
    expect(content.attrs).toMatchObject({
      schemaVersion: v4SchemaVersion,
      legacyOutlineId: outlineId,
      legacyRevision: before.outline.revision,
      layout: { numbering: outline.numbering },
    });

    // Every entry once, in the order it is shown, at its depth, with its provenance.
    const shown = await listEntries(db, me, outlineId);
    const converted = points(content);
    expect(converted.map((node) => node.attrs?.legacyEntryId)).toEqual(
      shown.map((entry) => entry.id),
    );
    for (const [index, entry] of shown.entries()) {
      expect(converted[index].attrs).toMatchObject({
        id: entry.id,
        legacyEntryId: entry.id,
        legacyRevision: entry.revision,
        depth: entry.type === "point" ? entry.depth + 1 : 1,
        role: entry.type === "point" ? null : entry.type,
        sourcePointId: entry.sourcePointId,
        legacyParentId: null,
        derivedFrom: null,
      });
    }
    expect(
      converted.find((node) => node.attrs?.id === outline.saved.id)?.attrs?.sourcePointId,
    ).toBe(outline.point.id);
    expect(
      converted.find((node) => node.attrs?.id === outline.second.id)?.attrs?.legacyRevision,
    ).toBe(1);

    // Passages in their stored order, as references, after their entry.
    const blocks = content.content ?? [];
    const at = blocks.findIndex((node) => node.attrs?.id === outline.first.id);
    expect(blocks.slice(at + 1, at + 3).map((node) => node.attrs)).toMatchObject([
      { ...romans, print: "reference", translation: null },
      { ...john, print: "reference", translation: null },
    ]);

    // Notes, a paragraph a line: leading and trailing spaces and blank lines kept.
    const deep = blocks.findIndex((node) => node.attrs?.id === outline.deeper.id);
    const notes = blocks.slice(deep + 1, deep + 5).map((node) => node.content?.[0]?.text ?? "");
    expect(notes).toEqual(["  Leading space", "", "after a blank line  ", ""]);
  });

  it("converts an empty outline, so a new one needs no legacy editing first", async () => {
    const outcome = await convertOutline(db, me, outlineId);
    expect(outcome).toMatchObject({ status: "converted" });
    const read = await getDocument(db, me, outlineId);
    expect(read.status).toBe("found");
    if (read.status === "found") {
      expect(read.document.content.attrs).toMatchObject({ legacyOutlineId: outlineId });
    }
  });

  it("converts once: asking again, or twice together, answers with the document there is", async () => {
    await add({ title: "One" });
    const [a, b] = await Promise.all([
      convertOutline(db, me, outlineId),
      convertOutline(db, me, outlineId),
    ]);
    expect([a.status, b.status].sort()).toEqual(["converted", "exists"]);
    const [first] = await documents();
    expect(await convertOutline(db, me, outlineId)).toEqual({ status: "exists", revision: 0 });
    expect(await documents()).toEqual([first]);
  });

  it("never converts over a stored document the core no longer accepts", async () => {
    const unreadable = { type: "doc", attrs: { schemaVersion: 99 }, content: [] };
    await db
      .insert(sermonOutlineDocuments)
      .values({ outlineId, ownerId: me, content: unreadable, revision: 3 });
    const outcome = await convertOutline(db, me, outlineId);
    expect(outcome).toMatchObject({ status: "unreadable", revision: 3 });
    const [row] = await documents();
    expect(row).toMatchObject({ content: unreadable, revision: 3 });
  });

  it("includes a legacy write made before it", async () => {
    const point = await add({ title: "Before" });
    await updateEntry(db, me, point.id, { title: "Changed before converting" });
    await convertOutline(db, me, outlineId);
    const [row] = await documents();
    expect(points(row.content)[0].content?.[0]?.text).toBe("Changed before converting");
  });

  it("is another account's outline or none at all: missing, and nothing is written", async () => {
    expect(await convertOutline(db, me, theirs)).toEqual({ status: "missing" });
    expect(await convertOutline(db, other, outlineId)).toEqual({ status: "missing" });
    expect(await convertOutline(db, me, "0b6a3c1e-9d54-4c7e-8a55-1f1f6d3b2a10")).toEqual({
      status: "missing",
    });
    expect(await documents()).toHaveLength(0);
  });
});

describe("what conversion refuses, leaving the legacy outline exactly as it was", () => {
  it("refuses an entry under one of its own subpoints", async () => {
    const a = await add({ title: "A" });
    const b = await add({ title: "B", parentId: a.id });
    // The table cannot refuse a cycle; the service always has. Made here by hand.
    await db
      .update(outlineEntries)
      .set({ parentId: b.id, position: 1 })
      .where(eq(outlineEntries.id, a.id));
    const before = await legacyState();
    const outcome = await convertOutline(db, me, outlineId);
    expect(outcome.status).toBe("unsafe");
    if (outcome.status === "unsafe") {
      expect(outcome.problems.some((problem) => problem.code === "cycle")).toBe(true);
    }
    expect(await documents()).toHaveLength(0);
    expect(await legacyState()).toEqual(before);
  });

  it("refuses a point under a section", async () => {
    const intro = await add({ type: "introduction", title: "Opening" });
    const a = await add({ title: "A" });
    await db.update(outlineEntries).set({ parentId: intro.id }).where(eq(outlineEntries.id, a.id));
    expect(await convertOutline(db, me, outlineId)).toMatchObject({
      status: "unsafe",
      problems: [{ code: "section_parent", entryId: a.id }],
    });
    expect(await documents()).toHaveLength(0);
  });

  it("reads the numbering as stored, never readNumbering's default", async () => {
    await add({ title: "A" });
    for (const stored of [
      { version: 99 },
      { version: 1, preset: "no-such-style" },
      // Parses, but parsing would drop what is stored.
      { version: 1, preset: "traditional", extra: "kept by nobody" },
    ]) {
      await db
        .update(sermonOutlines)
        .set({ numberingConfig: stored as never })
        .where(eq(sermonOutlines.id, outlineId));
      // The legacy outline shows the default for the first two; converting would change that.
      expect(await convertOutline(db, me, outlineId)).toEqual({
        status: "unsafe",
        problems: [{ code: "invalid_numbering" }],
      });
    }
    expect(await documents()).toHaveLength(0);
    const [outline] = await db
      .select()
      .from(sermonOutlines)
      .where(eq(sermonOutlines.id, outlineId));
    expect(outline.numberingConfig).toEqual({
      version: 1,
      preset: "traditional",
      extra: "kept by nobody",
    });
  });

  it("keeps a custom numbering stored before a field had its default, as the outline shows it", async () => {
    await add({ title: "A" });
    const stored = { version: 1, preset: "custom", levels: [{ counter: "roman" }] };
    await db
      .update(sermonOutlines)
      .set({ numberingConfig: stored as never })
      .where(eq(sermonOutlines.id, outlineId));
    const shown = (await getOutline(db, me, outlineId))!.numbering;
    expect(await convertOutline(db, me, outlineId)).toMatchObject({ status: "converted" });
    const [row] = await documents();
    expect(row.content.attrs?.layout?.numbering).toEqual(shown);
  });

  it("refuses an outline too large to store, and cuts nothing", async () => {
    const notes = "n".repeat(2000);
    await db.insert(outlineEntries).values(
      Array.from({ length: 300 }, (_, position) => ({
        outlineId,
        ownerId: me,
        entryType: "point" as const,
        position,
        title: `Point ${position}`,
        notes,
      })),
    );
    const before = await legacyState();
    const outcome = await convertOutline(db, me, outlineId);
    expect(outcome).toMatchObject({ status: "too_large", limit: documentLimits.bytes });
    if (outcome.status === "too_large") expect(outcome.bytes).toBeGreaterThan(documentLimits.bytes);
    expect(await documents()).toHaveLength(0);
    expect(await legacyState()).toEqual(before);
  });

  it("writes nothing when the insert fails, and the outline goes on as before", async () => {
    await add({ title: "A" });
    await db.execute(sql`
      create function refuse_document() returns trigger language plpgsql as
        $$ begin raise exception 'refused for the test'; end $$
    `);
    await db.execute(sql`
      create trigger refuse_document before insert on sermon_outline_documents
        for each row execute function refuse_document()
    `);
    const before = await legacyState();
    await expect(convertOutline(db, me, outlineId)).rejects.toThrow();
    expect(await documents()).toHaveLength(0);
    expect(await legacyState()).toEqual(before);

    await db.execute(sql`drop trigger refuse_document on sermon_outline_documents`);
    expect((await add({ title: "Still a legacy outline" })).title).toBe("Still a legacy outline");
    expect((await convertOutline(db, me, outlineId)).status).toBe("converted");
  });
});

describe("after conversion, the document is the authority", () => {
  it("refuses every legacy write with document_authoritative, and writes nothing", async () => {
    const outline = await richOutline();
    expect((await convertOutline(db, me, outlineId)).status).toBe("converted");
    const before = await legacyState();
    const [document] = await documents();
    const refused = { status: "document_authoritative" };

    expect(
      await createEntry(db, me, schemas.entryCreate.parse({ outlineId, title: "New" })),
    ).toEqual(refused);
    expect(
      await createEntry(
        db,
        me,
        schemas.entryCreate.parse({ outlineId, sourcePointId: outline.point.id }),
      ),
    ).toEqual(refused);
    expect(await updateEntry(db, me, outline.first.id, { title: "Changed" })).toEqual(refused);
    expect(await setEntryReferences(db, me, outline.first.id, [])).toEqual(refused);
    expect(await moveEntry(db, me, outline.second.id, { parentId: null, position: 0 })).toEqual(
      refused,
    );
    expect(await deleteEntry(db, me, outline.first.id)).toEqual(refused);
    expect(await setNumbering(db, me, outlineId, { version: 1, preset: "traditional" })).toEqual(
      refused,
    );

    expect(await legacyState()).toEqual(before);
    expect(await documents()).toEqual([document]);
  });

  it("still lets the whole outline be deleted, and its document goes with it", async () => {
    await convertOutline(db, me, outlineId);
    const { id: kept } = await outlined(me, "Another");
    await convertOutline(db, me, kept);
    expect(await deleteOutline(db, me, outlineId)).toEqual({ sermonId });
    const left = await documents();
    expect(left.map((row) => row.outlineId)).toEqual([kept]);
  });

  it("leaves another outline's legacy writes alone", async () => {
    await convertOutline(db, me, outlineId);
    const { id: legacy } = await outlined(me, "Still legacy");
    expect((await add({ title: "Fine" }, me, legacy)).title).toBe("Fine");
    expect((await setNumbering(db, me, legacy, { version: 1, preset: "traditional" })).status).toBe(
      "updated",
    );
  });
});
