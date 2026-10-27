import "fake-indexeddb/auto";

import type { JSONContent } from "@tiptap/core";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { documentV4, pointV4, proseV4 } from "@/features/editor-lab/v4/fixtures";
import { resetAccountMemory } from "@/features/offline/account";
import { closeOfflineDb } from "@/features/offline/db";
import { documentLimits } from "../model";
import { confirmDraft, DraftStorageError, readDraft, writeDraft } from "../recovery/store";
import { createAutosaveController, type DraftStorage } from "./controller";
import { autosaveStatus, jsonEqual, type DocumentSource } from "./model";

/*
 * The autosave controller (A2.3B.1). Timing and the state machine run on
 * fake timers with a storage stand-in that can hold, fail, and count; the
 * ordering that matters across IndexedDB runs on the real recovery store in
 * fake-indexeddb.
 */

const owner = "4f1c2d3e-0000-4000-8000-00000000a11c";
const stranger = "4f1c2d3e-0000-4000-8000-000000000b0b";
const outlineId = "0b6a3c1e-9d54-4c7e-8a55-1f1f6d3b2a10";
const marker = "SECRET-SERMON-WORDS";

const doc = (words: string) => documentV4([pointV4("p-1", "Grace", 1), proseV4(words, 1)]);

/** A document source the test moves by hand. */
function fakeSource(initial: JSONContent) {
  let current = initial;
  let change: (() => void) | null = null;
  let end: (() => void) | null = null;
  let reads = 0;
  let gone = false;
  const source: DocumentSource = {
    subscribe(onChange, onEnd) {
      change = onChange;
      end = onEnd;
      return () => {
        change = null;
        end = null;
      };
    },
    read() {
      if (gone) throw new Error("gone");
      reads += 1;
      return current;
    },
  };
  return {
    source,
    /** The editor now holds `next`. */
    edit(next: JSONContent) {
      current = next;
      change?.();
    },
    end() {
      end?.();
      gone = true;
    },
    get reads() {
      return reads;
    },
    get subscribed() {
      return change !== null;
    },
  };
}

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

/** Storage that records, can hold the next write until released, and can fail. */
function stubStorage() {
  const writes: { sequence: number; content: JSONContent; baseRevision: number }[] = [];
  const confirms: { sequence: number; revision: number }[] = [];
  const failures: unknown[] = [];
  const confirmFailures: unknown[] = [];
  let hold: ReturnType<typeof deferred> | null = null;
  let running = 0;
  let maxRunning = 0;
  const storage: DraftStorage = {
    writeDraft: vi.fn(async (_owner, input) => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      try {
        if (hold) {
          const held = hold;
          hold = null;
          await held.promise;
        }
        if (failures.length) throw failures.shift();
        writes.push({
          sequence: input.sequence,
          content: input.content,
          baseRevision: input.baseRevision,
        });
        return "written" as const;
      } finally {
        running -= 1;
      }
    }),
    confirmDraft: vi.fn(async (_owner, input) => {
      if (confirmFailures.length) throw confirmFailures.shift();
      confirms.push({ sequence: input.sequence, revision: input.revision });
      return "cleared" as const;
    }),
  };
  return {
    storage,
    writes,
    confirms,
    failNext: (error: unknown) => failures.push(error),
    failNextConfirm: (error: unknown) => confirmFailures.push(error),
    holdNext() {
      hold = deferred();
      return hold;
    },
    get maxRunning() {
      return maxRunning;
    },
  };
}

function setup(initial = doc("Opened"), revision = 3) {
  const editor = fakeSource(initial);
  const stub = stubStorage();
  const controller = createAutosaveController({
    owner,
    outlineId,
    revision,
    source: editor.source,
    storage: stub.storage,
  });
  return { editor, stub, controller };
}

/** Lets queued promise work run (no timers move). */
const settle = () => vi.advanceTimersByTimeAsync(0);

describe("scheduling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("takes a snapshot 350 ms after the last change, not before, and reads only then", async () => {
    const { editor, stub, controller } = setup();
    expect(editor.reads).toBe(1); // the baseline
    for (let i = 0; i < 20; i += 1) editor.edit(doc(`Draft ${i}`));
    expect(controller.getState()).toMatchObject({ changed: true, local: "scheduled" });
    expect(autosaveStatus(controller.getState())).toBe("pending");
    await vi.advanceTimersByTimeAsync(349);
    expect(editor.reads).toBe(1);
    expect(stub.writes).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(editor.reads).toBe(2);
    expect(stub.writes.map((write) => write.sequence)).toEqual([1]);
    expect(stub.writes[0].content).toEqual(doc("Draft 19"));
    expect(autosaveStatus(controller.getState())).toBe("local");
    expect(vi.getTimerCount()).toBe(0);
    await controller.dispose();
  });

  it("still keeps continuous typing at least every 2 seconds", async () => {
    const { editor, stub, controller } = setup();
    for (let i = 1; i <= 45; i += 1) {
      editor.edit(doc(`Typing ${i}`));
      await vi.advanceTimersByTimeAsync(100);
    }
    // Changes every 100 ms for 4.5 s: the debounce never fires, the maximum does.
    expect(stub.writes.map((write) => write.sequence)).toEqual([1, 2]);
    expect(stub.writes[0].content).toEqual(doc("Typing 20"));
    expect(stub.writes[1].content).toEqual(doc("Typing 40"));
    await controller.dispose();
  });

  it("flushes at once, cancelling its timers, and reports kept only after the write finished", async () => {
    const { editor, stub, controller } = setup();
    const held = stub.holdNext();
    editor.edit(doc("Now"));
    const flushed = controller.flush();
    expect(vi.getTimerCount()).toBe(0);
    await settle();
    expect(controller.getState()).toMatchObject({
      sequence: 1,
      localSequence: 0,
      local: "writing",
    });
    expect(autosaveStatus(controller.getState())).toBe("pending");
    held.release();
    const state = await flushed;
    expect(state).toMatchObject({ sequence: 1, localSequence: 1, local: "idle" });
    await controller.dispose();
  });

  it("writes one at a time, and a waiting write is replaced by the newest snapshot", async () => {
    const { editor, stub, controller } = setup();
    const held = stub.holdNext();
    editor.edit(doc("One"));
    void controller.flush();
    await settle();
    editor.edit(doc("Two"));
    void controller.flush();
    editor.edit(doc("Three"));
    void controller.flush();
    held.release();
    await controller.flush();
    expect(stub.writes.map((write) => [write.sequence, write.content])).toEqual([
      [1, doc("One")],
      [3, doc("Three")],
    ]);
    expect(stub.maxRunning).toBe(1);
    await controller.dispose();
  });

  it("writes nothing for content equal to the newest snapshot, whatever its key order", async () => {
    const { editor, stub, controller } = setup();
    editor.edit(doc("Kept"));
    await controller.flush();
    const reordered = JSON.parse(JSON.stringify(doc("Kept")), (_key, value) =>
      value && typeof value === "object" && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value).reverse())
        : value,
    );
    expect(JSON.stringify(reordered)).not.toBe(JSON.stringify(doc("Kept")));
    editor.edit(reordered);
    const state = await controller.flush();
    expect(stub.writes).toHaveLength(1);
    expect(state.sequence).toBe(1);
    // An edit taken back to the opened document is nothing new either.
    const fresh = setup();
    fresh.editor.edit(doc("Typo"));
    fresh.editor.edit(doc("Opened"));
    expect(autosaveStatus(await fresh.controller.flush())).toBe("unchanged");
    expect(fresh.stub.writes).toHaveLength(0);
    await controller.dispose();
    await fresh.controller.dispose();
  });
});

describe("storage failures", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("never counts a failed write as kept, retries nothing by itself, and goes on with the next", async () => {
    const { editor, stub, controller } = setup();
    stub.failNext(new DraftStorageError("quota"));
    editor.edit(doc(`${marker} one`));
    const failed = await controller.flush();
    expect(failed).toMatchObject({ sequence: 1, localSequence: 0, storageError: "quota" });
    expect(autosaveStatus(failed)).toBe("unprotected");
    expect(JSON.stringify(failed)).not.toContain(marker);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(stub.storage.writeDraft).toHaveBeenCalledTimes(1);
    // The next change is written: the failure did not stop the queue.
    editor.edit(doc("two"));
    await vi.advanceTimersByTimeAsync(350);
    expect(controller.getState()).toMatchObject({ localSequence: 2, storageError: null });
    expect(autosaveStatus(controller.getState())).toBe("local");
    await controller.dispose();
  });

  it("retries the newest snapshot only when asked", async () => {
    const { editor, stub, controller } = setup();
    stub.failNext(new Error("disk"));
    editor.edit(doc("Words"));
    expect((await controller.flush()).storageError).toBe("failed");
    const state = await controller.retry();
    expect(state).toMatchObject({ localSequence: 1, storageError: null });
    expect(stub.writes.map((write) => write.sequence)).toEqual([1]);
    // Nothing failed: a retry writes nothing.
    await controller.retry();
    expect(stub.storage.writeDraft).toHaveBeenCalledTimes(2);
    await controller.dispose();
  });

  it("goes on after a failed confirmation", async () => {
    const { editor, stub, controller } = setup();
    editor.edit(doc("A"));
    await controller.flush();
    stub.failNextConfirm(new DraftStorageError("failed"));
    const claim = controller.claimSave();
    expect(controller.confirmSave(claim!.sequence, 4)).toBe(true);
    await controller.flush();
    editor.edit(doc("B"));
    const state = await controller.flush();
    expect(state).toMatchObject({ localSequence: 2, storageError: null });
    expect(stub.writes.map((write) => [write.sequence, write.baseRevision])).toEqual([
      [1, 3],
      [2, 4],
    ]);
    await controller.dispose();
  });
});

describe("the boundary with A2.3B.2's saves", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("confirms only the snapshot claimed, and says saved only then", async () => {
    const { editor, controller } = setup();
    editor.edit(doc("A"));
    await controller.flush();
    expect(controller.confirmSave(1, 4)).toBe(false);
    expect(autosaveStatus(controller.getState())).toBe("local");
    const claim = controller.claimSave();
    expect(claim).toMatchObject({ sequence: 1, expectedRevision: 3, content: doc("A") });
    expect(controller.claimSave()).toBeNull(); // one in flight
    expect(controller.confirmSave(2, 4)).toBe(false);
    expect(controller.confirmSave(1, 2)).toBe(false); // a revision going back
    expect(controller.confirmSave(1, 4)).toBe(true);
    expect(controller.confirmSave(1, 4)).toBe(false);
    expect(controller.getState()).toMatchObject({
      confirmedSequence: 1,
      revision: 4,
      saving: null,
    });
    expect(autosaveStatus(controller.getState())).toBe("saved");
    editor.edit(doc("B"));
    expect(autosaveStatus(controller.getState())).toBe("pending");
    await controller.dispose();
  });

  it("claims nothing before its draft write has settled, nor the opened document", async () => {
    const { editor, stub, controller } = setup();
    expect(controller.claimSave()).toBeNull();
    const held = stub.holdNext();
    editor.edit(doc("A"));
    void controller.flush();
    expect(controller.claimSave()).toBeNull(); // waiting
    await settle();
    expect(controller.claimSave()).toBeNull(); // running
    held.release();
    await controller.flush();
    const claim = controller.claimSave();
    expect(claim?.sequence).toBe(1);
    expect(controller.releaseSave(1)).toBe(true);
    expect(controller.claimSave()?.sequence).toBe(1);
    await controller.dispose();
  });

  it("may claim a snapshot whose write failed: the save still goes when the device cannot keep it", async () => {
    const { editor, stub, controller } = setup();
    stub.failNext(new DraftStorageError("unavailable"));
    editor.edit(doc("A"));
    await controller.flush();
    expect(controller.claimSave()?.sequence).toBe(1);
    expect(controller.confirmSave(1, 4)).toBe(true);
    expect(autosaveStatus(controller.getState())).toBe("saved");
    await controller.dispose();
  });
});

describe("ordering in IndexedDB", () => {
  beforeEach(async () => {
    await closeOfflineDb();
    globalThis.indexedDB = new IDBFactory();
    resetAccountMemory();
  });
  afterEach(async () => {
    await closeOfflineDb();
  });

  function real(initial = doc("Opened")) {
    const editor = fakeSource(initial);
    const controller = createAutosaveController({
      owner,
      outlineId,
      revision: 3,
      source: editor.source,
    });
    const draft = async (who = owner) => readDraft(who, { outlineId, draftId: controller.draftId });
    return { editor, controller, draft };
  }

  it("keeps the newest snapshot, with rising sequences, in this session's own draft", async () => {
    const { editor, controller, draft } = real();
    for (const words of ["One", "Two", "Three"]) {
      editor.edit(doc(words));
      await controller.flush();
    }
    const read = await draft();
    expect(read).toMatchObject({ status: "ok", draftId: controller.draftId });
    if (read?.status !== "ok") return;
    expect(read.draft).toMatchObject({ sequence: 3, confirmedSequence: 0, baseRevision: 3 });
    expect(read.draft.content).toEqual(doc("Three"));
    expect(await draft(stranger)).toBeNull();
    await controller.dispose();
  });

  it("clears the draft on a confirmation of its snapshot, and keeps a newer one", async () => {
    const { editor, controller, draft } = real();
    editor.edit(doc("One"));
    await controller.flush();
    controller.claimSave();
    // Snapshot 2 is decided (its write queued) before the confirmation of 1 arrives.
    editor.edit(doc("Two"));
    const flushing = controller.flush();
    expect(controller.confirmSave(1, 4)).toBe(true);
    await flushing;
    await controller.flush();
    const read = await draft();
    if (read?.status !== "ok") throw new Error("expected the newer draft");
    expect(read.draft).toMatchObject({ sequence: 2, confirmedSequence: 1, baseRevision: 4 });
    expect(read.draft.content).toEqual(doc("Two"));
    // Then 2 is confirmed: the draft is gone.
    controller.claimSave();
    expect(controller.confirmSave(2, 5)).toBe(true);
    await controller.flush();
    expect(await draft()).toBeNull();
    await controller.dispose();
  });

  it("never makes a cleared draft again with a late write of what was confirmed", async () => {
    const editor = fakeSource(doc("Opened"));
    let failFirst = true;
    const controller = createAutosaveController({
      owner,
      outlineId,
      revision: 3,
      source: editor.source,
      storage: {
        writeDraft: async (who, input) => {
          if (failFirst) {
            failFirst = false;
            throw new DraftStorageError("quota");
          }
          return writeDraft(who, input);
        },
        confirmDraft,
      },
    });
    editor.edit(doc("One"));
    await controller.flush(); // its write failed
    expect(controller.claimSave()?.sequence).toBe(1);
    // A retry of 1 is queued, then the server confirms 1 before it runs.
    const retried = controller.retry();
    expect(controller.confirmSave(1, 4)).toBe(true);
    await retried;
    await controller.flush();
    expect(await readDraft(owner, { outlineId, draftId: controller.draftId })).toBeNull();
    await controller.dispose();
  });

  it("never writes, after a confirmation, a snapshot whose earlier write failed", async () => {
    const editor = fakeSource(doc("Opened"));
    let full = true;
    const controller = createAutosaveController({
      owner,
      outlineId,
      revision: 3,
      source: editor.source,
      storage: {
        writeDraft: async (who, input) => {
          if (full) throw new DraftStorageError("quota");
          return writeDraft(who, input);
        },
        confirmDraft,
      },
    });
    editor.edit(doc("One"));
    expect((await controller.flush()).storageError).toBe("quota");
    controller.claimSave();
    expect(controller.confirmSave(1, 4)).toBe(true);
    await controller.flush();
    // The device has room again; writing 1 now would make a draft of what the server has.
    full = false;
    await controller.retry();
    expect(await readDraft(owner, { outlineId, draftId: controller.draftId })).toBeNull();
    await controller.dispose();
  });
});

describe("lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("is one account, one outline, and a draft of its own, fixed from the start", async () => {
    const one = setup();
    const two = setup();
    expect(one.controller.draftId).toMatch(/^[0-9a-f-]{36}$/);
    expect(one.controller.draftId).not.toBe(two.controller.draftId);
    expect(one.controller).toMatchObject({ owner, outlineId });
    one.editor.edit(doc("A"));
    await one.controller.flush();
    expect(one.stub.storage.writeDraft).toHaveBeenCalledWith(
      owner,
      expect.objectContaining({ outlineId, draftId: one.controller.draftId }),
    );
    const source = fakeSource(doc("x")).source;
    expect(() => createAutosaveController({ owner: "", outlineId, revision: 1, source })).toThrow(
      DraftStorageError,
    );
    expect(() =>
      createAutosaveController({ owner, outlineId: "not-a-uuid", revision: 1, source }),
    ).toThrow(DraftStorageError);
    expect(() => createAutosaveController({ owner, outlineId, revision: -1, source })).toThrow(
      DraftStorageError,
    );
    await one.controller.dispose();
    await two.controller.dispose();
  });

  it("disposed during the debounce: keeps the last change, cancels its timers, stops watching", async () => {
    const { editor, stub, controller } = setup();
    editor.edit(doc("Last"));
    expect(vi.getTimerCount()).toBe(2);
    await controller.dispose();
    expect(vi.getTimerCount()).toBe(0);
    expect(editor.subscribed).toBe(false);
    expect(stub.writes.map((write) => [write.sequence, write.content])).toEqual([[1, doc("Last")]]);
    editor.edit(doc("After"));
    await vi.advanceTimersByTimeAsync(5000);
    expect(stub.writes).toHaveLength(1);
    expect(controller.claimSave()).toBeNull();
  });

  it("disposed during a write: lets it finish, and tells nobody afterwards", async () => {
    const { editor, stub, controller } = setup();
    const listener = vi.fn();
    controller.subscribe(listener);
    const held = stub.holdNext();
    editor.edit(doc("A"));
    void controller.flush();
    await settle();
    const disposed = controller.dispose();
    const calls = listener.mock.calls.length;
    expect(listener.mock.calls.at(-1)?.[0]).toMatchObject({ disposed: true });
    held.release();
    await disposed;
    expect(stub.writes.map((write) => write.sequence)).toEqual([1]);
    expect(listener).toHaveBeenCalledTimes(calls);
    expect(controller.getState()).toMatchObject({ localSequence: 1, disposed: true });
  });

  it("disposes itself when its source ends, and still accepts the confirmation of a save in flight", async () => {
    const { editor, stub, controller } = setup();
    editor.edit(doc("A"));
    await controller.flush();
    const claim = controller.claimSave();
    editor.edit(doc("B"));
    editor.end();
    expect(controller.getState().disposed).toBe(true);
    expect(controller.confirmSave(claim!.sequence, 4)).toBe(true);
    await controller.flush();
    expect(stub.writes.map((write) => write.sequence)).toEqual([1, 2]);
    expect(stub.confirms).toEqual([{ sequence: 1, revision: 4 }]);
  });

  it("publishes on changes of state, not on every keystroke", async () => {
    const { editor, controller } = setup();
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);
    for (let i = 0; i < 50; i += 1) editor.edit(doc(`Key ${i}`));
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    await controller.flush();
    expect(listener).toHaveBeenCalledTimes(1);
    await controller.dispose();
  });
});

describe("content safety", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps nothing it cannot store exactly, says so with a path, and never the words", async () => {
    const { editor, stub, controller } = setup();
    editor.edit(doc(`${marker}\u0000`));
    const state = await controller.flush();
    expect(state.refusal).toEqual({
      reason: "unsafe",
      problem: { code: "unstorable_text", path: "/content/1/content/0/text", detail: "nul" },
    });
    expect(state.sequence).toBe(0);
    expect(stub.writes).toHaveLength(0);
    expect(autosaveStatus(state)).toBe("unprotected");
    expect(JSON.stringify(state)).not.toContain(marker);
    // The person fixes it: kept again.
    editor.edit(doc(marker));
    const fixed = await controller.flush();
    expect(fixed).toMatchObject({ refusal: null, sequence: 1, localSequence: 1 });
  });

  it("keeps a document over the limit on the device, and never offers it for a save", async () => {
    const { editor, stub, controller } = setup();
    editor.edit(doc("x".repeat(documentLimits.bytes)));
    const state = await controller.flush();
    expect(state.refusal).toMatchObject({ reason: "too_large", limit: documentLimits.bytes });
    expect(stub.writes.map((write) => write.sequence)).toEqual([1]);
    expect(autosaveStatus(state)).toBe("attention");
    expect(controller.claimSave()).toBeNull();
    editor.edit(doc("short again"));
    const back = await controller.flush();
    expect(back.refusal).toBeNull();
    expect(controller.claimSave()?.sequence).toBe(2);
    await controller.dispose();
  });

  it("writes the editor's document unchanged, as a plain copy", async () => {
    const attrs = Object.assign(Object.create(null), { depth: 1 });
    const fromEditor: JSONContent = {
      type: "doc",
      content: [
        { type: "paragraph", attrs, content: [{ type: "text", text: "Fe, esperanza y amor ✝️" }] },
      ],
    };
    const { editor, stub, controller } = setup();
    editor.edit(fromEditor);
    await controller.flush();
    const written = stub.writes[0].content;
    expect(Object.getPrototypeOf(written.content![0].attrs)).toBe(Object.prototype);
    expect(jsonEqual(written as never, JSON.parse(JSON.stringify(fromEditor)))).toBe(true);
    await controller.dispose();
  });
});
