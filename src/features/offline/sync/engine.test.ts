import "fake-indexeddb/auto";

import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SyncOutcome } from "@/features/sync/model";
import { hasUnsavedWork } from "@/lib/unsaved-work";
import { closeOfflineDb, openOfflineDb } from "../db";
import type { MutationRecord } from "../model";
import {
  claimMutation,
  enqueue,
  listMutations,
  maxAutoAttempts,
  retryMutation,
  resolveMutation,
} from "../queue";
import { countByStatus, lastSyncedAt, runSync, type Sender } from "./engine";

const capture = (id: string, title = "A thought") => ({
  opId: id,
  type: "idea.create" as const,
  entityType: "idea" as const,
  entityId: id,
  payload: { title },
});

/** A server that applies each change once and answers a repeat `duplicate`, as `sync_operations` does. */
function idempotentServer() {
  const applied = new Map<string, unknown>();
  const send = vi.fn<Sender>(async (record) => {
    if (applied.has(record.opId)) return { status: "duplicate", entityId: record.entityId };
    applied.set(record.opId, record.payload);
    return { status: "applied", entityId: record.entityId };
  });
  return { applied, send };
}

/** A Web Locks stand-in shared by "tabs": `ifAvailable` gets `null` while another holds the name. */
function sharedLocks() {
  const held = new Set<string>();
  return {
    async request<T>(name: string, _: { ifAvailable: true }, run: (lock: unknown) => Promise<T>) {
      if (held.has(name)) return run(null);
      held.add(name);
      try {
        return await run({ name });
      } finally {
        held.delete(name);
      }
    },
  };
}

const locks = sharedLocks();
const pending = (owner = "owner-a") => listMutations(owner);

beforeEach(async () => {
  await closeOfflineDb();
  globalThis.indexedDB = new IDBFactory();
});
afterEach(() => {
  vi.useRealTimers();
  return closeOfflineDb();
});

describe("the sync engine", () => {
  it("sends a capture kept offline once the connection is back, and lets it go", async () => {
    await enqueue("owner-a", capture("op-1"));
    const offline = vi.fn<Sender>().mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await runSync("owner-a", offline, { locks })).toBe("idle");
    expect((await pending())[0]).toMatchObject({ status: "pending", autoAttempts: 1 });

    const server = idempotentServer();
    expect(await runSync("owner-a", server.send, { locks, manual: true })).toBe("idle");
    expect(await pending()).toEqual([]);
    expect(server.applied.size).toBe(1);
    expect(await lastSyncedAt("owner-a")).toEqual(expect.any(Number));
  });

  it("finds work queued before a reload, and sends one left mid-flight again", async () => {
    await enqueue("owner-a", capture("op-1"));
    await enqueue("owner-a", capture("op-2"));
    await claimMutation("owner-a", "op-1"); // the tab closed while this was on its way
    await closeOfflineDb(); // the page is reloaded

    const server = idempotentServer();
    await runSync("owner-a", server.send, { locks });
    expect(server.send.mock.calls.map(([record]) => record.opId)).toEqual(["op-1", "op-2"]);
    expect(await pending()).toEqual([]);
  });

  it("counts a send that takes too long as no answer, and applies it once when retried", async () => {
    await enqueue("owner-a", capture("op-1"));
    const server = idempotentServer();
    // The server applies it, but the answer never arrives in time.
    const slow = vi.fn<Sender>(async (record) => {
      await server.send(record);
      return new Promise<SyncOutcome>(() => {});
    });
    await runSync("owner-a", slow, { locks, timeoutMs: 10 });
    expect((await pending())[0]).toMatchObject({
      status: "pending",
      error: { kind: "network", message: "timeout" },
    });

    await runSync("owner-a", server.send, { locks, manual: true });
    expect(await pending()).toEqual([]);
    expect(server.send).toHaveBeenLastCalledWith(expect.objectContaining({ opId: "op-1" }));
    expect(await server.send.mock.results.at(-1)?.value).toMatchObject({ status: "duplicate" });
    expect(server.applied.size).toBe(1);
  });

  it("waits longer after each passing failure, then stops and keeps the change", async () => {
    await enqueue("owner-a", capture("op-1"));
    const down = vi.fn<Sender>().mockRejectedValue(new Error("502"));
    const waits: number[] = [];
    for (let i = 0; i < maxAutoAttempts; i++) {
      await runSync("owner-a", down, { locks, manual: true });
      const [record] = await pending();
      if (record.nextAttemptAt) waits.push(record.nextAttemptAt - (record.lastAttemptAt ?? 0));
    }
    expect(waits.length).toBe(maxAutoAttempts - 1);
    expect(waits[waits.length - 1]).toBeGreaterThan(waits[0]);
    const [stopped] = await pending();
    expect(stopped).toMatchObject({ status: "failed", attempts: maxAutoAttempts });

    // Not sent again by itself, even when asked to sync…
    await runSync("owner-a", down, { locks, manual: true });
    expect(down).toHaveBeenCalledTimes(maxAutoAttempts);
    // …until the person tries it again.
    await retryMutation("owner-a", "op-1");
    const server = idempotentServer();
    await runSync("owner-a", server.send, { locks });
    expect(await pending()).toEqual([]);
  });

  it("does not send a change before its backoff unless the person asks", async () => {
    await enqueue("owner-a", capture("op-1"));
    await runSync("owner-a", vi.fn<Sender>().mockRejectedValue(new Error("down")), { locks });
    const server = idempotentServer();
    await runSync("owner-a", server.send, { locks });
    expect(server.send).not.toHaveBeenCalled();
    await runSync("owner-a", server.send, { locks, manual: true });
    expect(server.send).toHaveBeenCalledTimes(1);
  });

  it("delivers a change once when two tabs sync at the same moment", async () => {
    await enqueue("owner-a", capture("op-1"));
    await enqueue("owner-a", capture("op-2"));
    const server = idempotentServer();
    const results = await Promise.all([
      runSync("owner-a", server.send, { locks }),
      runSync("owner-a", server.send, { locks }),
    ]);
    expect(results.sort()).toEqual(["busy", "idle"]);
    expect(server.send).toHaveBeenCalledTimes(2);
    expect(await pending()).toEqual([]);
  });

  it("delivers a change once without Web Locks too", async () => {
    await enqueue("owner-a", capture("op-1"));
    const server = idempotentServer();
    const results = await Promise.all([
      runSync("owner-a", server.send, { locks: null }),
      runSync("owner-a", server.send, { locks: null }),
    ]);
    expect(results.sort()).toEqual(["busy", "idle"]);
    expect(server.send).toHaveBeenCalledTimes(1);
  });

  it("pauses when the session has ended, and fails nothing", async () => {
    await enqueue("owner-a", capture("op-1"));
    await enqueue("owner-a", capture("op-2"));
    const expired = vi.fn<Sender>().mockResolvedValue({ status: "auth" });
    expect(await runSync("owner-a", expired, { locks })).toBe("paused");
    expect(expired).toHaveBeenCalledTimes(1);
    expect((await pending()).map((record) => [record.status, record.attempts])).toEqual([
      ["pending", 0],
      ["pending", 0],
    ]);
  });

  it("leaves one account's work alone when another is signed in", async () => {
    await enqueue("owner-a", capture("op-a"));
    await enqueue("owner-b", capture("op-b"));
    const server = idempotentServer();
    // Signed in as B: A's work is neither sent nor touched.
    expect(
      await runSync("owner-a", server.send, { locks, isCurrent: (o) => o === "owner-b" }),
    ).toBe("paused");
    const wrong = vi.fn<Sender>().mockResolvedValue({ status: "wrongAccount" });
    expect(await runSync("owner-a", wrong, { locks })).toBe("paused");
    expect((await pending("owner-a"))[0]).toMatchObject({ status: "pending", attempts: 0 });

    await runSync("owner-b", server.send, { locks });
    expect(server.send.mock.calls.map(([record]) => record.owner)).toEqual(["owner-b"]);
    expect(await pending("owner-b")).toEqual([]);
    expect(await pending("owner-a")).toHaveLength(1);
  });

  it("keeps a conflict and a refused change for the person, and goes on with the rest", async () => {
    await enqueue("owner-a", capture("op-conflict"));
    await enqueue("owner-a", capture("op-refused"));
    await enqueue("owner-a", capture("op-fine"));
    const send = vi.fn<Sender>(async (record: MutationRecord) => {
      if (record.opId === "op-conflict")
        return { status: "conflict", conflict: { reason: "missingTags", missingTagIds: ["t"] } };
      if (record.opId === "op-refused") return { status: "rejected", reason: "validation" };
      return { status: "applied", entityId: record.entityId };
    });
    await runSync("owner-a", send, { locks });
    const left = await pending();
    expect(countByStatus(left)).toEqual({ waiting: 0, sending: 0, failed: 1, conflict: 1 });
    expect(left.find((record) => record.opId === "op-conflict")?.payload).toEqual({
      title: "A thought",
    });

    // The person settles the conflict; it is sent once more, as they chose.
    await resolveMutation("owner-a", "op-conflict", {
      payload: { title: "A thought", tagIds: [] },
    });
    const server = idempotentServer();
    await runSync("owner-a", server.send, { locks });
    expect(server.applied.get("op-conflict")).toEqual({ title: "A thought", tagIds: [] });
    expect((await pending()).map((record) => record.opId)).toEqual(["op-refused"]);
  });

  it("keeps every status across a reload, and never counts the queue as unsaved work", async () => {
    await enqueue("owner-a", capture("op-1"));
    await runSync("owner-a", vi.fn<Sender>().mockRejectedValue(new Error("down")), { locks });
    expect(hasUnsavedWork()).toBe(false);
    await closeOfflineDb();
    const db = await openOfflineDb();
    expect(await db.get("mutations", "op-1")).toMatchObject({
      status: "pending",
      autoAttempts: 1,
      nextAttemptAt: expect.any(Number),
    });
  });
});
