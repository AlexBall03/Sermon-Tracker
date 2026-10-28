import "fake-indexeddb/auto";

import type { JSONContent } from "@tiptap/core";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { documentV4, pointV4, proseV4 } from "@/features/editor-lab/v4/fixtures";
import { resetAccountMemory } from "@/features/offline/account";
import { closeOfflineDb } from "@/features/offline/db";
import { canonicalDocument } from "../canonical";
import type { JsonValue } from "../json";
import { documentLimits } from "../model";
import { currentRefusal } from "../recovery/model";
import {
  confirmDraft,
  DraftStorageError,
  readDraft,
  refuseDraft,
  writeDraft,
} from "../recovery/store";
import type { DocumentReadOutcome, DocumentSaveOutcome, DocumentSaveRequest } from "../saving";
import type { Connectivity } from "./connectivity";
import { createAutosaveController, type DraftStorage } from "./controller";
import { createSaveCoordinator, SaveCoordinatorError } from "./coordinator";
import { autosaveStatus, jsonEqual, serverSaveStatus, type DocumentSource } from "./model";
import type { DocumentTransport } from "./transport";

/*
 * B.2B.2 and B.2B.3 together (A2.3B.2B): the real autosave controller on the
 * real recovery store (fake-indexeddb), the save coordinator, and a fake
 * server that writes only where the revision is the one named, as
 * `updateDocument` does. Each request is a separate network attempt the test
 * commits, answers, or loses, in any order. Only `setTimeout` is faked, so
 * IndexedDB (which runs on `setImmediate`) keeps its real ordering.
 */

const owner = "4f1c2d3e-0000-4000-8000-00000000a11c";
const outlineId = "0b6a3c1e-9d54-4c7e-8a55-1f1f6d3b2a10";
const R0 = 8;

const doc = (words: string) => documentV4([pointV4("p-1", "Grace", 1), proseV4(words, 1)]);
const invalid = { type: "doc", content: [{ type: "no_such_node" }] } as JSONContent;

function canonical(json: unknown): JSONContent {
  const result = canonicalDocument(json);
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result.content;
}
const equal = (a: unknown, b: unknown) => jsonEqual(a as JsonValue, b as JsonValue);
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Lets every queued IndexedDB transaction and promise run, without moving the clock. */
async function drain(rounds = 20) {
  for (let i = 0; i < rounds; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
    await vi.advanceTimersByTimeAsync(0);
  }
}

/** The server: one document, a revision, and a conditional update. */
function fakeServer(initial: JSONContent) {
  const server = { content: canonical(initial), revision: R0, writes: 0, gone: false };
  type Attempt = {
    request: DocumentSaveRequest;
    /** Runs the request on the server now: written only at the revision it names. */
    commit(): DocumentSaveOutcome;
    /** Its answer reaches the browser. */
    respond(outcome: DocumentSaveOutcome): void;
    /** Its answer never arrives. */
    lose(): void;
  };
  const attempts: Attempt[] = [];
  let holdReads = false;
  const readsWaiting: (() => void)[] = [];
  let reads = 0;
  /** Reads that fail before reaching the server (A2.3B.2C): the network, not the document. */
  let failingReads = 0;

  function commit(request: DocumentSaveRequest): DocumentSaveOutcome {
    const { sequence } = request;
    if (server.gone) return { kind: "conflict", sequence, code: "missing" };
    if (request.expectedRevision !== server.revision) {
      return { kind: "conflict", sequence, code: "stale", revision: server.revision };
    }
    const prepared = canonicalDocument(request.content);
    if (!prepared.ok) return { kind: "refused", sequence, code: "invalid" };
    server.content = prepared.content;
    server.revision += 1;
    server.writes += 1;
    return { kind: "confirmed", sequence, revision: server.revision };
  }

  const transport: DocumentTransport = {
    save: (request) =>
      new Promise<DocumentSaveOutcome>((resolve, reject) => {
        attempts.push({
          request,
          commit: () => commit(request),
          respond: resolve,
          lose: () => reject(new TypeError("Failed to fetch")),
        });
      }),
    read: () => {
      reads += 1;
      if (failingReads > 0) {
        failingReads -= 1;
        return Promise.reject(new TypeError("Failed to fetch"));
      }
      const answer = (): DocumentReadOutcome =>
        server.gone
          ? { kind: "missing" }
          : { kind: "found", content: copy(server.content), revision: server.revision };
      if (!holdReads) return Promise.resolve(answer());
      return new Promise((resolve) => readsWaiting.push(() => resolve(answer())));
    },
  };
  return {
    server,
    transport,
    attempts,
    get reads() {
      return reads;
    },
    holdReads() {
      holdReads = true;
    },
    /** The next `count` reads fail on the network. */
    failReads(count: number) {
      failingReads = count;
    },
    releaseRead() {
      readsWaiting.shift()?.();
    },
    /** Someone else saves the document. */
    external(content: JSONContent) {
      server.content = canonical(content);
      server.revision += 1;
      server.writes += 1;
    },
  };
}

function fakeSource(initial: JSONContent) {
  let current = initial;
  let change: (() => void) | null = null;
  const source: DocumentSource = {
    subscribe(onChange) {
      change = onChange;
      return () => {
        change = null;
      };
    },
    read: () => current,
  };
  return {
    source,
    edit(next: JSONContent) {
      current = next;
      change?.();
    },
    get current() {
      return current;
    },
  };
}

/** The browser's network as the test sets it (A2.3B.2C). */
function fakeLink() {
  let online = true;
  const listeners = new Set<(online: boolean) => void>();
  const connectivity: Connectivity = {
    online: () => online,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return {
    connectivity,
    set(next: boolean) {
      online = next;
      for (const listener of [...listeners]) listener(next);
    },
  };
}

function session(storage?: DraftStorage) {
  const opened = doc("Opened");
  const editor = fakeSource(opened);
  const net = fakeServer(opened);
  const link = fakeLink();
  const controller = createAutosaveController({
    owner,
    outlineId,
    revision: R0,
    source: editor.source,
    ...(storage ? { storage } : {}),
  });
  const coordinator = createSaveCoordinator({
    controller,
    transport: net.transport,
    base: { content: canonical(opened), revision: R0 },
    connectivity: link.connectivity,
  });
  const draft = async () => readDraft(owner, { outlineId, draftId: controller.draftId });
  const status = () => serverSaveStatus(controller.getState(), coordinator.getState());
  /** Edits, then lets the server's idle timer fire and the save reach the network. */
  async function type(next: JSONContent) {
    editor.edit(next);
    await vi.advanceTimersByTimeAsync(400);
    await controller.flush();
    await vi.advanceTimersByTimeAsync(1500);
    await drain();
  }
  return { editor, net, link, controller, coordinator, draft, status, type };
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  await closeOfflineDb();
  globalThis.indexedDB = new IDBFactory();
  resetAccountMemory();
});
afterEach(async () => {
  vi.useRealTimers();
  await closeOfflineDb();
});

describe("conditional retry against a server that writes only at R0", () => {
  it("A, the original wins: it commits, the retry is stale, the read back settles once", async () => {
    const s = session();
    await s.type(doc("Sent"));
    const [original] = s.net.attempts;
    expect(original.request).toMatchObject({ sequence: 1, expectedRevision: R0 });
    // The answer is lost before the request reached the server.
    original.lose();
    await drain();
    // The read finds the base: the one retry goes out.
    expect(s.net.attempts).toHaveLength(2);
    const retry = s.net.attempts[1];
    expect(retry.request).toEqual(original.request);
    // The original arrives and commits first; the retry meets stale.
    expect(original.commit()).toMatchObject({ kind: "confirmed", revision: R0 + 1 });
    const second = retry.commit();
    expect(second).toMatchObject({ kind: "conflict", code: "stale", revision: R0 + 1 });
    retry.respond(second);
    await drain();
    expect(s.coordinator.getState()).toMatchObject({
      phase: "idle",
      revision: R0 + 1,
      confirmedSequence: 1,
      reconciliation: { result: "saved", revision: R0 + 1 },
    });
    expect(s.net.server).toMatchObject({ revision: R0 + 1, writes: 1 });
    expect(equal(s.net.server.content, canonical(doc("Sent")))).toBe(true);
    // Settled once; no stale refusal recorded; the draft cleared by the confirmation.
    expect(s.controller.getState()).toMatchObject({ confirmedSequence: 1, refusalRecord: null });
    expect(await s.draft()).toBeNull();
    expect(s.status()).toBe("saved");
    expect(s.net.attempts).toHaveLength(2);
    await s.controller.dispose();
  });

  it("B, the retry wins: only the sequence sent is confirmed; the original's later stale changes nothing; newer work stays pending", async () => {
    const s = session();
    await s.type(doc("Sent"));
    const [original] = s.net.attempts;
    // Newer work made while the first save is out.
    s.editor.edit(doc("Newer"));
    await vi.advanceTimersByTimeAsync(400);
    await s.controller.flush();
    original.lose();
    await drain();
    const retry = s.net.attempts[1];
    expect(retry.request.content).toEqual(doc("Sent"));
    retry.respond(retry.commit());
    await drain();
    // The original reaches the server afterwards: refused there, and nobody is told.
    expect(original.commit()).toMatchObject({ kind: "conflict", code: "stale" });
    expect(s.net.server).toMatchObject({ revision: R0 + 1, writes: 1 });
    expect(s.controller.getState()).toMatchObject({
      confirmedSequence: 1,
      sequence: 2,
      revision: R0 + 1,
    });
    expect(s.status()).not.toBe("saved");
    // The draft keeps the newer words.
    const kept = await s.draft();
    expect(kept?.status === "ok" && kept.draft.content).toEqual(doc("Newer"));
    // The newer work goes out against R0 + 1.
    await vi.advanceTimersByTimeAsync(1500);
    await drain();
    expect(s.net.attempts).toHaveLength(3);
    expect(s.net.attempts[2].request).toMatchObject({ sequence: 2, expectedRevision: R0 + 1 });
    const third = s.net.attempts[2];
    third.respond(third.commit());
    await drain();
    expect(s.net.server).toMatchObject({ revision: R0 + 2, writes: 2 });
    expect(s.status()).toBe("saved");
    await s.controller.dispose();
  });

  it("B, both answers lost: the read back after the retry settles it", async () => {
    const s = session();
    await s.type(doc("Sent"));
    const [original] = s.net.attempts;
    original.lose();
    await drain();
    const retry = s.net.attempts[1];
    retry.commit();
    retry.lose();
    await drain();
    expect(s.net.reads).toBe(2);
    expect(s.coordinator.getState()).toMatchObject({ phase: "idle", confirmedSequence: 1 });
    expect(original.commit()).toMatchObject({ kind: "conflict" });
    expect(s.net.server.writes).toBe(1);
    await s.controller.dispose();
  });

  it("C, another writer wins: blocked, the draft whole with its conflict, nothing merged or overwritten", async () => {
    const s = session();
    await s.type(doc("Sent"));
    const [original] = s.net.attempts;
    original.lose();
    await drain();
    const retry = s.net.attempts[1];
    s.net.external(doc("Someone else"));
    retry.respond(retry.commit());
    await drain();
    expect(s.coordinator.getState()).toMatchObject({
      phase: "blocked",
      block: { reason: "conflict", origin: "server" },
      reconciliation: { result: "conflict", revision: R0 + 1 },
    });
    expect(original.commit()).toMatchObject({ kind: "conflict" });
    expect(equal(s.net.server.content, canonical(doc("Someone else")))).toBe(true);
    expect(s.net.server.writes).toBe(1);
    await drain();
    const kept = await s.draft();
    expect(kept?.status).toBe("ok");
    if (kept?.status !== "ok") return;
    expect(kept.draft.content).toEqual(doc("Sent"));
    expect(kept.draft.refusal).toMatchObject({ code: "stale", sequence: 1, revision: R0 + 1 });
    expect(currentRefusal(kept.draft)).not.toBeNull();
    // Further edits are kept, never sent.
    await s.type(doc("More of mine"));
    expect(s.net.attempts).toHaveLength(2);
    const later = await s.draft();
    expect(later?.status === "ok" && later.draft.content).toEqual(doc("More of mine"));
    expect(s.status()).toBe("blocked");
    await s.controller.dispose();
  });
});

describe("refusals and correction", () => {
  it("D, invalid then corrected: nothing sent for the invalid one, the corrected one saved alone", async () => {
    const s = session();
    await s.type(invalid);
    expect(s.net.attempts).toHaveLength(0);
    expect(s.coordinator.getState()).toMatchObject({
      phase: "blocked",
      block: { reason: "refused", origin: "local" },
    });
    await drain();
    let kept = await s.draft();
    expect(kept?.status === "ok" && kept.draft.refusal).toMatchObject({
      code: "invalid",
      sequence: 1,
    });
    await s.type(doc("Corrected"));
    expect(s.net.attempts).toHaveLength(1);
    expect(s.net.attempts[0].request).toMatchObject({ sequence: 2, expectedRevision: R0 });
    // Before the answer, the draft holds the corrected words, its old refusal only history.
    kept = await s.draft();
    expect(kept?.status === "ok" && currentRefusal(kept.draft)).toBeNull();
    const attempt = s.net.attempts[0];
    attempt.respond(attempt.commit());
    await drain();
    expect(s.controller.getState()).toMatchObject({ confirmedSequence: 2, revision: R0 + 1 });
    expect(await s.draft()).toBeNull();
    expect(s.status()).toBe("saved");
    await vi.advanceTimersByTimeAsync(60_000);
    await drain();
    expect(s.net.attempts).toHaveLength(1);
    await s.controller.dispose();
  });

  it("E, oversized then shortened: kept whole on the device, never sent, then saved", async () => {
    const s = session();
    const huge = doc("x".repeat(documentLimits.bytes + 10));
    await s.type(huge);
    expect(s.net.attempts).toHaveLength(0);
    expect(autosaveStatus(s.controller.getState())).toBe("attention");
    let kept = await s.draft();
    expect(kept?.status).toBe("ok");
    if (kept?.status !== "ok") return;
    expect(kept.draft.content).toEqual(huge);
    expect(kept.draft.refusal).toMatchObject({ code: "too_large", sequence: 1 });
    await s.type(doc("Shortened"));
    expect(s.net.attempts).toHaveLength(1);
    kept = await s.draft();
    expect(kept?.status === "ok" && currentRefusal(kept.draft)).toBeNull();
    s.net.attempts[0].respond(s.net.attempts[0].commit());
    await drain();
    expect(s.status()).toBe("saved");
    expect(await s.draft()).toBeNull();
    await s.controller.dispose();
  });

  it("F, a refusal of N while N + 1 is kept: N + 1 stays whole and is sent next", async () => {
    const s = session();
    await s.type(doc("Rejected by the server"));
    const [first] = s.net.attempts;
    s.editor.edit(doc("Next"));
    await vi.advanceTimersByTimeAsync(400);
    await s.controller.flush();
    first.respond({ kind: "refused", sequence: first.request.sequence, code: "invalid" });
    await drain();
    const kept = await s.draft();
    expect(kept?.status).toBe("ok");
    if (kept?.status !== "ok") return;
    expect(kept.draft).toMatchObject({ sequence: 2, confirmedSequence: 0, baseRevision: R0 });
    expect(kept.draft.content).toEqual(doc("Next"));
    expect(kept.draft.refusal).toMatchObject({ code: "invalid", sequence: 1 });
    expect(currentRefusal(kept.draft)).toBeNull();
    await vi.advanceTimersByTimeAsync(1500);
    await drain();
    expect(s.net.attempts).toHaveLength(2);
    const second = s.net.attempts[1];
    expect(second.request).toMatchObject({ sequence: 2, expectedRevision: R0 });
    second.respond(second.commit());
    await drain();
    expect(s.net.server).toMatchObject({ revision: R0 + 1, writes: 1 });
    expect(s.controller.getState()).toMatchObject({ confirmedSequence: 2, revision: R0 + 1 });
    expect(await s.draft()).toBeNull();
    await s.controller.dispose();
  });
});

describe("disposal, storage, and ownership", () => {
  it("G, disposed with a save out: a late confirmation reaches the same session and nothing is sent", async () => {
    const s = session();
    await s.type(doc("Sent"));
    s.coordinator.dispose();
    const [attempt] = s.net.attempts;
    attempt.respond(attempt.commit());
    await drain();
    expect(s.controller.getState()).toMatchObject({ confirmedSequence: 1, saving: null });
    expect(await s.draft()).toBeNull();
    await s.type(doc("After"));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(s.net.attempts).toHaveLength(1);
    await s.controller.dispose();
  });

  it("G, disposed with a save unresolved: the claim stays held, the words stay, no successor takes it", async () => {
    const s = session();
    s.net.holdReads();
    await s.type(doc("Sent"));
    s.net.attempts[0].lose();
    await drain();
    s.coordinator.dispose();
    s.net.releaseRead();
    await drain();
    // An unchanged read after disposal sends no retry.
    expect(s.net.attempts).toHaveLength(1);
    expect(s.controller.getState().saving).toBe(1);
    expect(() =>
      createSaveCoordinator({
        controller: s.controller,
        transport: s.net.transport,
        base: { content: canonical(doc("Opened")), revision: R0 },
      }),
    ).toThrow(SaveCoordinatorError);
    const kept = await s.draft();
    expect(kept?.status === "ok" && kept.draft.content).toEqual(doc("Sent"));
    // The lost request may still arrive: written once, at R0 + 1, and never twice.
    s.net.attempts[0].commit();
    expect(s.net.server).toMatchObject({ revision: R0 + 1, writes: 1 });
    await s.controller.dispose();
  });

  it("H, storage unavailable: never said kept on the device, the server's answer reported as it is", async () => {
    const failing: DraftStorage = {
      writeDraft: async () => {
        throw new DraftStorageError("unavailable");
      },
      confirmDraft,
      refuseDraft: async () => {
        throw new DraftStorageError("unavailable");
      },
    };
    const s = session(failing);
    await s.type(doc("Words"));
    expect(s.controller.getState()).toMatchObject({
      storageError: "unavailable",
      localSequence: 0,
    });
    // A failed draft write does not stop the save.
    expect(s.net.attempts).toHaveLength(1);
    const [attempt] = s.net.attempts;
    attempt.respond({ kind: "refused", sequence: attempt.request.sequence, code: "invalid" });
    await drain();
    expect(s.controller.getState().refusalRecord).toMatchObject({
      status: "failed",
      error: "unavailable",
    });
    expect(autosaveStatus(s.controller.getState())).toBe("unprotected");
    expect(s.status()).toBe("blocked");
    // The editor still holds the words; nothing was discarded.
    expect(s.editor.current).toEqual(doc("Words"));
    await s.controller.dispose();
  });

  it("H, a real store that fails only the refusal: the words stay kept and said so", async () => {
    const s = session({
      writeDraft,
      confirmDraft,
      refuseDraft: async () => {
        throw new DraftStorageError("quota");
      },
    });
    await s.type(doc("Words"));
    s.net.attempts[0].respond({ kind: "conflict", sequence: 1, code: "stale", revision: 11 });
    await drain();
    expect(s.controller.getState()).toMatchObject({
      refusalRecord: { status: "failed", error: "quota", code: "stale" },
      storageError: null,
      localSequence: 1,
    });
    const kept = await s.draft();
    expect(kept?.status === "ok" && kept.draft.content).toEqual(doc("Words"));
    await s.controller.dispose();
  });

  it("uses only the session's own account and outline for every operation", async () => {
    const calls: { owner: string; outlineId: string; draftId: string }[] = [];
    const watch = <T extends (...args: never[]) => unknown>(fn: T) =>
      ((who: string, input: { outlineId: string; draftId: string }) => {
        calls.push({ owner: who, outlineId: input.outlineId, draftId: input.draftId });
        return (fn as unknown as (w: string, i: unknown) => unknown)(who, input);
      }) as unknown as T;
    const s = session({
      writeDraft: watch(writeDraft),
      confirmDraft: watch(confirmDraft),
      refuseDraft: watch(refuseDraft),
    });
    await s.type(doc("One"));
    s.net.attempts[0].respond({ kind: "refused", sequence: 1, code: "invalid" });
    await drain();
    await s.type(doc("Two"));
    s.net.attempts[1].respond(s.net.attempts[1].commit());
    await drain();
    expect(calls.length).toBeGreaterThanOrEqual(4);
    for (const call of calls) {
      expect(call).toEqual({ owner, outlineId, draftId: s.controller.draftId });
    }
    await s.controller.dispose();
  });
});

describe("network failures (A2.3B.2C)", () => {
  /** Lets `ms` pass on the clock, with IndexedDB and promises run between. */
  async function wait(ms: number) {
    await vi.advanceTimersByTimeAsync(ms);
    await drain();
  }

  it("a save committed after the browser stopped waiting: read back, written once, settled once", async () => {
    const s = session();
    await s.type(doc("Sent"));
    const [original] = s.net.attempts;
    await wait(15_000);
    // Timed out: the read finds the base, and the one conditional retry goes out.
    expect(s.net.reads).toBe(1);
    expect(s.net.attempts).toHaveLength(2);
    // The original reaches the server late and commits; its late answer is dropped.
    original.respond(original.commit());
    await drain();
    expect(s.controller.getState()).toMatchObject({ confirmedSequence: 0, saving: 1 });
    // The retry meets stale (the original's own write) and is read back.
    const retry = s.net.attempts[1];
    retry.respond(retry.commit());
    await drain();
    expect(s.coordinator.getState()).toMatchObject({
      phase: "idle",
      revision: R0 + 1,
      reconciliation: { result: "saved" },
      recovery: null,
    });
    expect(s.net.server).toMatchObject({ revision: R0 + 1, writes: 1 });
    expect(s.net.attempts).toHaveLength(2);
    expect(await s.draft()).toBeNull();
    expect(s.status()).toBe("saved");
    await s.controller.dispose();
  });

  it("both requests time out and reads fail: a bounded read settles the retry's late commit, and the original never writes", async () => {
    const s = session();
    await s.type(doc("Sent"));
    const [original] = s.net.attempts;
    await wait(15_000);
    const retry = s.net.attempts[1];
    s.net.failReads(2);
    await wait(15_000); // the retry times out; its read back fails
    expect(s.coordinator.getState().recovery).toMatchObject({ retries: 0, delayMs: 1000 });
    await wait(1000); // fails again
    expect(s.coordinator.getState().recovery).toMatchObject({ retries: 1, delayMs: 2000 });
    retry.commit();
    await wait(2000);
    expect(s.coordinator.getState()).toMatchObject({
      phase: "idle",
      confirmedSequence: 1,
      recovery: null,
    });
    expect(original.commit()).toMatchObject({ kind: "conflict", code: "stale" });
    expect(s.net.server.writes).toBe(1);
    expect(s.net.attempts).toHaveLength(2);
    expect(await s.draft()).toBeNull();
    await s.controller.dispose();
  });

  it("retries exhausted, then the person's recovery finds the original committed", async () => {
    const s = session();
    await s.type(doc("Sent"));
    const [original] = s.net.attempts;
    s.net.failReads(100);
    original.lose();
    await drain();
    await wait(31_000);
    expect(s.net.reads).toBe(6);
    expect(s.coordinator.getState().recovery).toMatchObject({ status: "exhausted", retries: 5 });
    expect(s.status()).toBe("stalled");
    // Held all along: the claim, and the words on the device.
    expect(s.controller.getState().saving).toBe(1);
    const kept = await s.draft();
    expect(kept?.status === "ok" && kept.draft.content).toEqual(doc("Sent"));
    await wait(10 * 60_000);
    expect(s.net.reads).toBe(6);
    // The server took the original meanwhile.
    original.commit();
    s.net.failReads(0);
    await s.coordinator.recover();
    await drain();
    expect(s.coordinator.getState()).toMatchObject({
      phase: "idle",
      revision: R0 + 1,
      reconciliation: { result: "saved" },
    });
    expect(s.net.server.writes).toBe(1);
    expect(s.net.attempts).toHaveLength(1);
    expect(await s.draft()).toBeNull();
    await s.controller.dispose();
  });

  it("offline editing: every snapshot reaches IndexedDB, nothing is sent, and online sends the newest once", async () => {
    const s = session();
    s.link.set(false);
    for (const words of ["Offline A", "Offline B", "Offline C"]) await s.type(doc(words));
    await wait(60_000);
    expect(s.net.attempts).toHaveLength(0);
    const kept = await s.draft();
    expect(kept?.status === "ok" && kept.draft.content).toEqual(doc("Offline C"));
    expect(s.status()).toBe("offline");
    s.link.set(true);
    s.link.set(true);
    await drain();
    expect(s.net.attempts).toHaveLength(1);
    expect(s.net.attempts[0].request).toMatchObject({ sequence: 3, content: doc("Offline C") });
    const attempt = s.net.attempts[0];
    attempt.respond(attempt.commit());
    await drain();
    expect(s.status()).toBe("saved");
    expect(await s.draft()).toBeNull();
    await s.controller.dispose();
  });

  it("offline while a save is out and its answer lost: the read waits for online, then settles it", async () => {
    const s = session();
    await s.type(doc("Sent"));
    const [original] = s.net.attempts;
    s.link.set(false);
    original.lose();
    await wait(60_000);
    expect(s.net.reads).toBe(0);
    expect(s.coordinator.getState().recovery).toMatchObject({ status: "offline", retries: 0 });
    s.link.set(true);
    await drain();
    // The base still there: the conditional retry, which the server takes.
    expect(s.net.reads).toBe(1);
    const retry = s.net.attempts[1];
    retry.respond(retry.commit());
    await drain();
    expect(s.status()).toBe("saved");
    expect(s.net.server.writes).toBe(1);
    await s.controller.dispose();
  });

  it("reconnection during a request starts nothing alongside it", async () => {
    const s = session();
    await s.type(doc("Sent"));
    s.link.set(false);
    s.link.set(true);
    s.link.set(true);
    await drain();
    expect(s.net.attempts).toHaveLength(1);
    const attempt = s.net.attempts[0];
    attempt.respond(attempt.commit());
    await drain();
    expect(s.status()).toBe("saved");
    expect(s.net.attempts).toHaveLength(1);
    expect(s.net.reads).toBe(0);
    await s.controller.dispose();
  });

  it("a draft write fails while offline: unprotected, never saved; the next write protects it again", async () => {
    let failing = false;
    const s = session({
      writeDraft: (who, input) =>
        failing ? Promise.reject(new DraftStorageError("quota")) : writeDraft(who, input),
      confirmDraft,
      refuseDraft,
    });
    s.link.set(false);
    failing = true;
    await s.type(doc("Lost to storage"));
    expect(s.controller.getState().storageError).toBe("quota");
    expect(s.status()).toBe("unprotected");
    failing = false;
    await s.type(doc("Kept"));
    expect(s.controller.getState().storageError).toBeNull();
    expect(s.status()).toBe("offline");
    s.link.set(true);
    await drain();
    const attempt = s.net.attempts[0];
    expect(attempt.request.content).toEqual(doc("Kept"));
    attempt.respond(attempt.commit());
    await drain();
    expect(s.status()).toBe("saved");
    await s.controller.dispose();
  });

  it("invalid content corrected while offline: the refusal kept as history, the correction sent alone once online", async () => {
    const s = session();
    await s.type(invalid);
    await drain();
    expect(s.coordinator.getState().block).toMatchObject({ reason: "refused" });
    s.link.set(false);
    await s.type(doc("Corrected"));
    await wait(60_000);
    expect(s.net.attempts).toHaveLength(0);
    expect(s.status()).toBe("offline");
    const kept = await s.draft();
    expect(kept?.status === "ok" && kept.draft.content).toEqual(doc("Corrected"));
    expect(kept?.status === "ok" && currentRefusal(kept.draft)).toBeNull();
    s.link.set(true);
    await drain();
    expect(s.net.attempts).toHaveLength(1);
    expect(s.net.attempts[0].request).toMatchObject({ sequence: 2, expectedRevision: R0 });
    const attempt = s.net.attempts[0];
    attempt.respond(attempt.commit());
    await drain();
    expect(s.status()).toBe("saved");
    expect(await s.draft()).toBeNull();
    await s.controller.dispose();
  });

  it("disposed during backoff: the claim and the draft are kept, nothing more is read, and a new coordinator is refused", async () => {
    const s = session();
    await s.type(doc("Sent"));
    s.net.failReads(100);
    s.net.attempts[0].lose();
    await drain();
    expect(s.coordinator.getState().recovery).toMatchObject({ status: "scheduled" });
    s.coordinator.dispose();
    await wait(10 * 60_000);
    expect(s.net.reads).toBe(1);
    expect(s.controller.getState().saving).toBe(1);
    const kept = await s.draft();
    expect(kept?.status === "ok" && kept.draft.content).toEqual(doc("Sent"));
    expect(() =>
      createSaveCoordinator({
        controller: s.controller,
        transport: s.net.transport,
        base: { content: canonical(doc("Opened")), revision: R0 },
      }),
    ).toThrow(SaveCoordinatorError);
    await s.controller.dispose();
  });
});
