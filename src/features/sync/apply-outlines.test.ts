// @vitest-environment node
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import {
  ideas,
  outlineEntries,
  sermonOutlineDocuments,
  sermonOutlines,
  syncOperations,
  users,
} from "@/db/schema";
import { createTestDatabase } from "@/db/testing";
import type { Database } from "@/db/types";
import { createIdea } from "@/features/ideas/ideas";
import { ideaInputSchema } from "@/features/ideas/schemas";
import { createEntry, getEntry, moveEntry, updateEntry } from "@/features/outlines/entries";
import { createOutline, getOutline, listOutlines } from "@/features/outlines/outlines";
import type { OutlinesQuery } from "@/features/outlines/outlines-query";
import { searchLocalOutlines } from "@/features/offline/outlines/search";
import { convertOutline } from "@/features/sermon-editor/persistence/conversion";
import { applyMutation } from "./apply";
import type { SyncEnvelope, SyncType } from "./model";
import { offlineOutlines, outlineManifestFor } from "./snapshot";

/*
 * Phase 5D.2: changes to an outline, queued on a device and applied once,
 * shape against the outline's revision, words against the entry's.
 */

let db: Database;
let me: string;
let other: string;
let outlineId: string;
let sermonId: string;

beforeEach(async () => {
  db = await createTestDatabase();
  const rows = await db
    .insert(users)
    .values([{ clerkUserId: "user_me" }, { clerkUserId: "user_other" }])
    .returning();
  [me, other] = rows.map((row) => row.id);
  const sermon = await createIdea(
    db,
    me,
    ideaInputSchema.parse({ kind: "sermon", title: "Grace" }),
  );
  sermonId = sermon!.id;
  const made = await createOutline(db, me, sermonId);
  if (made.status !== "created") throw new Error(made.status);
  outlineId = made.outline.id;
});

const change = (
  type: SyncType,
  payload: unknown,
  baseRevision?: number,
  owner = me,
  entityId = outlineId,
): SyncEnvelope => ({
  opId: crypto.randomUUID(),
  owner,
  type,
  entityId,
  schemaVersion: 1,
  payload,
  baseRevision,
});

const apply = (envelope: SyncEnvelope, owner = me) => applyMutation(db, owner, envelope, "en");

async function point(title = "", parentId: string | null = null) {
  const outcome = await createEntry(db, me, {
    outlineId,
    type: "point",
    parentId,
    title,
    notes: null,
    sourcePointId: null,
  });
  if (outcome.status !== "created") throw new Error(outcome.status);
  return outcome.entry;
}

const outlineRevision = async () =>
  (await db.select().from(sermonOutlines).where(eq(sermonOutlines.id, outlineId)))[0].revision;

describe("changes of shape", () => {
  it("adds once, and answers the same addition again as a duplicate", async () => {
    const entryId = crypto.randomUUID();
    const envelope = change(
      "outline.entry.add",
      { entryId, type: "point", parentId: null, position: 0, title: "Grace", notes: null },
      0,
    );
    expect(await apply(envelope)).toEqual({ status: "applied", entityId: outlineId, revision: 1 });
    expect(await apply(envelope)).toEqual({ status: "duplicate", entityId: outlineId });
    // Sent again under another op (the first answer lost): already there, so done.
    expect(await apply({ ...envelope, opId: crypto.randomUUID() })).toMatchObject({
      status: "applied",
    });
    const outline = await getOutline(db, me, outlineId);
    expect(outline?.entries.map((entry) => entry.title)).toEqual(["Grace"]);
    expect(outline?.revision).toBe(1);
  });

  it("never places a change made on an older shape", async () => {
    await point("Faith");
    const envelope = change(
      "outline.entry.add",
      { entryId: crypto.randomUUID(), type: "point", parentId: null, position: 0, title: "Hope" },
      0,
    );
    expect(await apply(envelope)).toEqual({
      status: "conflict",
      conflict: { reason: "outlineStale", revision: 1 },
    });
    expect((await getOutline(db, me, outlineId))?.entries).toHaveLength(1);
  });

  it("answers a move already made as done, and a removal of what is gone as done", async () => {
    const a = await point("A");
    const b = await point("B");
    // Made elsewhere first: B under A.
    await moveEntry(db, me, b.id, { parentId: a.id, position: 0 });
    const revision = await outlineRevision();
    expect(
      await apply(change("outline.entry.move", { entryId: b.id, parentId: a.id, position: 0 }, 2)),
    ).toEqual({ status: "applied", entityId: outlineId });
    expect(await outlineRevision()).toBe(revision);

    expect(
      await apply(change("outline.entry.remove", { entryId: crypto.randomUUID() }, revision)),
    ).toEqual({ status: "applied", entityId: outlineId });
    expect(await apply(change("outline.entry.remove", { entryId: a.id }, revision))).toEqual({
      status: "applied",
      entityId: outlineId,
      revision: revision + 1,
    });
    expect((await getOutline(db, me, outlineId))?.entries).toEqual([]);
  });

  it("calls a place that no longer exists a placement conflict", async () => {
    const entryId = crypto.randomUUID();
    expect(
      await apply(
        change(
          "outline.entry.add",
          { entryId, type: "point", parentId: crypto.randomUUID(), position: 0 },
          0,
        ),
      ),
    ).toEqual({ status: "conflict", conflict: { reason: "placement" } });
  });

  it("does not count a change of shape as a change of words, or the other way round", async () => {
    const entry = await point("A");
    const before = await outlineRevision();
    await apply(
      change(
        "outline.entry.update",
        { entryId: entry.id, title: "B", base: { title: "A" } },
        entry.revision,
      ),
    );
    expect(await outlineRevision()).toBe(before);
    expect((await getEntry(db, me, entry.id))?.revision).toBe(entry.revision + 1);
  });
});

describe("changes of words and passages", () => {
  it("writes a field changed only here, made on an older revision", async () => {
    const entry = await point("Grace");
    // Elsewhere: the notes.
    await updateEntry(db, me, entry.id, { notes: "From elsewhere" });
    const outcome = await apply(
      change(
        "outline.entry.update",
        { entryId: entry.id, title: "Grace abounding", base: { title: "Grace" } },
        entry.revision,
      ),
    );
    expect(outcome).toMatchObject({ status: "applied", revision: entry.revision + 2 });
    const now = await getEntry(db, me, entry.id);
    expect(now).toMatchObject({ title: "Grace abounding", notes: "From elsewhere" });
  });

  it("leaves the same field changed in both places for the person", async () => {
    const entry = await point("Grace");
    await updateEntry(db, me, entry.id, { title: "Mercy" });
    const outcome = await apply(
      change(
        "outline.entry.update",
        { entryId: entry.id, title: "Grace abounding", base: { title: "Grace" } },
        entry.revision,
      ),
    );
    expect(outcome).toMatchObject({
      status: "conflict",
      conflict: { reason: "entryStale", fields: ["title"], entry: { title: "Mercy" } },
    });
    expect((await getEntry(db, me, entry.id))?.title).toBe("Mercy");
  });

  it("settles passages the same way, as one field", async () => {
    const entry = await point("Grace");
    const john = { book: 43, chapterStart: 3, verseStart: 16, chapterEnd: null, verseEnd: null };
    await updateEntry(db, me, entry.id, { notes: "Elsewhere" });
    expect(
      await apply(
        change(
          "outline.entry.references",
          { entryId: entry.id, references: [john], base: [] },
          entry.revision,
        ),
      ),
    ).toMatchObject({ status: "applied" });
    expect((await getEntry(db, me, entry.id))?.references).toHaveLength(1);
  });

  it("names an entry removed elsewhere, and an outline deleted", async () => {
    const entry = await point("Grace");
    const words = { entryId: entry.id, title: "B", base: { title: "Grace" } };
    await apply(change("outline.entry.remove", { entryId: entry.id }, 1));
    expect(await apply(change("outline.entry.update", words, 0))).toEqual({
      status: "conflict",
      conflict: { reason: "entryMissing" },
    });
    await db.delete(sermonOutlines).where(eq(sermonOutlines.id, outlineId));
    expect(await apply(change("outline.entry.update", words, 0))).toEqual({
      status: "conflict",
      conflict: { reason: "missing" },
    });
  });

  it("never writes to an idea but the dates outline work moves", async () => {
    const entry = await point("");
    const [before] = await db.select().from(ideas).where(eq(ideas.id, sermonId));
    await apply(
      change("outline.entry.update", { entryId: entry.id, title: "Grace", base: { title: "" } }, 0),
    );
    const [after] = await db.select().from(ideas).where(eq(ideas.id, sermonId));
    expect(after).toMatchObject({
      status: before.status,
      kind: before.kind,
      revision: before.revision,
      archivedAt: before.archivedAt,
    });
    expect(after.lastDevelopedAt).not.toBeNull();
  });
});

describe("whose outline", () => {
  it("is someone else's: as if there were none, and nothing written", async () => {
    const entryId = crypto.randomUUID();
    const envelope = change(
      "outline.entry.add",
      { entryId, type: "point", parentId: null, title: "Mine?" },
      0,
      other,
    );
    expect(await apply(envelope, other)).toEqual({
      status: "conflict",
      conflict: { reason: "missing" },
    });
    expect((await getOutline(db, me, outlineId))?.entries).toEqual([]);
    expect(
      await apply(
        change(
          "outline.numbering",
          { numbering: { version: 1, preset: "decimal" } },
          undefined,
          other,
        ),
        other,
      ),
    ).toEqual({ status: "conflict", conflict: { reason: "missing" } });
  });

  it("is downloaded only by its owner", async () => {
    await point("Grace");
    const mine = await outlineManifestFor(db, me);
    expect(mine.outlines).toMatchObject([
      { id: outlineId, sermonId, revision: 1, sermon: { title: "Grace", kind: "sermon" } },
    ]);
    expect((await outlineManifestFor(db, other)).outlines).toEqual([]);
    expect(await offlineOutlines(db, other, [outlineId])).toEqual([]);
    const [whole] = await offlineOutlines(db, me, [outlineId]);
    expect(whole.entries.map((entry) => entry.title)).toEqual(["Grace"]);
  });
});

describe("the offline overview", () => {
  it("answers each query as listOutlines does", async () => {
    const titles = ["Grace abounding", "Amazing grace", "Faith alone", "Hope", "Zeal"];
    for (const [index, title] of titles.entries()) {
      const sermon = await createIdea(db, me, ideaInputSchema.parse({ kind: "sermon", title }));
      await createOutline(db, me, sermon!.id);
      // One archived, one refiled: both are left out of the overview.
      if (index === 3)
        await db.update(ideas).set({ archivedAt: new Date() }).where(eq(ideas.id, sermon!.id));
      if (index === 4)
        await db.update(ideas).set({ kind: "point" }).where(eq(ideas.id, sermon!.id));
    }
    const ids = (await outlineManifestFor(db, me)).outlines.map((item) => item.id);
    const kept = await offlineOutlines(db, me, ids);
    const queries: OutlinesQuery[] = [
      { q: "", sort: "updated-desc", page: 1 },
      { q: "grace", sort: "title-asc", page: 1 },
      { q: "GRACE amazing", sort: "title-desc", page: 1 },
      { q: "", sort: "created-desc", page: 1 },
      { q: "", sort: "updated-asc", page: 9 },
      { q: "nothing", sort: "updated-desc", page: 1 },
    ];
    for (const query of queries) {
      for (const pageSize of [2, 24]) {
        const server = await listOutlines(db, me, { ...query, pageSize });
        const local = searchLocalOutlines(kept, query, pageSize);
        expect(local.items.map((item) => item.id)).toEqual(server.items.map((item) => item.id));
        expect([local.total, local.page, local.totalPages]).toEqual([
          server.total,
          server.page,
          server.totalPages,
        ]);
      }
    }
  });
});

describe("an outline that has become a sermon document (A2.2)", () => {
  const john316 = { book: 43, chapterStart: 3, verseStart: 16, chapterEnd: null, verseEnd: null };

  /** Everything the outline's changes could touch. */
  async function state() {
    return {
      outline: (await db.select().from(sermonOutlines).where(eq(sermonOutlines.id, outlineId)))[0],
      entries: await db
        .select()
        .from(outlineEntries)
        .where(eq(outlineEntries.outlineId, outlineId)),
      documents: await db.select().from(sermonOutlineDocuments),
      sermon: (await db.select().from(ideas).where(eq(ideas.id, sermonId)))[0],
      operations: await db.select().from(syncOperations),
    };
  }

  it("answers every queued legacy change as a documentAuthoritative conflict, writing nothing", async () => {
    const first = await point("First");
    const second = await point("Second");
    expect((await convertOutline(db, me, outlineId)).status).toBe("converted");
    const revision = await outlineRevision();
    const before = await state();

    const changes = [
      change(
        "outline.entry.add",
        { entryId: crypto.randomUUID(), type: "point", parentId: null, title: "New" },
        revision,
      ),
      change(
        "outline.entry.update",
        { entryId: first.id, title: "Renamed", base: { title: "First" } },
        0,
      ),
      // Made on an older revision too: still refused, never merged in.
      change(
        "outline.entry.update",
        { entryId: first.id, notes: "Notes", base: { notes: null } },
        7,
      ),
      change("outline.entry.references", { entryId: first.id, references: [john316], base: [] }, 0),
      change("outline.entry.move", { entryId: second.id, parentId: null, position: 0 }, revision),
      change("outline.entry.remove", { entryId: second.id }, revision),
      change("outline.numbering", { numbering: { version: 1, preset: "traditional" } }),
    ];
    for (const envelope of changes) {
      expect(await apply(envelope)).toEqual({
        status: "conflict",
        conflict: { reason: "documentAuthoritative" },
      });
    }
    // Nothing written, and no operation recorded, so none is ever mistaken for applied.
    expect(await state()).toEqual(before);
  });

  it("still answers a change applied before the conversion as a duplicate", async () => {
    const entryId = crypto.randomUUID();
    const envelope = change(
      "outline.entry.add",
      { entryId, type: "point", parentId: null, position: 0, title: "Before" },
      0,
    );
    expect(await apply(envelope)).toMatchObject({ status: "applied" });
    expect((await convertOutline(db, me, outlineId)).status).toBe("converted");

    expect(await apply(envelope)).toEqual({ status: "duplicate", entityId: outlineId });
    // The same change under a new op is new, and is refused.
    expect(await apply({ ...envelope, opId: crypto.randomUUID() })).toEqual({
      status: "conflict",
      conflict: { reason: "documentAuthoritative" },
    });
    const [document] = await db.select().from(sermonOutlineDocuments);
    expect(JSON.stringify(document.content)).toContain("Before");
  });
});
