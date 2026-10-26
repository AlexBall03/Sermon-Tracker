import "fake-indexeddb/auto";

import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OutlineActionResult } from "@/features/outlines/actions";
import {
  createOutlineStore,
  type OutlineApi,
  type OutlineStore,
} from "@/features/outlines/editor/store";
import type { SyncOutcome } from "@/features/sync/model";
import type { OfflineOutline } from "@/features/sync/outlines";
import { closeOfflineDb, openOfflineDb } from "../db";
import type { MutationRecord } from "../model";
import { claimMutation, listMutations, settleMutation } from "../queue";
import { runSync, type Sender } from "../sync/engine";
import { createDeviceOutlineApi } from "./operations";
import { refreshOutlines } from "./refresh";
import { createOutlineSaving } from "./routing";
import { getKeptOutline, outlineRecord, shownOutline } from "./store";
import { afterApplied, outlineChoicesFor, settleOutline } from "./sync";

/*
 * Phase 5D.2: an account's outlines on the device. The editor's store saves
 * through the device's API exactly as through the server's; every change is
 * written with its queued change or not at all; downloads never touch unsent
 * work; accounts are kept apart; and the engine's acknowledgements move only
 * the revisions they count.
 */

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const outlineId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const sermonId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const p1 = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const p2 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

const outline = (fields: Partial<OfflineOutline> = {}): OfflineOutline => ({
  id: outlineId,
  sermonId,
  revision: 2,
  numbering: { version: 1, preset: "traditional" },
  createdAt: "2026-10-01T10:00:00.000Z",
  updatedAt: "2026-10-01T10:00:00.000Z",
  sermon: { id: sermonId, title: "Grace", kind: "sermon", status: "developing", archivedAt: null },
  sermonReferences: [],
  entries: [
    {
      id: p1,
      parentId: null,
      type: "point",
      position: 0,
      title: "First",
      notes: null,
      revision: 3,
      references: [],
      sourcePointId: null,
    },
    {
      id: p2,
      parentId: null,
      type: "point",
      position: 1,
      title: "Second",
      notes: null,
      revision: 0,
      references: [],
      sourcePointId: null,
    },
  ],
  ...fields,
});

async function keep(
  owner: string,
  server: OfflineOutline | null,
  local: OfflineOutline | null = null,
) {
  const db = await openOfflineDb();
  await db.put("accountData", outlineRecord(owner, outlineId, { server, local }));
}

const snapshotOf = (copy: OfflineOutline) => ({
  id: copy.id,
  revision: copy.revision,
  numbering: copy.numbering,
  entries: copy.entries,
});

/** The editor's store over the device, as the offline page makes it. */
function editor(owner = A, copy = outline(), reload = vi.fn()) {
  return {
    reload,
    store: createOutlineStore(
      snapshotOf(copy),
      createDeviceOutlineApi(owner, outlineId, { locale: "en" }),
      {
        reload,
        messages: { offline: "offline", reloadFailed: "reload failed" },
        delay: 5,
      },
    ),
  };
}

/** Waits until the store has nothing left to send. */
const settled = (store: OutlineStore) =>
  vi.waitFor(() => expect(store.getState().status).toBe("saved"));

const queued = () => listMutations(A, { entityId: outlineId });
const shown = async (owner = A) => shownOutline(await getKeptOutline(owner, outlineId));

beforeEach(async () => {
  await closeOfflineDb();
  globalThis.indexedDB = new IDBFactory();
});
afterEach(() => closeOfflineDb());

describe("editing on the device", () => {
  it("keeps each change with its queued change, in order, against the revisions the server will have", async () => {
    await keep(A, outline());
    const { store } = editor();
    const added = store.addPoint(null)!;
    store.setTitle(added, "Third");
    store.flush();
    await settled(store);
    store.move(added, null, 0);
    await settled(store);

    const records = await queued();
    expect(records.map((record) => [record.type, record.baseRevision])).toEqual([
      ["outline.entry.add", 2],
      ["outline.entry.update", 0],
      ["outline.entry.move", 3],
    ]);
    expect(records.every((record) => record.entityType === "outline")).toBe(true);
    expect(records[1].payload).toEqual({ entryId: added, title: "Third", base: { title: "" } });

    const copy = await shown();
    expect(copy?.revision).toBe(4);
    const third = copy?.entries.find((entry) => entry.id === added);
    expect(third).toMatchObject({ title: "Third", position: 0, revision: 1 });
    // The server's copy is untouched until the server says otherwise.
    expect((await getKeptOutline(A, outlineId))?.server?.revision).toBe(2);
  });

  it("folds words typed on and off into the change still waiting", async () => {
    await keep(A, outline());
    const { store } = editor();
    store.setTitle(p1, "First draft");
    store.flush();
    await settled(store);
    store.setNotes(p1, "Then notes");
    store.flush();
    await settled(store);
    const records = await queued();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      type: "outline.entry.update",
      baseRevision: 3,
      payload: {
        entryId: p1,
        title: "First draft",
        notes: "Then notes",
        base: { title: "First", notes: null },
      },
    });
  });

  it("keeps passages and numbering as changes of their own", async () => {
    await keep(A, outline());
    const { store } = editor();
    const john = { book: 43, chapterStart: 3, verseStart: 16, chapterEnd: null, verseEnd: null };
    store.setReferences(p2, () => [john]);
    await settled(store);
    store.setNumbering({ version: 1, preset: "decimal" });
    await settled(store);
    store.setNumbering({ version: 1, preset: "roman" });
    await settled(store);
    store.remove(p1);
    await settled(store);
    const records = await queued();
    expect(records.map((record) => record.type)).toEqual([
      "outline.entry.references",
      "outline.numbering",
      "outline.entry.remove",
    ]);
    expect(records[0].payload).toEqual({ entryId: p2, references: [john], base: [] });
    expect(records[1].payload).toEqual({ numbering: { version: 1, preset: "roman" } });
    const copy = await shown();
    expect(copy?.entries.map((entry) => [entry.id, entry.position])).toEqual([[p2, 0]]);
    expect(copy?.numbering).toEqual({ version: 1, preset: "roman" });
  });

  it("answers a second tab's change made on an older copy as the server would", async () => {
    await keep(A, outline());
    const first = editor();
    const second = editor();
    first.store.addPoint(null);
    await settled(first.store);
    second.store.addPoint(null);
    await vi.waitFor(() => expect(second.reload).toHaveBeenCalled());
    // Nothing of the second tab's change was kept.
    expect(await queued()).toHaveLength(1);
    expect((await shown())?.entries).toHaveLength(3);
  });

  it("writes neither the copy nor the change when either cannot be written", async () => {
    await keep(A, outline());
    // Another account's change under the ID this change would take: the queue refuses it.
    const db = await openOfflineDb();
    const taken = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    await db.put("mutations", {
      opId: taken,
      owner: B,
      type: "outline.numbering",
      entityType: "outline",
      entityId: outlineId,
      payload: {},
      schemaVersion: 1,
      createdAt: 0,
      attempts: 0,
      status: "pending",
    });
    const spy = vi.spyOn(crypto, "randomUUID").mockReturnValue(taken);
    const api = createDeviceOutlineApi(A, outlineId, { locale: "en" });
    await expect(
      api.setOutlineNumbering(outlineId, { version: 1, preset: "decimal" }),
    ).rejects.toThrow();
    spy.mockRestore();
    expect(await queued()).toEqual([]);
    expect((await getKeptOutline(A, outlineId))?.local).toBeNull();
  });

  it("keeps each account's outlines to itself", async () => {
    await keep(A, outline());
    expect(await getKeptOutline(B, outlineId)).toBeNull();
    const theirs = createDeviceOutlineApi(B, outlineId, { locale: "en" });
    expect(await theirs.removeEntry(p1, 2)).toMatchObject({ ok: false, code: "missing" });
    expect(await listMutations(B)).toEqual([]);
  });
});

describe("the application's editor when the server gives no answer", () => {
  const server = (fail: () => boolean): OutlineApi => {
    const answer = async (): Promise<OutlineActionResult> => {
      if (fail()) throw new Error("offline");
      return { ok: true, message: "" };
    };
    return {
      addEntry: answer,
      updateEntry: answer,
      moveEntry: answer,
      removeEntry: answer,
      setEntryReferences: answer,
      setOutlineNumbering: answer,
    };
  };

  it("keeps the change on the device, then follows it there until the queue is empty", async () => {
    let failing = true;
    const reload = vi.fn();
    const saving = createOutlineSaving({
      owner: A,
      outlineId,
      server: server(() => failing),
      locale: "en",
      keep: true,
      sermon: { sermon: outline().sermon, sermonReferences: [] },
      reload,
    });
    const stop = saving.watch();
    const copy = outline();
    const store = createOutlineStore(snapshotOf(copy), saving.api, {
      reload,
      messages: { offline: "offline", reloadFailed: "reload failed" },
      delay: 5,
    });
    saving.attach(store);
    // Nothing kept on the device before: the store's own outline is what the change is made on.
    store.setTitle(p1, "Kept");
    store.flush();
    await settled(store);
    expect(saving.onDevice()).toBe(true);
    expect((await shown())?.entries.find((entry) => entry.id === p1)?.title).toBe("Kept");

    failing = false;
    store.setTitle(p2, "Still on the device");
    store.flush();
    await settled(store);
    expect(await queued()).toHaveLength(2);

    // The engine sends them all: back to the server, and the page is read again.
    for (const record of await queued()) await settleMutation(A, record.opId, { outcome: "done" });
    await vi.waitFor(() => expect(reload).toHaveBeenCalled());
    expect(saving.onDevice()).toBe(false);
    stop();
  });

  it("does not keep anything where this device keeps no outlines", async () => {
    const saving = createOutlineSaving({
      owner: A,
      outlineId,
      server: server(() => true),
      locale: "en",
      keep: false,
      sermon: { sermon: outline().sermon, sermonReferences: [] },
      reload: vi.fn(),
    });
    await expect(saving.api.updateEntry(p1, { title: "x", expectedRevision: 3 })).rejects.toThrow(
      "offline",
    );
    expect(await queued()).toEqual([]);
  });
});

describe("sending and acknowledging", () => {
  async function queueThree() {
    await keep(A, outline());
    const { store } = editor();
    const added = store.addPoint(null)!;
    await settled(store);
    store.setTitle(added, "New");
    store.flush();
    await settled(store);
    store.setTitle(p1, "Changed");
    store.flush();
    await settled(store);
    store.move(p2, null, 0);
    await settled(store);
    return added;
  }

  it("sends one outline's changes in order, and moves only the revisions each one counts", async () => {
    const added = await queueThree();
    const sent: string[] = [];
    // The server's shape had moved on by 4 before (made against what the device knew, then acknowledged).
    const send = vi.fn<Sender>(async (record): Promise<SyncOutcome> => {
      sent.push(`${record.type}:${record.baseRevision}`);
      if (record.type === "outline.entry.add") {
        return { status: "applied", entityId: outlineId, revision: 7 };
      }
      if (record.type === "outline.entry.update") {
        return { status: "applied", entityId: outlineId, revision: 11 };
      }
      return { status: "applied", entityId: outlineId, revision: 8 };
    });
    await runSync(A, send, {
      locks: null,
      onApplied: (record: MutationRecord, outcome: SyncOutcome) => afterApplied(A, record, outcome),
    });
    expect(sent).toEqual([
      "outline.entry.add:2",
      "outline.entry.update:0",
      "outline.entry.update:3",
      // Rebased on the shape the add produced; the words in between did not move it.
      "outline.entry.move:7",
    ]);
    expect(await queued()).toEqual([]);
    // Everything acknowledged: the copy is the server's, to be read again in full.
    const kept = await getKeptOutline(A, outlineId);
    expect(kept?.local).toBeNull();
    expect(kept?.behind).toBe(true);
    expect(kept?.server?.entries.find((entry) => entry.id === added)?.title).toBe("New");
  });

  it("sends a change left on its way again", async () => {
    await queueThree();
    const [first] = await queued();
    await claimMutation(A, first.opId);
    const send = vi.fn<Sender>(async () => ({ status: "duplicate", entityId: outlineId }));
    await runSync(A, send, { locks: null });
    expect(send.mock.calls[0][0].opId).toBe(first.opId);
    expect(await queued()).toEqual([]);
  });
});

describe("conflicts", () => {
  async function conflicted(type: MutationRecord["type"], conflict: MutationRecord["conflict"]) {
    const record = (await queued()).find((item) => item.type === type)!;
    await settleMutation(A, record.opId, { outcome: "conflict", conflict: conflict! });
    return (await queued()).find((item) => item.opId === record.opId)!;
  }

  it("applies a change of shape to the newer outline only when asked", async () => {
    await keep(A, outline());
    const { store } = editor();
    store.addPoint(null);
    await settled(store);
    const record = await conflicted("outline.entry.add", { reason: "outlineStale", revision: 9 });
    expect(await settleOutline(A, record, "applyMine")).toEqual({ baseRevision: 9 });
    expect((await queued())[0]).toMatchObject({ status: "pending", baseRevision: 9 });
  });

  it("keeps the account's words when asked, dropping only what was made on top of them", async () => {
    await keep(A, outline());
    const { store } = editor();
    store.setTitle(p1, "Mine");
    store.flush();
    await settled(store);
    store.move(p2, null, 0);
    await settled(store);
    const record = await conflicted("outline.entry.update", {
      reason: "entryStale",
      entry: { title: "Theirs", notes: null, references: [], revision: 5 },
      fields: ["title"],
    });
    expect(await settleOutline(A, record, "useAccount")).toBeNull();
    const left = await queued();
    expect(left.map((item) => item.type)).toEqual(["outline.entry.move"]);
    const kept = await getKeptOutline(A, outlineId);
    expect(kept?.local?.entries.find((entry) => entry.id === p1)?.title).toBe("Theirs");
    // An editor open on it starts again from it.
    expect(kept?.generation).toBe(1);
  });

  it("sends the words over the account's when asked, against what the account now has", async () => {
    await keep(A, outline());
    const { store } = editor();
    store.setTitle(p1, "Mine");
    store.flush();
    await settled(store);
    const record = await conflicted("outline.entry.update", {
      reason: "entryStale",
      entry: { title: "Theirs", notes: null, references: [], revision: 5 },
      fields: ["title"],
    });
    await settleOutline(A, record, "keepMine");
    expect((await queued())[0]).toMatchObject({
      status: "pending",
      baseRevision: 5,
      payload: { title: "Mine", base: { title: "Theirs" } },
    });
  });

  it("adds the words of an entry removed elsewhere as a new point", async () => {
    await keep(A, outline());
    const { store } = editor();
    store.setTitle(p1, "Mine");
    store.flush();
    await settled(store);
    const record = await conflicted("outline.entry.update", { reason: "entryMissing" });
    const resolution = await settleOutline(A, record, "addAsPoint");
    expect(resolution).toMatchObject({ type: "outline.entry.add", baseRevision: null });
    const [sent] = await queued();
    expect(sent).toMatchObject({ type: "outline.entry.add", status: "pending" });
    expect(sent.baseRevision).toBeUndefined();
    expect(sent.payload).toMatchObject({ type: "point", parentId: null, title: "Mine" });
  });

  it("keeps a change to an outline that became a sermon document until the person discards it", async () => {
    await keep(A, outline());
    const { store } = editor();
    store.setTitle(p1, "Mine");
    store.flush();
    await settled(store);
    store.move(p2, null, 0);
    await settled(store);
    const record = await conflicted("outline.entry.update", { reason: "documentAuthoritative" });
    expect(outlineChoicesFor(record)).toEqual(["discard"]);

    // A download changes nothing of what is kept here.
    const fetcher = vi.fn(async (url: string) => {
      const ids = new URL(url, "http://local").searchParams.get("ids");
      const server = outline({ revision: 9, updatedAt: "2026-10-02T10:00:00.000Z" });
      const { entries: _entries, sermonReferences: _refs, numbering: _n, ...summary } = server;
      void _entries;
      void _refs;
      void _n;
      return new Response(JSON.stringify({ owner: A, outlines: ids ? [server] : [summary] }), {
        status: 200,
      });
    });
    expect(await refreshOutlines(A, { fetcher, locks: null })).toBe("done");
    expect(fetcher).toHaveBeenCalled();
    expect((await queued()).map((item) => item.status)).toEqual(["conflict", "pending"]);
    expect((await getKeptOutline(A, outlineId))?.local?.entries[0]).toMatchObject({
      title: "Mine",
    });

    // Discarding it drops that change alone: the one behind it, and the copy, stay.
    expect(await settleOutline(A, record, "discard")).toBeNull();
    const left = await queued();
    expect(left.map((item) => item.type)).toEqual(["outline.entry.move"]);
    const kept = await getKeptOutline(A, outlineId);
    expect(kept?.local?.entries.find((entry) => entry.id === p1)?.title).toBe("Mine");
  });

  it("forgets an outline deleted from the account only when the person discards", async () => {
    await keep(A, outline());
    const { store } = editor();
    store.addPoint(null);
    await settled(store);
    const record = await conflicted("outline.entry.add", { reason: "missing" });
    expect(await getKeptOutline(A, outlineId)).not.toBeNull();
    await settleOutline(A, record, "discard");
    expect(await queued()).toEqual([]);
    expect(await getKeptOutline(A, outlineId)).toBeNull();
  });
});

describe("downloading", () => {
  function remote(owner: string, outlines: OfflineOutline[]) {
    return vi.fn(async (url: string) => {
      const ids = new URL(url, "http://local").searchParams.get("ids");
      const body = ids
        ? { owner, outlines: outlines.filter((item) => ids.split(",").includes(item.id)) }
        : {
            owner,
            outlines: outlines.map(({ id, sermonId, revision, createdAt, updatedAt, sermon }) => ({
              id,
              sermonId,
              revision,
              createdAt,
              updatedAt,
              sermon,
            })),
          };
      return new Response(JSON.stringify(body), { status: 200 });
    });
  }

  it("keeps the outlines whole, then reads again only what changed", async () => {
    const fetcher = remote(A, [outline()]);
    expect(await refreshOutlines(A, { fetcher, locks: null })).toBe("done");
    expect((await shown())?.entries).toHaveLength(2);
    fetcher.mockClear();
    expect(await refreshOutlines(A, { fetcher, locks: null })).toBe("done");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("never writes over changes made here, nor forgets an outline with queued work", async () => {
    await keep(A, outline());
    const { store } = editor();
    store.setTitle(p1, "Mine");
    store.flush();
    await settled(store);
    const newer = outline({ revision: 5, updatedAt: "2026-10-02T00:00:00.000Z" });
    await refreshOutlines(A, { fetcher: remote(A, [newer]), locks: null });
    const kept = await getKeptOutline(A, outlineId);
    expect(kept?.server?.revision).toBe(5);
    expect(kept?.local?.entries.find((entry) => entry.id === p1)?.title).toBe("Mine");

    // Gone from the account: kept while its change waits.
    await refreshOutlines(A, { fetcher: remote(A, []), locks: null });
    expect((await getKeptOutline(A, outlineId))?.local).not.toBeNull();
  });

  it("refuses another account's answer", async () => {
    expect(await refreshOutlines(A, { fetcher: remote(B, [outline()]), locks: null })).toBe(
      "wrongAccount",
    );
    expect(await getKeptOutline(A, outlineId)).toBeNull();
  });
});
