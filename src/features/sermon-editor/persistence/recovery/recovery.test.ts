import "fake-indexeddb/auto";

import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { documentV4, pointV4, proseV4 } from "@/features/editor-lab/v4/fixtures";
import { forgetAccount, resetAccountMemory } from "@/features/offline/account";
import { closeOfflineDb, openOfflineDb } from "@/features/offline/db";
import { currentRefusal, draftKind, draftStatus, readDraftRecord } from "./model";
import {
  confirmDraft,
  discardDraft,
  discardUnreadableDraft,
  DraftStorageError,
  listAccountDrafts,
  listDrafts,
  readDraft,
  refuseDraft,
  writeDraft,
} from "./store";

/*
 * Recovery drafts (A2.3A) against the real offline database, in
 * fake-indexeddb: the same store, keys, and transactions the browser runs.
 */

const alice = "4f1c2d3e-0000-4000-8000-00000000a11c";
const bob = "4f1c2d3e-0000-4000-8000-000000000b0b";
const outline = "0b6a3c1e-9d54-4c7e-8a55-1f1f6d3b2a10";
const otherOutline = "1c7b4d2f-0e65-4d8f-9b66-2a2a7e4c3b21";
const tab = "7d1e5f60-1111-4222-8333-444455556666";
const otherTab = "8e2f6071-2222-4333-9444-555566667777";

const doc = (words: string) => documentV4([pointV4("p-1", "Grace", 1), proseV4(words, 1)]);
const at = { outlineId: outline, draftId: tab };

async function write(
  owner: string,
  sequence: number,
  words = `Draft ${sequence}`,
  baseRevision = 3,
) {
  return writeDraft(owner, { ...at, content: doc(words), sequence, baseRevision });
}

async function ok(owner: string, target = at) {
  const read = await readDraft(owner, target);
  if (read?.status !== "ok") throw new Error(`expected a readable draft, got ${read?.status}`);
  return read;
}

async function putRaw(owner: string, id: string, data: unknown) {
  const db = await openOfflineDb();
  await db.put("accountData", { owner, kind: draftKind, id, data, updatedAt: 1 });
}

beforeEach(async () => {
  await closeOfflineDb();
  globalThis.indexedDB = new IDBFactory();
  resetAccountMemory();
});
afterEach(async () => {
  vi.restoreAllMocks();
  await closeOfflineDb();
});

describe("recovery drafts", () => {
  it("keep a snapshot whole, with its sequence, base revision, and times", async () => {
    const before = Date.now();
    expect(await write(alice, 1, "In the beginning", 7)).toBe("written");
    const read = await ok(alice);
    expect(read).toMatchObject({ outlineId: outline, draftId: tab });
    expect(read.draft).toMatchObject({
      format: 1,
      sequence: 1,
      confirmedSequence: 0,
      baseRevision: 7,
    });
    expect(read.draft.content).toEqual(doc("In the beginning"));
    expect(read.draft.createdAt).toBeGreaterThanOrEqual(before);
    expect(read.updatedAt).toBeGreaterThanOrEqual(read.draft.createdAt);
    expect(draftStatus(read.draft)).toBe("pending");

    await write(alice, 2, "In the beginning was the Word");
    const later = await ok(alice);
    expect(later.draft.createdAt).toBe(read.draft.createdAt);
    expect(later.draft.content).toEqual(doc("In the beginning was the Word"));
  });

  it("survive the database being closed and opened again", async () => {
    await write(alice, 1, "Kept");
    await closeOfflineDb();
    expect((await ok(alice)).draft.content).toEqual(doc("Kept"));
  });

  it("are never seen, confirmed, refused, or discarded by another account", async () => {
    await write(alice, 1, "Alice's words");
    expect(await readDraft(bob, at)).toBeNull();
    expect(await listDrafts(bob, outline)).toEqual([]);
    expect(await listAccountDrafts(bob)).toEqual([]);
    expect(await confirmDraft(bob, { ...at, sequence: 1, revision: 4 })).toBe("ignored");
    expect(await refuseDraft(bob, { ...at, sequence: 1, code: "stale" })).toBe("ignored");
    expect(await discardDraft(bob, { ...at, sequence: 1 })).toBe("ignored");
    expect(await discardUnreadableDraft(bob, `${outline}:${tab}`)).toBe("ignored");
    // Bob's own draft at the same outline and session is his, beside Alice's.
    await write(bob, 5, "Bob's words");
    expect((await ok(alice)).draft.content).toEqual(doc("Alice's words"));
    expect((await ok(bob)).draft.content).toEqual(doc("Bob's words"));
  });

  it("keep outlines apart", async () => {
    await write(alice, 1, "First outline");
    await writeDraft(alice, {
      outlineId: otherOutline,
      draftId: tab,
      content: doc("Second outline"),
      sequence: 1,
      baseRevision: 0,
    });
    const first = await listDrafts(alice, outline);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ status: "ok", outlineId: outline });
    expect(await listDrafts(alice, otherOutline)).toEqual([
      expect.objectContaining({ status: "ok", outlineId: otherOutline }),
    ]);
    expect(await listAccountDrafts(alice)).toHaveLength(2);
  });

  it("keep two sessions' drafts of one outline apart", async () => {
    await write(alice, 4, "Tab one");
    await writeDraft(alice, {
      outlineId: outline,
      draftId: otherTab,
      content: doc("Tab two"),
      sequence: 1,
      baseRevision: 3,
    });
    const drafts = await listDrafts(alice, outline);
    expect(drafts.map((read) => read.status === "ok" && read.draft.content)).toEqual(
      expect.arrayContaining([doc("Tab one"), doc("Tab two")]),
    );
    await confirmDraft(alice, { outlineId: outline, draftId: otherTab, sequence: 1, revision: 4 });
    expect((await ok(alice)).draft.content).toEqual(doc("Tab one"));
  });

  it("never let an acknowledgment of N remove N+1", async () => {
    await write(alice, 10, "Ten", 3);
    await write(alice, 11, "Eleven", 3);
    expect(await confirmDraft(alice, { ...at, sequence: 10, revision: 4 })).toBe("advanced");
    const read = await ok(alice);
    expect(read.draft).toMatchObject({ sequence: 11, confirmedSequence: 10, baseRevision: 4 });
    expect(read.draft.content).toEqual(doc("Eleven"));
    // A repeated or older acknowledgment changes nothing.
    expect(await confirmDraft(alice, { ...at, sequence: 10, revision: 4 })).toBe("ignored");
    expect(await confirmDraft(alice, { ...at, sequence: 9, revision: 3 })).toBe("ignored");
    // One of a snapshot never kept is not believed.
    expect(await confirmDraft(alice, { ...at, sequence: 12, revision: 9 })).toBe("ignored");
    expect((await ok(alice)).draft.sequence).toBe(11);
    // Confirming exactly what it holds clears it.
    expect(await confirmDraft(alice, { ...at, sequence: 11, revision: 5 })).toBe("cleared");
    expect(await readDraft(alice, at)).toBeNull();
  });

  it("decide overlapping acknowledgments and writes under one transaction each", async () => {
    await write(alice, 10, "Ten", 3);
    const [written, confirmed] = await Promise.all([
      write(alice, 11, "Eleven", 3),
      confirmDraft(alice, { ...at, sequence: 10, revision: 4 }),
    ]);
    expect([written, confirmed]).toEqual(["written", "advanced"]);
    expect((await ok(alice)).draft).toMatchObject({ sequence: 11, baseRevision: 4 });
  });

  it("never let a delayed older write replace a newer snapshot", async () => {
    await write(alice, 11, "Eleven");
    expect(await write(alice, 10, "Ten")).toBe("superseded");
    expect(await write(alice, 11, "Eleven again")).toBe("superseded");
    expect((await ok(alice)).draft).toMatchObject({ sequence: 11, content: doc("Eleven") });
  });

  it("never take the base revision back", async () => {
    await write(alice, 1, "One", 3);
    await write(alice, 2, "Two", 3);
    await confirmDraft(alice, { ...at, sequence: 1, revision: 4 });
    await write(alice, 3, "Three", 3);
    expect((await ok(alice)).draft.baseRevision).toBe(4);
  });

  it("keep the words when the server refuses them, until the person discards that snapshot", async () => {
    await write(alice, 3, "Mine");
    expect(await refuseDraft(alice, { ...at, sequence: 3, code: "stale", revision: 9 })).toBe(
      "refused",
    );
    const read = await ok(alice);
    expect(draftStatus(read.draft)).toBe("conflict");
    expect(read.draft.refusal).toMatchObject({ code: "stale", revision: 9 });
    expect(read.draft.content).toEqual(doc("Mine"));
    // A newer snapshot keeps the refusal: it waits for the person too.
    await write(alice, 4, "Mine, more");
    expect(draftStatus((await ok(alice)).draft)).toBe("conflict");
    // Discarding what the person saw (3) keeps the newer snapshot (4).
    expect(await discardDraft(alice, { ...at, sequence: 3 })).toBe("kept");
    expect((await ok(alice)).draft.content).toEqual(doc("Mine, more"));
    expect(await discardDraft(alice, { ...at, sequence: 4 })).toBe("discarded");
    expect(await readDraft(alice, at)).toBeNull();
  });

  it("lift a refusal only when a confirmation covers the refused snapshot", async () => {
    await write(alice, 1, "One");
    await write(alice, 2, "Two");
    await write(alice, 3, "Three");
    // Snapshot 2's save was refused; an older confirmation does not answer that.
    await refuseDraft(alice, { ...at, sequence: 2, code: "stale", revision: 6 });
    expect(await confirmDraft(alice, { ...at, sequence: 1, revision: 6 })).toBe("advanced");
    expect((await ok(alice)).draft.refusal).toMatchObject({ code: "stale", sequence: 2 });
    // After the person resolves it, a confirmation of 2 lifts it and keeps 3.
    expect(await confirmDraft(alice, { ...at, sequence: 2, revision: 7 })).toBe("advanced");
    const read = await ok(alice);
    expect(read.draft.refusal).toBeUndefined();
    expect(read.draft).toMatchObject({ sequence: 3, confirmedSequence: 2, baseRevision: 7 });
    // A refusal of a snapshot already confirmed is not believed.
    expect(await refuseDraft(alice, { ...at, sequence: 2, code: "stale" })).toBe("ignored");
  });

  it("report damaged and newer records, never hide them or show their content", async () => {
    await write(alice, 1, "Readable");
    const damaged = `${outline}:${otherTab}`;
    const newer = `${outline}:9f307182-3333-4444-a555-666677778888`;
    await putRaw(alice, damaged, { format: 1, content: "not a document", sequence: 1 });
    await putRaw(alice, newer, { format: 2, whatever: true });

    const drafts = await listDrafts(alice, outline);
    expect(drafts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "ok", draftId: tab }),
        { status: "malformed", outlineId: outline, draftId: otherTab, id: damaged },
        expect.objectContaining({ status: "unsupported", id: newer, format: 2 }),
      ]),
    );
    expect(drafts).toHaveLength(3);
    expect(JSON.stringify(drafts.filter((read) => read.status !== "ok"))).not.toContain(
      "not a document",
    );

    // An unreadable record is never written over or confirmed away.
    await expect(
      writeDraft(alice, {
        outlineId: outline,
        draftId: otherTab,
        content: doc("x"),
        sequence: 9,
        baseRevision: 0,
      }),
    ).rejects.toMatchObject({ kind: "unreadable" });
    expect(
      await confirmDraft(alice, {
        outlineId: outline,
        draftId: otherTab,
        sequence: 1,
        revision: 1,
      }),
    ).toBe("ignored");
    expect(await listDrafts(alice, outline)).toHaveLength(3);

    // Only the person's explicit choice removes one, and never a readable draft that way.
    expect(await discardUnreadableDraft(alice, `${outline}:${tab}`)).toBe("ignored");
    expect(await discardUnreadableDraft(alice, damaged)).toBe("discarded");
    expect(await listDrafts(alice, outline)).toHaveLength(2);
  });

  it("treat a record whose owner, kind, or ID disagrees with how it was asked for as damaged", () => {
    // The store's key path makes the owner field the key's, so this is checked on the reader.
    const data = {
      format: 1,
      content: doc("x"),
      sequence: 1,
      confirmedSequence: 0,
      baseRevision: 0,
      createdAt: 1,
    };
    const good = { owner: alice, kind: draftKind, id: `${outline}:${tab}`, data };
    expect(readDraftRecord(alice, good).status).toBe("ok");
    expect(readDraftRecord(alice, { ...good, owner: bob }).status).toBe("malformed");
    expect(readDraftRecord(alice, { ...good, kind: "outline" }).status).toBe("malformed");
    expect(readDraftRecord(alice, { ...good, id: `${outline.toUpperCase()}:${tab}` }).status).toBe(
      "malformed",
    );
    expect(
      readDraftRecord(alice, { ...good, data: { ...data, confirmedSequence: 1 } }).status,
    ).toBe("malformed");
    expect(readDraftRecord(alice, { ...good, data: { ...data, format: 0 } }).status).toBe(
      "malformed",
    );
  });

  it("refuse bad arguments before touching storage", async () => {
    const bad = [
      () => writeDraft("", { ...at, content: doc("x"), sequence: 1, baseRevision: 0 }),
      () =>
        writeDraft(alice, {
          outlineId: "not-a-uuid",
          draftId: tab,
          content: doc("x"),
          sequence: 1,
          baseRevision: 0,
        }),
      () =>
        writeDraft(alice, {
          outlineId: outline,
          draftId: "tab",
          content: doc("x"),
          sequence: 1,
          baseRevision: 0,
        }),
      () => writeDraft(alice, { ...at, content: doc("x"), sequence: 0, baseRevision: 0 }),
      () => writeDraft(alice, { ...at, content: doc("x"), sequence: 1.5, baseRevision: 0 }),
      () => writeDraft(alice, { ...at, content: doc("x"), sequence: 1, baseRevision: -1 }),
      () =>
        writeDraft(alice, { ...at, content: { type: "paragraph" }, sequence: 1, baseRevision: 0 }),
      () => listDrafts(alice, "nope"),
      () => confirmDraft(alice, { ...at, sequence: -2, revision: 0 }),
    ];
    for (const call of bad)
      await expect(call()).rejects.toMatchObject({ name: "DraftStorageError", kind: "invalid" });
  });

  it("say so when IndexedDB is unavailable", async () => {
    await closeOfflineDb();
    const saved = globalThis.indexedDB;
    (globalThis as { indexedDB?: IDBFactory }).indexedDB = undefined;
    try {
      const error = await write(alice, 1).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(DraftStorageError);
      expect(error).toMatchObject({ kind: "unavailable" });
      await expect(listDrafts(alice, outline)).rejects.toMatchObject({ kind: "unavailable" });
    } finally {
      globalThis.indexedDB = saved;
    }
  });

  it("say so when the device is out of space, and keep what was there", async () => {
    await write(alice, 1, "Before");
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(() => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    });
    await expect(write(alice, 2, "After")).rejects.toMatchObject({ kind: "quota" });
    vi.restoreAllMocks();
    expect((await ok(alice)).draft.content).toEqual(doc("Before"));
  });

  it("are cleared with the rest of an account deleted at its owner's request, and only that account's", async () => {
    await write(alice, 1, "Alice");
    await write(bob, 1, "Bob");
    await forgetAccount(alice);
    expect(await listAccountDrafts(alice)).toEqual([]);
    expect((await ok(bob)).draft.content).toEqual(doc("Bob"));
  });
});

describe("a snapshot's own refusal (A2.3B.2B.3)", () => {
  const oversized = (sequence: number, words = `Long ${sequence}`) =>
    writeDraft(alice, {
      ...at,
      content: doc(words),
      sequence,
      baseRevision: 3,
      refusal: "too_large",
    });

  it("is written with the snapshot, for its sequence, and is current only while it is the newest", async () => {
    expect(await oversized(1)).toBe("written");
    let draft = (await ok(alice)).draft;
    expect(draft.refusal).toMatchObject({ code: "too_large", sequence: 1 });
    expect(currentRefusal(draft)).toMatchObject({ code: "too_large" });
    expect(draftStatus(draft)).toBe("conflict");
    await oversized(2);
    expect((await ok(alice)).draft.refusal).toMatchObject({ code: "too_large", sequence: 2 });
    // A newer snapshot not refused keeps the record as history.
    await write(alice, 3, "Short");
    draft = (await ok(alice)).draft;
    expect(draft.refusal).toMatchObject({ code: "too_large", sequence: 2 });
    expect(currentRefusal(draft)).toBeNull();
    expect(draftStatus(draft)).toBe("pending");
  });

  it("never writes over a conflict, which is the line of work's", async () => {
    await write(alice, 1, "One");
    await refuseDraft(alice, { ...at, sequence: 1, code: "missing" });
    await oversized(2);
    const draft = (await ok(alice)).draft;
    expect(draft).toMatchObject({ sequence: 2, refusal: { code: "missing", sequence: 1 } });
    expect(currentRefusal(draft)).toMatchObject({ code: "missing" });
  });

  it("replaces an older snapshot's invalid refusal", async () => {
    await write(alice, 1, "One");
    await refuseDraft(alice, { ...at, sequence: 1, code: "invalid" });
    await oversized(2);
    expect((await ok(alice)).draft.refusal).toMatchObject({ code: "too_large", sequence: 2 });
  });

  it("is never recorded by an older write, and only too_large is taken", async () => {
    await write(alice, 5, "Newest");
    expect(await oversized(4)).toBe("superseded");
    expect((await ok(alice)).draft.refusal).toBeUndefined();
    await expect(
      writeDraft(alice, {
        ...at,
        content: doc("x"),
        sequence: 6,
        baseRevision: 3,
        refusal: "stale" as "too_large",
      }),
    ).rejects.toMatchObject({ kind: "invalid" });
    expect((await ok(alice)).draft.sequence).toBe(5);
  });

  it("is lifted by a confirmation of its snapshot or a later one", async () => {
    await oversized(1);
    await write(alice, 2, "Short");
    expect(await confirmDraft(alice, { ...at, sequence: 1, revision: 4 })).toBe("advanced");
    expect((await ok(alice)).draft.refusal).toBeUndefined();
  });
});
