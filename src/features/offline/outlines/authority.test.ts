import "fake-indexeddb/auto";

import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createOutlineStore, type OutlineStore } from "@/features/outlines/editor/store";
import type { SyncConflict, SyncOutcome } from "@/features/sync/model";
import type { OfflineOutline, OutlineManifestItem } from "@/features/sync/outlines";
import { closeOfflineDb, openOfflineDb } from "../db";
import type { MutationRecord } from "../model";
import { claimMutation, listMutations, settleMutation } from "../queue";
import { runSync, type Sender } from "../sync/engine";
import { createDeviceOutlineApi } from "./operations";
import { refreshOutlines } from "./refresh";
import {
  getKeptOutline,
  onOutlinesChange,
  outlineRecord,
  removeKeptOutlines,
  type KeptOutline,
} from "./store";
import {
  afterApplied,
  authorityAlongside,
  discardOutlineChanges,
  outlineChoicesFor,
  settleOutline,
} from "./sync";

/*
 * A2.3D: a device learns that an outline became a sermon document, keeps that
 * for good, and from then on refuses every legacy change to it in the same
 * IndexedDB transaction that would have written it, while everything already
 * kept or queued here stays exactly as it was.
 */

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const outlineId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
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

async function put(owner: string, id: string, data: KeptOutline) {
  const db = await openOfflineDb();
  await db.put("accountData", outlineRecord(owner, id, data));
}

const manifestItem = (
  copy: OfflineOutline,
  documentAuthoritative?: boolean,
): OutlineManifestItem => ({
  id: copy.id,
  sermonId: copy.sermonId,
  revision: copy.revision,
  createdAt: copy.createdAt,
  updatedAt: copy.updatedAt,
  sermon: copy.sermon,
  ...(documentAuthoritative === undefined ? {} : { documentAuthoritative }),
});

type Listed = { copy: OfflineOutline; authoritative?: boolean };

/** The server's two answers: the list (with its word on authority), and rows by ID. */
function remote(
  owner: string,
  listed: Listed[],
  rows: (ids: string[]) => Promise<Response> | null = () => null,
) {
  return vi.fn(async (url: string) => {
    const ids = new URL(url, "http://local").searchParams.get("ids");
    if (ids) {
      const named = ids.split(",");
      const custom = rows(named);
      if (custom) return custom;
      return Response.json({
        owner,
        outlines: listed.map((item) => item.copy).filter((copy) => named.includes(copy.id)),
      });
    }
    return Response.json({
      owner,
      outlines: listed.map((item) => manifestItem(item.copy, item.authoritative)),
    });
  });
}

const refresh = (fetcher: ReturnType<typeof remote>, owner = A) =>
  refreshOutlines(owner, { fetcher, locks: null });

const kept = (owner = A, id = outlineId) => getKeptOutline(owner, id);
const queued = (owner = A) => listMutations(owner, { entityId: outlineId });

function editor(owner = A, copy = outline()) {
  return createOutlineStore(
    { id: copy.id, revision: copy.revision, numbering: copy.numbering, entries: copy.entries },
    createDeviceOutlineApi(owner, outlineId, { locale: "en" }),
    { reload: vi.fn(), messages: { offline: "offline", reloadFailed: "reload failed" }, delay: 5 },
  );
}
const settled = (store: OutlineStore) =>
  vi.waitFor(() => expect(store.getState().status).toBe("saved"));

/** Writes the device's knowledge the way the engine does, with a conflict on `record`. */
async function conflictAuthoritative(record: MutationRecord, owner = A) {
  const conflict = { reason: "documentAuthoritative" } as const;
  await settleMutation(
    owner,
    record.opId,
    { outcome: "conflict", conflict },
    authorityAlongside(owner, record, conflict),
  );
}

/** One change queued on the device: a new title for the first point. */
async function queueOne(owner = A) {
  const api = createDeviceOutlineApi(owner, outlineId, { locale: "en" });
  return api.updateEntry(p1, { title: "Mine" });
}

beforeEach(async () => {
  await closeOfflineDb();
  globalThis.indexedDB = new IDBFactory();
});
afterEach(() => closeOfflineDb());

describe("learning it from the list", () => {
  it("keeps the server's true, though the legacy revision and time have not moved", async () => {
    await refresh(remote(A, [{ copy: outline(), authoritative: false }]));
    expect((await kept())?.documentAuthoritative).toBeUndefined();
    const fetcher = remote(A, [{ copy: outline(), authoritative: true }]);
    expect(await refresh(fetcher)).toBe("done");
    expect((await kept())?.documentAuthoritative).toBe(true);
    // Its frozen legacy rows were not asked for again: the list was the only request.
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect((await kept())?.server?.entries).toHaveLength(2);
  });

  it("never takes it back for a later false, or a list from an older server that says nothing", async () => {
    await put(A, outlineId, { server: outline(), local: null, documentAuthoritative: true });
    for (const authoritative of [false, undefined]) {
      const newer = outline({ revision: 5, updatedAt: "2026-10-02T00:00:00.000Z" });
      const fetcher = remote(A, [{ copy: newer, authoritative }]);
      expect(await refresh(fetcher)).toBe("done");
      expect((await kept())?.documentAuthoritative).toBe(true);
      // Its legacy rows stay as they were: a known sermon document is not downloaded as legacy.
      expect((await kept())?.server?.revision).toBe(2);
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });

  it("keeps changes made here and their queue as they are", async () => {
    await put(A, outlineId, { server: outline(), local: null });
    expect((await queueOne()).ok).toBe(true);
    const before = await kept();
    const records = await queued();
    await refresh(remote(A, [{ copy: outline(), authoritative: true }]));
    expect(await kept()).toMatchObject({
      server: before!.server,
      local: before!.local,
      documentAuthoritative: true,
    });
    expect(await queued()).toEqual(records);
  });

  it("knows an outline it never downloaded, with nothing else of it", async () => {
    await refresh(remote(A, [{ copy: outline(), authoritative: true }]));
    expect(await kept()).toMatchObject({ server: null, local: null, documentAuthoritative: true });
  });

  it("keeps each account's knowledge to itself", async () => {
    await put(B, outlineId, { server: outline(), local: null });
    await refresh(remote(A, [{ copy: outline(), authoritative: true }]));
    expect((await kept(A))?.documentAuthoritative).toBe(true);
    expect((await kept(B))?.documentAuthoritative).toBeUndefined();
    expect(
      (await createDeviceOutlineApi(B, outlineId, { locale: "en" }).updateEntry(p1, { title: "B" }))
        .ok,
    ).toBe(true);
  });

  it("is kept when the rows that follow fail, and the download is not called whole", async () => {
    const plain = outline({ id: otherId, sermon: { ...outline().sermon, id: otherId } });
    const fetcher = remote(
      A,
      [
        { copy: outline(), authoritative: true },
        { copy: plain, authoritative: false },
      ],
      () => Promise.resolve(new Response("", { status: 503 })),
    );
    expect(await refresh(fetcher)).toBe("failed");
    expect((await kept())?.documentAuthoritative).toBe(true);
    const db = await openOfflineDb();
    const state = await db.get("accountData", [A, "state", "outlines"]);
    expect(state?.data).toMatchObject({ status: "failed", error: "network" });
    expect((state?.data as { complete?: boolean }).complete).not.toBe(true);
  });

  it("changes nothing when the list itself cannot be read", async () => {
    await put(A, outlineId, { server: outline(), local: null });
    const fetcher = vi.fn(async () => {
      throw new TypeError("offline");
    });
    expect(await refreshOutlines(A, { fetcher, locks: null })).toBe("failed");
    expect(await kept()).toEqual({ server: outline(), local: null });
  });

  it("is not lost to a row that arrives after it was learned, whatever the order", async () => {
    let release!: () => void;
    const late = new Promise<void>((resolve) => (release = resolve));
    let asked = false;
    // The first download finds the outline out of date and asks for its row, which is slow.
    const first = refresh(
      remote(A, [{ copy: outline({ revision: 4 }), authoritative: false }], () => {
        asked = true;
        return late.then(() => Response.json({ owner: A, outlines: [outline({ revision: 4 })] }));
      }),
    );
    await vi.waitFor(() => expect(asked).toBe(true));
    expect((await kept())?.server ?? null).toBeNull();
    // Meanwhile another answer says it is a sermon document now.
    await refresh(remote(A, [{ copy: outline({ revision: 4 }), authoritative: true }]));
    expect((await kept())?.documentAuthoritative).toBe(true);
    release();
    await first;
    expect(await kept()).toMatchObject({ documentAuthoritative: true, server: { revision: 4 } });
  });

  it("tells other tabs only after it is committed", async () => {
    const seen: (true | undefined)[] = [];
    const stop = onOutlinesChange(() => {
      void kept().then((value) => seen.push(value?.documentAuthoritative));
    });
    await refresh(remote(A, [{ copy: outline(), authoritative: true }]));
    stop();
    await vi.waitFor(() => expect(seen).toContain(true));
  });
});

describe("what is gone or removed", () => {
  it("is never taken for converted, and an outline already known as one stays known", async () => {
    await put(A, otherId, { server: outline({ id: otherId }), local: null });
    await put(A, outlineId, { server: outline(), local: null, documentAuthoritative: true });
    await refresh(remote(A, []));
    expect(await kept(A, otherId)).toBeNull();
    expect(await kept()).toEqual({ server: null, local: null, documentAuthoritative: true });
  });

  it("keeps queued work about an outline gone from the list, with what is known of it", async () => {
    await put(A, outlineId, { server: outline(), local: null, documentAuthoritative: true });
    // Queued before the device knew (written straight into the queue, as an older version would have).
    const db = await openOfflineDb();
    await db.put("mutations", {
      opId: crypto.randomUUID(),
      owner: A,
      type: "outline.entry.update",
      entityType: "outline",
      entityId: outlineId,
      payload: { entryId: p1, title: "Mine", base: { title: "First" } },
      schemaVersion: 1,
      createdAt: Date.now(),
      attempts: 0,
      status: "pending",
    });
    await refresh(remote(A, []));
    expect(await kept()).toMatchObject({ server: null, documentAuthoritative: true });
    expect(await queued()).toHaveLength(1);
  });

  it("removing downloads keeps the knowledge, never the editing", async () => {
    await put(A, outlineId, { server: outline(), local: null, documentAuthoritative: true });
    await removeKeptOutlines(A, new Set());
    expect(await kept()).toEqual({ server: null, local: null, documentAuthoritative: true });
    expect((await queueOne()).code).toBe("document_authoritative");
  });
});

describe("the device's own writes", () => {
  it("refuses every legacy change once it is known, writing nothing", async () => {
    await put(A, outlineId, { server: outline(), local: null, documentAuthoritative: true });
    const api = createDeviceOutlineApi(A, outlineId, { locale: "en" });
    const before = await kept();
    const answers = await Promise.all([
      api.updateEntry(p1, { title: "Mine" }),
      api.addEntry({ outlineId, type: "point", parentId: null }, crypto.randomUUID()),
      api.moveEntry(p2, { parentId: null, position: 0 }),
      api.removeEntry(p2),
      api.setEntryReferences(p1, []),
      api.setOutlineNumbering(outlineId, { version: 1, preset: "decimal" }),
    ]);
    for (const answer of answers) {
      expect(answer).toMatchObject({ ok: false, code: "document_authoritative" });
    }
    expect(await kept()).toEqual(before);
    expect(await queued()).toEqual([]);
  });

  it("refuses a change made on a stale snapshot the editor offers", async () => {
    await put(A, outlineId, { server: null, local: null, documentAuthoritative: true });
    const api = createDeviceOutlineApi(A, outlineId, {
      locale: "en",
      seed: () => ({
        id: outlineId,
        revision: 2,
        numbering: outline().numbering,
        entries: outline().entries,
      }),
      sermon: { sermon: outline().sermon, sermonReferences: [] },
    });
    expect(await api.updateEntry(p1, { title: "Mine" })).toMatchObject({
      code: "document_authoritative",
    });
    expect(await kept()).toEqual({ server: null, local: null, documentAuthoritative: true });
    expect(await queued()).toEqual([]);
  });

  it("the editor's store stops, keeping the words on the page, and says nothing is saved", async () => {
    await put(A, outlineId, { server: outline(), local: null, documentAuthoritative: true });
    const store = editor();
    store.setTitle(p1, "Typed after");
    store.flush();
    await vi.waitFor(() => expect(store.getState().status).toBe("failed"));
    expect(store.getState().rows.find((row) => row.id === p1)?.title).toBe("Typed after");
    expect(await queued()).toEqual([]);
  });

  describe("racing the knowledge", () => {
    async function mark() {
      await refresh(remote(A, [{ copy: outline(), authoritative: true }]));
    }

    it("knowledge first: the change is refused and nothing is written", async () => {
      await put(A, outlineId, { server: outline(), local: null });
      await mark();
      expect((await queueOne()).code).toBe("document_authoritative");
      expect((await kept())?.local).toBeNull();
      expect(await queued()).toEqual([]);
    });

    it("the change first: it stays queued and kept, and the next is refused", async () => {
      await put(A, outlineId, { server: outline(), local: null });
      expect((await queueOne()).ok).toBe(true);
      await mark();
      const after = await kept();
      expect(after?.documentAuthoritative).toBe(true);
      expect(after?.local?.entries[0].title).toBe("Mine");
      expect(await queued()).toHaveLength(1);
      const api = createDeviceOutlineApi(A, outlineId, { locale: "en" });
      expect((await api.updateEntry(p1, { title: "Later" })).code).toBe("document_authoritative");
      expect((await kept())?.local?.entries[0].title).toBe("Mine");
      expect(await queued()).toHaveLength(1);
    });

    for (const order of ["change, then knowledge", "knowledge, then change"] as const) {
      it(`started together (${order}): one or the other commits first, never in between`, async () => {
        await put(A, outlineId, { server: outline(), local: null });
        const [answer] =
          order === "change, then knowledge"
            ? await Promise.all([queueOne(), mark()])
            : await Promise.all([mark(), queueOne()]).then(([, change]) => [change]);
        const after = await kept();
        const records = await queued();
        expect(after?.documentAuthoritative).toBe(true);
        if (answer.ok) {
          // Written before the knowledge: kept and queued together.
          expect(after?.local?.entries[0].title).toBe("Mine");
          expect(records).toHaveLength(1);
        } else {
          expect(answer.code).toBe("document_authoritative");
          expect(after?.local).toBeNull();
          expect(records).toEqual([]);
        }
        expect((await queueOne()).code).toBe("document_authoritative");
      });
    }
  });
});

describe("the server's answer to a queued change", () => {
  async function queueThree() {
    await put(A, outlineId, { server: outline(), local: null });
    const store = editor();
    store.setTitle(p1, "Mine");
    store.flush();
    await settled(store);
    store.move(p2, null, 0);
    await settled(store);
    store.setTitle(p2, "Theirs too");
    store.flush();
    await settled(store);
    return queued();
  }

  it("is written with the conflict: the outline known, every change kept in its order", async () => {
    const records = await queueThree();
    const send = vi.fn<Sender>(async () => ({
      status: "conflict",
      conflict: { reason: "documentAuthoritative" },
    }));
    await runSync(A, send, {
      locks: null,
      conflictAlongside: (record, conflict) => authorityAlongside(A, record, conflict),
    });
    // The first waits for the person; the ones behind it wait behind it, unsent.
    expect(send).toHaveBeenCalledTimes(1);
    const left = await queued();
    expect(left.map((item) => [item.opId, item.status])).toEqual([
      [records[0].opId, "conflict"],
      [records[1].opId, "pending"],
      [records[2].opId, "pending"],
    ]);
    const after = await kept();
    expect(after?.documentAuthoritative).toBe(true);
    expect(after?.local?.entries.find((entry) => entry.id === p1)?.title).toBe("Mine");
  });

  it("keeps what was applied before the conversion as applied, and what is behind it queued", async () => {
    const records = await queueThree();
    const send = vi.fn<Sender>(async (record) =>
      record.opId === records[0].opId
        ? { status: "applied", entityId: outlineId, revision: 4 }
        : { status: "conflict", conflict: { reason: "documentAuthoritative" } },
    );
    await runSync(A, send, {
      locks: null,
      conflictAlongside: (record, conflict) => authorityAlongside(A, record, conflict),
      onApplied: (record: MutationRecord, outcome: SyncOutcome) => afterApplied(A, record, outcome),
    });
    const left = await queued();
    expect(left.map((item) => [item.opId, item.status])).toEqual([
      [records[1].opId, "conflict"],
      [records[2].opId, "pending"],
    ]);
    expect((await kept())?.documentAuthoritative).toBe(true);
  });

  it("writes neither the conflict nor the knowledge when that transaction fails", async () => {
    const [record] = await queueThree();
    const claimed = (await claimMutation(A, record.opId))!;
    const committed = vi.fn();
    await expect(
      settleMutation(
        A,
        claimed.opId,
        { outcome: "conflict", conflict: { reason: "documentAuthoritative" } },
        {
          write: async () => {
            throw new Error("storage refused");
          },
          committed,
        },
      ),
    ).rejects.toThrow("storage refused");
    expect(committed).not.toHaveBeenCalled();
    expect((await queued())[0]).toMatchObject({ opId: record.opId, status: "sending" });
    expect((await kept())?.documentAuthoritative).toBeUndefined();
    // Left on its way: the next run sends it again and hears the same answer.
    const send = vi.fn<Sender>(async () => ({
      status: "conflict",
      conflict: { reason: "documentAuthoritative" },
    }));
    await runSync(A, send, {
      locks: null,
      conflictAlongside: (item, conflict) => authorityAlongside(A, item, conflict),
    });
    expect(send.mock.calls[0][0].opId).toBe(record.opId);
    expect((await kept())?.documentAuthoritative).toBe(true);
  });

  it("is never applied to another account's outline", async () => {
    await put(B, outlineId, { server: outline(), local: null });
    const [record] = await queueThree();
    await conflictAuthoritative(record);
    expect((await kept(B))?.documentAuthoritative).toBeUndefined();
  });
});

describe("settling once it is known", () => {
  async function conflicted(conflict: MutationRecord["conflict"]) {
    await put(A, outlineId, { server: outline(), local: null });
    expect((await queueOne()).ok).toBe(true);
    const [record] = await queued();
    await settleMutation(A, record.opId, { outcome: "conflict", conflict: conflict! });
    await put(A, outlineId, { ...(await kept())!, documentAuthoritative: true });
    return (await queued())[0];
  }

  it("offers only discarding, and no other choice puts a legacy change back in line", async () => {
    const stale: SyncConflict = {
      reason: "entryStale",
      entry: { title: "Theirs", notes: null, references: [], revision: 5 },
      fields: ["title"],
    };
    const record = await conflicted(stale);
    expect(outlineChoicesFor(record, true)).toEqual(["discard"]);
    expect(outlineChoicesFor(record, false)).toEqual(["keepMine", "useAccount"]);
    for (const choice of [
      "applyMine",
      "keepMine",
      "useAccount",
      "addAsPoint",
      "addAtEnd",
    ] as const) {
      expect(await settleOutline(A, record, choice)).toBeNull();
    }
    expect(await queued()).toEqual([record]);
    expect((await kept())?.local?.entries[0].title).toBe("Mine");
  });

  it("discarding drops the work, keeps the knowledge, and opens no editing", async () => {
    const record = await conflicted({ reason: "documentAuthoritative" });
    expect(await settleOutline(A, record, "discard")).toBeNull();
    expect(await queued()).toEqual([]);
    expect(await kept()).toMatchObject({ local: null, documentAuthoritative: true });
    expect((await queueOne()).code).toBe("document_authoritative");
  });
});

describe("discarding everything about an outline", () => {
  it("drops every change and the copy's changes together, keeping the knowledge", async () => {
    await put(A, outlineId, { server: outline(), local: null });
    expect((await queueOne()).ok).toBe(true);
    await put(A, outlineId, { ...(await kept())!, documentAuthoritative: true });
    expect(await discardOutlineChanges(A, outlineId)).toBe("dropped");
    expect(await queued()).toEqual([]);
    expect(await kept()).toMatchObject({
      server: outline(),
      local: null,
      documentAuthoritative: true,
    });
  });

  it("writes nothing while a change is on its way", async () => {
    await put(A, outlineId, { server: outline(), local: null });
    expect((await queueOne()).ok).toBe(true);
    const [record] = await queued();
    await claimMutation(A, record.opId);
    const before = await kept();
    expect(await discardOutlineChanges(A, outlineId)).toBe("sending");
    expect(await queued()).toHaveLength(1);
    expect(await kept()).toEqual(before);
  });

  it("forgetting an outline known as a sermon document keeps only that", async () => {
    await put(A, outlineId, { server: outline(), local: null, documentAuthoritative: true });
    expect(await discardOutlineChanges(A, outlineId, true)).toBe("dropped");
    expect(await kept()).toEqual({
      server: null,
      local: null,
      documentAuthoritative: true,
      generation: 1,
    });
  });

  it("an acknowledgement keeps the knowledge too", async () => {
    await put(A, outlineId, { server: outline(), local: null });
    expect((await queueOne()).ok).toBe(true);
    await put(A, outlineId, { ...(await kept())!, documentAuthoritative: true });
    const [record] = await queued();
    await settleMutation(A, record.opId, { outcome: "done" });
    await afterApplied(A, record, { status: "applied", entityId: outlineId, revision: 4 });
    expect(await kept()).toMatchObject({ local: null, documentAuthoritative: true });
  });
});
