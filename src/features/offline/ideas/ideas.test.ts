import "fake-indexeddb/auto";

import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ideaInputSchema } from "@/features/ideas/schemas";
import type { OfflineIdea } from "@/features/sync/ideas";
import type { SyncOutcome } from "@/features/sync/model";
import { closeOfflineDb } from "../db";
import type { MutationRecord } from "../model";
import { listMutations, settleMutation } from "../queue";
import { runSync, type Sender } from "../sync/engine";
import {
  archiveIdeaOffline,
  createIdeaOffline,
  deleteIdeaOffline,
  saveIdeaOffline,
} from "./operations";
import { refreshIdeas } from "./refresh";
import { getKeptIdea, listLocalIdeas, readIdeasState, removeKeptIdeas, shown } from "./store";
import { afterApplied, settle } from "./sync";

/*
 * Phase 5D.1: an account's ideas on the device. Changes are written to the
 * copy and the queue together, downloads never touch unsent work, every
 * account is kept apart, and the engine sends each idea's changes in order
 * against the revision they follow.
 */

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const id1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const id2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const idea = (id: string, fields: Partial<OfflineIdea> = {}): OfflineIdea => ({
  id,
  kind: "sermon",
  title: "Grace",
  notes: null,
  status: "idea",
  intendedFormat: "unspecified",
  sermonType: "unspecified",
  subject: null,
  references: [],
  tagIds: [],
  revision: 0,
  createdAt: "2026-10-01T10:00:00.000Z",
  updatedAt: "2026-10-01T10:00:00.000Z",
  lastDevelopedAt: null,
  archivedAt: null,
  hasOutline: false,
  preached: false,
  ...fields,
});

const input = (fields: Record<string, unknown> = {}) =>
  ideaInputSchema.parse({ kind: "sermon", title: "Grace", ...fields });

/** The server's half for these tests: ideas by ID, each change applied once, revisions checked. */
function server(owner: string, start: OfflineIdea[] = []) {
  const ideas = new Map(start.map((item) => [item.id, item]));
  const seen = new Set<string>();
  const manifest = () => ({
    owner,
    tags: [],
    ideas: [...ideas.values()].map(
      ({ id, revision, updatedAt, lastDevelopedAt, archivedAt, hasOutline, preached }) => ({
        id,
        revision,
        updatedAt,
        lastDevelopedAt,
        archivedAt,
        hasOutline,
        preached,
      }),
    ),
  });
  const fetcher = vi.fn(async (url: string) => {
    const ids = new URL(url, "http://local").searchParams.get("ids");
    const body = ids
      ? { owner, ideas: ids.split(",").flatMap((id) => (ideas.has(id) ? [ideas.get(id)!] : [])) }
      : manifest();
    return new Response(JSON.stringify(body), { status: 200 });
  });
  const send = vi.fn<Sender>(async (record): Promise<SyncOutcome> => {
    if (seen.has(record.opId)) return { status: "duplicate", entityId: record.entityId };
    const current = ideas.get(record.entityId);
    if (record.type === "idea.create") {
      const payload = record.payload as ReturnType<typeof input>;
      ideas.set(record.entityId, idea(record.entityId, { title: payload.title }));
      seen.add(record.opId);
      return { status: "applied", entityId: record.entityId, revision: 0 };
    }
    if (!current) {
      if (record.type === "idea.delete") return { status: "applied", entityId: record.entityId };
      return { status: "conflict", conflict: { reason: "missing" } };
    }
    if (
      (record.type === "idea.update" || record.type === "idea.delete") &&
      record.baseRevision !== current.revision
    ) {
      return { status: "conflict", conflict: { reason: "stale", server: current } };
    }
    seen.add(record.opId);
    if (record.type === "idea.delete") {
      ideas.delete(record.entityId);
      return { status: "applied", entityId: record.entityId };
    }
    const next =
      record.type === "idea.update"
        ? {
            ...current,
            title: (record.payload as { title: string }).title,
            revision: current.revision + 1,
          }
        : {
            ...current,
            archivedAt: record.type === "idea.archive" ? "2026-10-14T00:00:00Z" : null,
          };
    ideas.set(record.entityId, next);
    return { status: "applied", entityId: record.entityId, revision: next.revision };
  });
  return { ideas, fetcher, send };
}

const run = (owner: string, send: Sender) =>
  runSync(owner, send, {
    locks: null,
    onApplied: (record: MutationRecord, outcome: SyncOutcome) =>
      afterApplied(owner, record, outcome),
  });

beforeEach(async () => {
  await closeOfflineDb();
  globalThis.indexedDB = new IDBFactory();
});
afterEach(() => closeOfflineDb());

describe("downloading an account's ideas", () => {
  it("keeps them whole, then reads again only what changed", async () => {
    const remote = server(A, [idea(id1), idea(id2, { title: "Hope" })]);
    expect(await refreshIdeas(A, { fetcher: remote.fetcher, locks: null })).toBe("done");
    expect((await listLocalIdeas(A)).map((item) => item.title).sort()).toEqual(["Grace", "Hope"]);
    expect(await readIdeasState(A)).toMatchObject({ complete: true, total: 2, have: 2 });

    remote.ideas.set(id2, idea(id2, { title: "Hope renewed", revision: 1 }));
    remote.ideas.set(id1, idea(id1, { archivedAt: "2026-10-13T00:00:00.000Z" }));
    remote.fetcher.mockClear();
    await refreshIdeas(A, { fetcher: remote.fetcher, locks: null });
    // The manifest, then only the idea whose revision moved; the archive date came with the manifest.
    expect(remote.fetcher.mock.calls.map(([url]) => url)).toEqual([
      "/api/offline/ideas",
      `/api/offline/ideas?ids=${id2}`,
    ]);
    expect(shown(await getKeptIdea(A, id2))?.title).toBe("Hope renewed");
    expect(shown(await getKeptIdea(A, id1))?.archivedAt).toBe("2026-10-13T00:00:00.000Z");
  });

  it("says how much is missing when a download is cut short", async () => {
    const remote = server(A, [idea(id1), idea(id2)]);
    remote.fetcher.mockImplementation(async (url: string) => {
      if (url.includes("ids=")) throw new TypeError("Failed to fetch");
      return new Response(
        JSON.stringify({ owner: A, tags: [], ideas: [...remote.ideas.values()] }),
      );
    });
    expect(await refreshIdeas(A, { fetcher: remote.fetcher, locks: null })).toBe("failed");
    expect(await readIdeasState(A)).toMatchObject({
      status: "failed",
      complete: false,
      have: 0,
      total: 2,
      error: "network",
    });
  });

  it("never keeps another account's ideas, nor shows one account's to another", async () => {
    const remote = server(B, [idea(id1)]);
    expect(await refreshIdeas(A, { fetcher: remote.fetcher, locks: null })).toBe("wrongAccount");
    expect(await listLocalIdeas(A)).toEqual([]);

    await refreshIdeas(B, { fetcher: remote.fetcher, locks: null });
    expect(await listLocalIdeas(B)).toHaveLength(1);
    expect(await listLocalIdeas(A)).toEqual([]);
    expect(await getKeptIdea(A, id1)).toBeNull();
  });

  it("never writes over a change made here, and keeps an idea with work queued", async () => {
    const remote = server(A, [idea(id1), idea(id2)]);
    await refreshIdeas(A, { fetcher: remote.fetcher, locks: null });
    await saveIdeaOffline(A, id1, input({ title: "Mine" }));
    remote.ideas.set(id1, idea(id1, { title: "Theirs", revision: 1 }));
    remote.ideas.delete(id2);
    await archiveIdeaOffline(A, id2);
    await refreshIdeas(A, { fetcher: remote.fetcher, locks: null });

    const kept = await getKeptIdea(A, id1);
    expect(kept?.server?.title).toBe("Theirs");
    expect(shown(kept)?.title).toBe("Mine");
    // Gone from the account, but the archiving queued here is the person's until the server answers.
    expect(await getKeptIdea(A, id2)).not.toBeNull();

    await removeKeptIdeas(A, new Set((await listMutations(A)).map((record) => record.entityId)));
    expect((await listLocalIdeas(A)).map((item) => item.id).sort()).toEqual([id1, id2]);
  });
});

describe("changing an idea on the device", () => {
  it("writes the copy and the queued change together, against the revision it shows", async () => {
    const outcome = await saveIdeaOffline(
      A,
      id1,
      input({ title: "Offline" }),
      idea(id1, { revision: 3 }),
    );
    expect(outcome.status).toBe("queued");
    const [record] = await listMutations(A);
    expect(record).toMatchObject({ type: "idea.update", entityId: id1, baseRevision: 3 });
    expect(shown(await getKeptIdea(A, id1))).toMatchObject({ title: "Offline", revision: 3 });
    expect(await listMutations(B)).toEqual([]);
  });

  it("refuses to delete a preached sermon, as the server would", async () => {
    expect((await deleteIdeaOffline(A, id1, idea(id1, { preached: true }))).status).toBe(
      "preached",
    );
    expect(await listMutations(A)).toEqual([]);
  });

  it("starts from the page's copy when it is newer than the device's", async () => {
    const remote = server(A, [idea(id1)]);
    await refreshIdeas(A, { fetcher: remote.fetcher, locks: null });
    await saveIdeaOffline(
      A,
      id1,
      input({ title: "From a fresh page" }),
      idea(id1, { revision: 2 }),
    );
    expect((await listMutations(A))[0].baseRevision).toBe(2);
  });
});

describe("sending changes to ideas", () => {
  it("sends one idea's changes in order, each against the revision before it", async () => {
    const remote = server(A, [idea(id1)]);
    await refreshIdeas(A, { fetcher: remote.fetcher, locks: null });
    await saveIdeaOffline(A, id1, input({ title: "First" }));
    await saveIdeaOffline(A, id1, input({ title: "Second" }));
    expect((await listMutations(A)).map((record) => record.baseRevision)).toEqual([0, 0]);

    expect(await run(A, remote.send)).toBe("idle");
    expect(await listMutations(A)).toEqual([]);
    expect(remote.ideas.get(id1)).toMatchObject({ title: "Second", revision: 2 });
    // Acknowledged, the device's copy is the server's again.
    expect(await getKeptIdea(A, id1)).toMatchObject({
      local: null,
      server: { title: "Second", revision: 2 },
    });
  });

  it("holds later changes behind one in conflict, and never sends past it", async () => {
    const remote = server(A, [idea(id1)]);
    await refreshIdeas(A, { fetcher: remote.fetcher, locks: null });
    await saveIdeaOffline(A, id1, input({ title: "Mine" }));
    await archiveIdeaOffline(A, id1);
    remote.ideas.set(id1, idea(id1, { title: "Changed online", revision: 1 }));

    await run(A, remote.send);
    const [conflict, behind] = await listMutations(A);
    expect(conflict).toMatchObject({ status: "conflict", conflict: { reason: "stale" } });
    expect(behind).toMatchObject({ type: "idea.archive", status: "pending" });
    expect(remote.send).toHaveBeenCalledTimes(1);
    expect(remote.ideas.get(id1)?.title).toBe("Changed online");

    // The person keeps their version: sent over the newer copy, then the archiving follows.
    await settle(A, conflict, "overwrite");
    await run(A, remote.send);
    expect(await listMutations(A)).toEqual([]);
    expect(remote.ideas.get(id1)).toMatchObject({ title: "Mine", archivedAt: expect.any(String) });
  });

  it("drops what was changed here only when the person chooses the account's version", async () => {
    const remote = server(A, [idea(id1)]);
    await refreshIdeas(A, { fetcher: remote.fetcher, locks: null });
    await saveIdeaOffline(A, id1, input({ title: "Mine" }));
    remote.ideas.set(id1, idea(id1, { title: "Theirs", revision: 1 }));
    await run(A, remote.send);
    const [conflict] = await listMutations(A);
    await settle(A, conflict, "discard");
    expect(await listMutations(A)).toEqual([]);
    expect(shown(await getKeptIdea(A, id1))?.title).toBe("Theirs");
  });

  it("saves an edit to an idea deleted elsewhere as a new idea when asked", async () => {
    const remote = server(A, [idea(id1)]);
    await refreshIdeas(A, { fetcher: remote.fetcher, locks: null });
    await saveIdeaOffline(A, id1, input({ title: "Rescued" }));
    remote.ideas.delete(id1);
    await run(A, remote.send);
    const [conflict] = await listMutations(A);
    expect(conflict.conflict).toEqual({ reason: "missing" });
    await settle(A, conflict, "saveAsNew");
    await run(A, remote.send);
    expect(await listMutations(A)).toEqual([]);
    expect([...remote.ideas.values()].map((item) => item.title)).toEqual(["Rescued"]);
    expect(await getKeptIdea(A, id1)).toBeNull();
  });

  it("goes on after a send cut short, and the server applies it once", async () => {
    await createIdeaOffline(A, id1, input({ title: "Captured" }));
    const remote = server(A);
    // The send reached the server, but the tab closed before the answer: still \`sending\`.
    const [record] = await listMutations(A);
    await remote.send(record);
    await settleMutation(A, record.opId, { outcome: "release" });
    await run(A, remote.send);
    expect(await listMutations(A)).toEqual([]);
    expect(remote.ideas.size).toBe(1);
    // A duplicate gives no revision: the copy is marked to be read again in full.
    expect((await getKeptIdea(A, id1))?.server?.revision).toBe(-1);
  });

  it("keeps everything through a connection that comes and goes", async () => {
    const remote = server(A, [idea(id1)]);
    await refreshIdeas(A, { fetcher: remote.fetcher, locks: null });
    await saveIdeaOffline(A, id1, input({ title: "Offline edit" }));
    const offline = vi.fn<Sender>().mockRejectedValue(new TypeError("Failed to fetch"));
    await run(A, offline);
    expect(await listMutations(A)).toHaveLength(1);
    expect(shown(await getKeptIdea(A, id1))?.title).toBe("Offline edit");
    await run(A, remote.send);
    // Waiting out its backoff: the person asks.
    await runSync(A, remote.send, {
      locks: null,
      manual: true,
      onApplied: (record, outcome) => afterApplied(A, record, outcome),
    });
    expect(await listMutations(A)).toEqual([]);
    expect(remote.ideas.get(id1)?.title).toBe("Offline edit");
  });
});
