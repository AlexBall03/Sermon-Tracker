import type { Editor, JSONContent } from "@tiptap/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { documentFixtures } from "@/features/editor-lab/documents";
import { documentV4, pointV4, proseV4 } from "@/features/editor-lab/v4/fixtures";
import { caret, testEditorV4 } from "@/features/editor-lab/v4/testing";
import { canonicalDocument } from "../canonical";
import type { JsonValue } from "../json";
import { documentLimits } from "../model";
import { DraftStorageError } from "../recovery/store";
import type { DocumentReadOutcome, DocumentSaveOutcome, DocumentSaveRequest } from "../saving";
import type { Connectivity } from "./connectivity";
import { createAutosaveController, type DraftStorage } from "./controller";
import { createSaveCoordinator, SaveCoordinatorError } from "./coordinator";
import { editorSource } from "./editor-adapter";
import {
  jsonEqual,
  networkRecoveryTiming,
  recoveryTiming,
  retryDelay,
  serverSaveStatus,
  type DocumentSource,
  type NetworkRecoveryTiming,
} from "./model";
import { readHeaders, statusOf } from "../read-route";
import type { DocumentReadResult } from "../reader";
import { documentTransport, type DocumentTransport } from "./transport";

/*
 * The save coordinator (A2.3B.2A) over the real autosave controller, on fake
 * timers, with a storage stand-in and a transport the test answers by hand.
 */

const owner = "4f1c2d3e-0000-4000-8000-00000000a11c";
const outlineId = "0b6a3c1e-9d54-4c7e-8a55-1f1f6d3b2a10";

/**
 * The real transport (A2.3B.2D): saves through `actions.save`, reads through
 * a `fetch` answered as the route answers `actions.read`'s result.
 */
function realTransport(actions: { save: unknown; read: unknown }) {
  const read = actions.read as (id: string) => Promise<DocumentReadResult>;
  return documentTransport({
    save: actions.save as never,
    fetch: (async (url: string) => {
      const result = await read(decodeURIComponent(url.split("/").pop() ?? ""));
      return Response.json(result, { status: statusOf(result), headers: readHeaders });
    }) as unknown as typeof fetch,
  });
}

const doc = (words: string) => documentV4([pointV4("p-1", "Grace", 1), proseV4(words, 1)]);

function canonical(json: unknown): JSONContent {
  const result = canonicalDocument(json);
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result.content;
}

const equal = (a: unknown, b: unknown) => jsonEqual(a as JsonValue, b as JsonValue);

/** A document source the test moves by hand; selection and view state never reach it. */
function fakeSource(initial: JSONContent) {
  let current = initial;
  let change: (() => void) | null = null;
  let end: (() => void) | null = null;
  const source: DocumentSource = {
    subscribe(onChange, onEnd) {
      change = onChange;
      end = onEnd;
      return () => {
        change = null;
        end = null;
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
    end: () => end?.(),
  };
}

function deferred() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

/** Storage that logs, can hold the next write, and can fail it. */
function stubStorage(log: string[]) {
  let hold: ReturnType<typeof deferred> | null = null;
  const failures: unknown[] = [];
  const refuseFailures: unknown[] = [];
  const storage: DraftStorage = {
    writeDraft: vi.fn(async (_owner, input) => {
      if (hold) {
        const held = hold;
        hold = null;
        await held.promise;
      }
      if (failures.length) {
        log.push(`write-failed:${input.sequence}`);
        throw failures.shift();
      }
      log.push(`write:${input.sequence}`);
      return "written" as const;
    }),
    confirmDraft: vi.fn(async (_owner, input) => {
      log.push(`clear:${input.sequence}`);
      return "cleared" as const;
    }),
    refuseDraft: vi.fn(async (_owner, input) => {
      if (refuseFailures.length) {
        log.push(`refuse-failed:${input.sequence}:${input.code}`);
        throw refuseFailures.shift();
      }
      log.push(`refuse:${input.sequence}:${input.code}`);
      return "refused" as const;
    }),
  };
  return {
    storage,
    holdNext() {
      hold = deferred();
      return hold;
    },
    failNext: (error: unknown) => failures.push(error),
    failNextRefuse: (error: unknown) => refuseFailures.push(error),
  };
}

const confirmedFor = (request: DocumentSaveRequest): DocumentSaveOutcome => ({
  kind: "confirmed",
  sequence: request.sequence,
  revision: request.expectedRevision + 1,
});

/**
 * A transport the test answers. `auto` confirms each save as the server would;
 * `manual` keeps each one in flight until `answer` or `reject`.
 */
function fakeTransport(log: string[], mode: "auto" | "manual") {
  const requests: DocumentSaveRequest[] = [];
  const waiting: {
    request: DocumentSaveRequest;
    resolve: (outcome: DocumentSaveOutcome) => void;
    reject: (error: unknown) => void;
  }[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  // Reads answer `failed` at once unless held; held ones wait for `answerRead`.
  let holdReads = false;
  const readsWaiting: ((outcome: DocumentReadOutcome) => void)[] = [];
  const transport: DocumentTransport = {
    save: vi.fn((request: DocumentSaveRequest) => {
      log.push(`save:${request.sequence}@${request.expectedRevision}`);
      requests.push(request);
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      return new Promise<DocumentSaveOutcome>((resolve, reject) => {
        const done = (outcome: DocumentSaveOutcome) => {
          inFlight -= 1;
          resolve(outcome);
        };
        const fail = (error: unknown) => {
          inFlight -= 1;
          reject(error);
        };
        if (mode === "auto") done(confirmedFor(request));
        else waiting.push({ request, resolve: done, reject: fail });
      });
    }),
    read: vi.fn((id: string) => {
      log.push(`read:${id === outlineId ? "outline" : id}`);
      if (!holdReads) return Promise.resolve<DocumentReadOutcome>({ kind: "failed" });
      return new Promise<DocumentReadOutcome>((resolve) => readsWaiting.push(resolve));
    }),
  };
  return {
    transport,
    requests,
    /** How many reads were asked for. */
    get reads() {
      return (transport.read as ReturnType<typeof vi.fn>).mock.calls.length;
    },
    get readsWaiting() {
      return readsWaiting.length;
    },
    holdReads() {
      holdReads = true;
    },
    /** Reads answer `failed` at once again (those already waiting stay waiting). */
    failReads() {
      holdReads = false;
    },
    /** Answers the oldest read waiting. */
    answerRead(outcome: DocumentReadOutcome) {
      const next = readsWaiting.shift();
      if (!next) throw new Error("no read waiting");
      next(outcome);
    },
    /** Answers the newest read waiting (older ones may have timed out, A2.3B.2C). */
    answerLatestRead(outcome: DocumentReadOutcome) {
      const next = readsWaiting.pop();
      if (!next) throw new Error("no read waiting");
      next(outcome);
    },
    get maxInFlight() {
      return maxInFlight;
    },
    get waiting() {
      return waiting.length;
    },
    /** Answers the oldest request in flight; by default, as the server confirms it. */
    answer(outcome?: (request: DocumentSaveRequest) => DocumentSaveOutcome) {
      const next = waiting.shift();
      if (!next) throw new Error("nothing in flight");
      next.resolve((outcome ?? confirmedFor)(next.request));
    },
    reject(error: unknown) {
      const next = waiting.shift();
      if (!next) throw new Error("nothing in flight");
      next.reject(error);
    },
  };
}

type SetupOptions = {
  initial?: JSONContent;
  revision?: number;
  mode?: "auto" | "manual";
  transport?: DocumentTransport;
  recovery?: Partial<NetworkRecoveryTiming>;
  connectivity?: Connectivity;
};

function setup({
  initial = doc("Opened"),
  revision = 8,
  mode = "auto",
  transport,
  recovery,
  connectivity,
}: SetupOptions = {}) {
  const log: string[] = [];
  const editor = fakeSource(initial);
  const stub = stubStorage(log);
  const controller = createAutosaveController({
    owner,
    outlineId,
    revision,
    source: editor.source,
    storage: stub.storage,
  });
  const net = fakeTransport(log, mode);
  const coordinator = createSaveCoordinator({
    controller,
    transport: transport ?? net.transport,
    base: { content: canonical(initial), revision },
    recovery,
    connectivity,
  });
  const status = () => serverSaveStatus(controller.getState(), coordinator.getState());
  return { log, editor, stub, controller, net, coordinator, status };
}

/** Lets promise work run without moving the clock. */
const settle = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("scheduling", () => {
  it("saves 1.5 s after the last change, not before, and the server's answer confirms it", async () => {
    const { editor, net, controller, coordinator, status } = setup();
    editor.edit(doc("Grace first"));
    expect(coordinator.getState().phase).toBe("scheduled");
    expect(status()).toBe("waiting"); // scheduled; nothing is said to be kept yet
    await vi.advanceTimersByTimeAsync(1499);
    expect(net.requests).toHaveLength(0);
    expect(status()).toBe("waiting");
    await vi.advanceTimersByTimeAsync(1);
    expect(net.requests).toHaveLength(1);
    expect(net.requests[0]).toMatchObject({ outlineId, sequence: 1, expectedRevision: 8 });
    expect(net.requests[0].content).toEqual(doc("Grace first"));
    expect(coordinator.getState()).toMatchObject({
      phase: "idle",
      revision: 9,
      confirmedSequence: 1,
      submission: null,
      block: null,
    });
    expect(controller.getState()).toMatchObject({
      confirmedSequence: 1,
      revision: 9,
      saving: null,
    });
    expect(status()).toBe("saved");
    await controller.dispose();
  });

  it("saves continuous typing by the 10 s maximum, far fewer requests than keystrokes", async () => {
    const { editor, net, controller } = setup();
    let keystrokes = 0;
    for (let t = 0; t < 12_000; t += 250) {
      keystrokes += 1;
      editor.edit(doc(`Typing ${keystrokes}`));
      await vi.advanceTimersByTimeAsync(250);
    }
    // Typing every 250 ms never lets the 1.5 s timer fire; the 10 s one does, once.
    expect(net.requests).toHaveLength(1);
    expect(keystrokes).toBe(48);
    expect(net.requests[0].content).toEqual(doc("Typing 40"));
    await vi.advanceTimersByTimeAsync(1500);
    expect(net.requests).toHaveLength(2);
    expect(net.requests[1].content).toEqual(doc(`Typing ${keystrokes}`));
    expect(net.requests[1].expectedRevision).toBe(9);
    await controller.dispose();
  });

  it("coalesces rapid edits into one request with the newest content", async () => {
    const { editor, net, controller } = setup();
    for (let i = 0; i < 30; i += 1) editor.edit(doc(`Draft ${i}`));
    await vi.advanceTimersByTimeAsync(1500);
    expect(net.requests).toHaveLength(1);
    expect(net.requests[0].content).toEqual(doc("Draft 29"));
    await controller.dispose();
  });

  it("waits again when a change comes just before the idle boundary", async () => {
    const { editor, net, controller } = setup();
    editor.edit(doc("A"));
    await vi.advanceTimersByTimeAsync(1499);
    editor.edit(doc("B"));
    await vi.advanceTimersByTimeAsync(1);
    expect(net.requests).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1499);
    expect(net.requests).toHaveLength(1);
    expect(net.requests[0].content).toEqual(doc("B"));
    await controller.dispose();
  });

  it("sends nothing for no change, an edit undone, or content equal to the last snapshot", async () => {
    const { editor, net, controller } = setup();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(net.requests).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
    // Changed and changed back before the local snapshot: nothing new.
    editor.edit(doc("Typo"));
    editor.edit(doc("Opened"));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(net.requests).toHaveLength(0);
    // Saved once; the same words again, in another key order, are nothing new.
    editor.edit(doc("Kept"));
    await vi.advanceTimersByTimeAsync(1500);
    expect(net.requests).toHaveLength(1);
    const reordered = JSON.parse(JSON.stringify(doc("Kept")), (_key, value) =>
      value && typeof value === "object" && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value).reverse())
        : value,
    );
    editor.edit(reordered);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(net.requests).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
    await controller.dispose();
  });

  it("cancels its timers on dispose and never sends afterwards", async () => {
    const { editor, net, controller, coordinator } = setup();
    editor.edit(doc("Unsent"));
    coordinator.dispose();
    expect(coordinator.getState().phase).toBe("disposed");
    await vi.advanceTimersByTimeAsync(30_000);
    expect(net.requests).toHaveLength(0);
    // The controller still keeps the words on the device.
    expect(controller.getState().localSequence).toBe(1);
    editor.edit(doc("More"));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(net.requests).toHaveLength(0);
    await controller.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("disposes itself with the controller (the editor destroyed)", async () => {
    const { editor, net, coordinator } = setup();
    const listener = vi.fn();
    coordinator.subscribe(listener);
    editor.edit(doc("Last words"));
    editor.end();
    expect(coordinator.getState().phase).toBe("disposed");
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ phase: "disposed" }));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(net.requests).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not loop when the content cannot be sent: too large", async () => {
    const { editor, net, stub, controller, status } = setup();
    const huge = doc("x".repeat(documentLimits.bytes + 10));
    editor.edit(huge);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(net.requests).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(stub.storage.writeDraft).toHaveBeenCalledTimes(1);
    expect(status()).toBe("attention");
    await controller.dispose();
  });

  it("publishes per boundary, never per keystroke", async () => {
    const { editor, controller, coordinator } = setup();
    const listener = vi.fn();
    coordinator.subscribe(listener);
    for (let i = 0; i < 50; i += 1) editor.edit(doc(`K ${i}`));
    expect(listener).toHaveBeenCalledTimes(1); // scheduled
    await vi.advanceTimersByTimeAsync(1500);
    // preparing, saving, idle.
    expect(listener.mock.calls.map(([state]) => state.phase)).toEqual([
      "scheduled",
      "preparing",
      "saving",
      "idle",
    ]);
    await controller.dispose();
  });
});

describe("the editor (a real v4 editor)", () => {
  let editors: Editor[] = [];
  afterEach(() => {
    for (const made of editors) if (!made.isDestroyed) made.destroy();
    editors = [];
  });

  function onEditor() {
    const editor = testEditorV4(
      documentV4([pointV4("p-1", "Grace", 1), proseV4("Mercy endures", 1)]),
    );
    editors.push(editor);
    const controller = createAutosaveController({
      owner,
      outlineId,
      revision: 8,
      source: editorSource(editor),
      storage: stubStorage([]).storage,
    });
    const net = fakeTransport([], "manual");
    const coordinator = createSaveCoordinator({
      controller,
      transport: net.transport,
      base: { content: canonical(editor.getJSON()), revision: 8 },
    });
    return { editor, controller, net, coordinator };
  }

  it("sends nothing for selection, focus, or view state", async () => {
    const { editor, net, controller } = onEditor();
    caret(editor, "p-1", 2);
    editor.commands.focus();
    editor.commands.blur();
    editor.commands.setPassagesExpanded(true);
    editor.commands.setPassagesCollapsedInPrint(true);
    editor.commands.setAllPointsFolded(true);
    editor.commands.setAllPointsFolded(false);
    editor.commands.setLayout("print");
    await vi.advanceTimersByTimeAsync(30_000);
    expect(net.requests).toHaveLength(0);
    await controller.dispose();
  });

  it("keeps typing, Undo, and Redo during a save for the next one, against the new revision", async () => {
    const { editor, net, controller, coordinator } = onEditor();
    caret(editor, "p-1", 0);
    editor.view.dispatch(editor.state.tr.insertText("Amazing "));
    await vi.advanceTimersByTimeAsync(1500);
    expect(net.requests).toHaveLength(1);
    const first = JSON.stringify(net.requests[0].content);
    expect(first).toContain("Amazing Grace");

    caret(editor, "p-1", 0);
    editor.view.dispatch(editor.state.tr.insertText("So "));
    await vi.advanceTimersByTimeAsync(400);
    expect(editor.commands.undo()).toBe(true);
    await vi.advanceTimersByTimeAsync(400);
    expect(editor.commands.redo()).toBe(true);
    await vi.advanceTimersByTimeAsync(5000);
    // Still one request: the first is in flight, and what it carries did not change.
    expect(net.requests).toHaveLength(1);
    expect(JSON.stringify(net.requests[0].content)).toBe(first);
    expect(coordinator.getState()).toMatchObject({ phase: "saving", due: true });

    net.answer();
    await settle();
    expect(net.requests).toHaveLength(2);
    expect(net.requests[1].expectedRevision).toBe(9);
    expect(JSON.stringify(net.requests[1].content)).toContain("So Amazing Grace");
    net.answer();
    await settle();
    expect(serverSaveStatus(controller.getState(), coordinator.getState())).toBe("saved");
    await controller.dispose();
  });
});

describe("the save boundary", () => {
  it("takes changes not yet in a snapshot when a save starts (saveNow)", async () => {
    const { editor, net, controller, coordinator } = setup();
    editor.edit(doc("Just typed"));
    await settle();
    expect(controller.getState()).toMatchObject({ changed: true, sequence: 0 });
    const state = await coordinator.saveNow();
    expect(net.requests).toHaveLength(1);
    expect(net.requests[0]).toMatchObject({ sequence: 1, content: doc("Just typed") });
    expect(state).toMatchObject({ phase: "idle", revision: 9 });
    await controller.dispose();
  });

  it("sends only once the snapshot's draft write has settled (write ahead)", async () => {
    const { editor, stub, net, log, controller, coordinator } = setup();
    const held = stub.holdNext();
    editor.edit(doc("Ordered"));
    await vi.advanceTimersByTimeAsync(1500);
    expect(coordinator.getState().phase).toBe("preparing");
    expect(net.requests).toHaveLength(0);
    held.release();
    await settle();
    expect(log.slice(0, 3)).toEqual(["write:1", "save:1@8", "clear:1"]);
    await controller.dispose();
  });

  it("still saves when the draft write failed, and then reports saved", async () => {
    const { editor, stub, net, controller, status } = setup();
    stub.failNext(new DraftStorageError("quota"));
    editor.edit(doc("Device full"));
    await vi.advanceTimersByTimeAsync(1500);
    expect(net.requests).toHaveLength(1);
    expect(controller.getState()).toMatchObject({ confirmedSequence: 1 });
    expect(status()).toBe("saved");
    await controller.dispose();
  });

  it("never puts an edit made during the flush into the snapshot being sent", async () => {
    const { editor, stub, net, controller, coordinator, status } = setup({ mode: "manual" });
    const held = stub.holdNext();
    editor.edit(doc("A"));
    const saving = coordinator.saveNow();
    await settle();
    expect(coordinator.getState().phase).toBe("preparing");
    // Typed while IndexedDB is busy: not yet a snapshot.
    editor.edit(doc("B"));
    held.release();
    await settle();
    expect(net.requests).toHaveLength(1);
    expect(net.requests[0]).toMatchObject({ sequence: 1, content: doc("A") });
    net.answer();
    await saving;
    expect(controller.getState()).toMatchObject({ confirmedSequence: 1, changed: true });
    expect(status()).not.toBe("saved");
    await vi.advanceTimersByTimeAsync(1500);
    expect(net.requests).toHaveLength(2);
    expect(net.requests[1]).toMatchObject({ expectedRevision: 9, content: doc("B") });
    net.answer();
    await settle();
    expect(status()).toBe("saved");
    await controller.dispose();
  });

  it("claims again when a draft write slipped in during the flush, sending the newer snapshot whole", async () => {
    const { editor, stub, net, controller, coordinator } = setup({ mode: "manual" });
    const held = stub.holdNext();
    editor.edit(doc("A"));
    void coordinator.saveNow();
    await settle();
    editor.edit(doc("B"));
    await vi.advanceTimersByTimeAsync(350); // the controller's own snapshot of B, queued behind A
    expect(controller.getState().sequence).toBe(2);
    held.release();
    await settle();
    expect(net.requests).toHaveLength(1);
    expect(net.requests[0]).toMatchObject({ sequence: 2, content: doc("B"), expectedRevision: 8 });
    net.answer();
    await settle();
    expect(controller.getState()).toMatchObject({ confirmedSequence: 2, revision: 9 });
    await controller.dispose();
  });

  it("keeps an edit made just after the claim for the next save", async () => {
    const { editor, net, controller } = setup({ mode: "manual" });
    editor.edit(doc("A"));
    await vi.advanceTimersByTimeAsync(1500);
    expect(net.requests).toHaveLength(1);
    editor.edit(doc("B"));
    await vi.advanceTimersByTimeAsync(400);
    expect(net.requests[0].content).toEqual(doc("A"));
    net.answer();
    await settle();
    await vi.advanceTimersByTimeAsync(1500);
    expect(net.requests).toHaveLength(2);
    expect(net.requests[1]).toMatchObject({ sequence: 2, content: doc("B"), expectedRevision: 9 });
    await controller.dispose();
  });

  it("never sends content that is not plain JSON, nor an older snapshot while it stands", async () => {
    const { editor, net, controller, status } = setup();
    editor.edit(doc("Safe"));
    await vi.advanceTimersByTimeAsync(1500);
    expect(net.requests).toHaveLength(1);
    editor.edit(doc("Pasted \u0000 nul"));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(net.requests).toHaveLength(1);
    expect(status()).toBe("unprotected");
    expect(JSON.stringify(net.requests)).not.toContain("\u0000");
    await controller.dispose();
  });

  it("does not send an older unsent snapshot while the editor holds refused content", async () => {
    const { editor, net, controller, status } = setup();
    editor.edit(doc("Kept on the device"));
    await vi.advanceTimersByTimeAsync(400); // snapshot 1, not yet sent
    expect(controller.getState()).toMatchObject({ sequence: 1, localSequence: 1 });
    editor.edit(doc("Pasted \u0000 nul"));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(net.requests).toHaveLength(0);
    expect(status()).toBe("unprotected");
    // Fixed: the next change is sent.
    editor.edit(doc("Pasted again, cleanly"));
    await vi.advanceTimersByTimeAsync(1500);
    expect(net.requests).toHaveLength(1);
    expect(net.requests[0].content).toEqual(doc("Pasted again, cleanly"));
    await controller.dispose();
  });

  it("never sends what the server's canonical function refuses, records it, and resumes with a valid edit (A2.3B.2B.3)", async () => {
    const { editor, net, controller, coordinator, status, log } = setup();
    editor.edit({ type: "doc", content: [{ type: "no_such_node" }] });
    await vi.advanceTimersByTimeAsync(1500);
    expect(net.requests).toHaveLength(0);
    expect(coordinator.getState()).toMatchObject({
      phase: "blocked",
      block: { reason: "refused", origin: "local" },
      outcome: { kind: "refused", code: "invalid", sequence: 1 },
    });
    expect(controller.getState().saving).toBeNull();
    expect(status()).toBe("blocked");
    await settle();
    expect(log).toContain("refuse:1:invalid");
    expect(controller.getState().refusalRecord).toMatchObject({
      sequence: 1,
      code: "invalid",
      status: "recorded",
    });
    editor.edit(doc("Fixed"));
    await vi.advanceTimersByTimeAsync(1500);
    expect(net.requests).toHaveLength(1);
    expect(net.requests[0]).toMatchObject({
      sequence: 2,
      expectedRevision: 8,
      content: doc("Fixed"),
    });
    expect(coordinator.getState()).toMatchObject({ phase: "idle", block: null, revision: 9 });
    expect(status()).toBe("saved");
    await controller.dispose();
  });
});

describe("one request at a time", () => {
  it("never has two requests in flight, keeps edits for the next, and never sends a sequence twice", async () => {
    // The request is held for 30 s: past the default save timeout (A2.3B.2C, tested apart).
    const { editor, net, controller, coordinator } = setup({
      mode: "manual",
      recovery: { saveTimeoutMs: 60_000 },
    });
    editor.edit(doc("First"));
    await vi.advanceTimersByTimeAsync(1500);
    expect(coordinator.getState()).toMatchObject({
      phase: "saving",
      submission: { sequence: 1, expectedRevision: 8 },
    });
    for (let i = 0; i < 60; i += 1) {
      editor.edit(doc(`During ${i}`));
      await vi.advanceTimersByTimeAsync(500);
    }
    // Asking to save now while one is in flight only makes the next one due.
    void coordinator.saveNow();
    await settle();
    expect(net.requests).toHaveLength(1);
    expect(net.maxInFlight).toBe(1);
    expect(coordinator.getState().due).toBe(true);
    net.answer();
    await settle();
    expect(net.requests).toHaveLength(2);
    expect(net.requests[1]).toMatchObject({ expectedRevision: 9, content: doc("During 59") });
    net.answer();
    await settle();
    const sequences = net.requests.map((request) => request.sequence);
    expect(new Set(sequences).size).toBe(sequences.length);
    expect(net.maxInFlight).toBe(1);
    await controller.dispose();
  });

  it("confirms 41 at 9 against 8 and sends 42 against 9 (the brief's example)", async () => {
    const { editor, net, controller, coordinator, status } = setup({ mode: "manual", revision: 8 });
    editor.edit(doc("Sequence one"));
    await vi.advanceTimersByTimeAsync(1500);
    expect(net.requests[0]).toMatchObject({ sequence: 1, expectedRevision: 8 });
    editor.edit(doc("Sequence two"));
    await vi.advanceTimersByTimeAsync(400);
    expect(controller.getState().sequence).toBe(2);
    net.answer(); // revision 9 for sequence 1
    await settle();
    expect(controller.getState()).toMatchObject({ confirmedSequence: 1, revision: 9, sequence: 2 });
    expect(coordinator.getState()).toMatchObject({ revision: 9, confirmedSequence: 1 });
    expect(status()).not.toBe("saved");
    await vi.advanceTimersByTimeAsync(1500);
    expect(net.requests[1]).toMatchObject({ sequence: 2, expectedRevision: 9 });
    net.answer();
    await settle();
    expect(coordinator.getState().revision).toBe(10);
    expect(status()).toBe("saved");
    await controller.dispose();
  });

  it("sends again the words of a confirmed save when an edit returns to them (one write, always correct)", async () => {
    const { editor, net, controller } = setup({ mode: "manual" });
    editor.edit(doc("A"));
    await vi.advanceTimersByTimeAsync(1500);
    editor.edit(doc("B"));
    await vi.advanceTimersByTimeAsync(400);
    editor.edit(doc("A")); // undone to what is in flight
    await vi.advanceTimersByTimeAsync(400);
    net.answer();
    await settle();
    await vi.advanceTimersByTimeAsync(1500);
    expect(net.requests).toHaveLength(2);
    expect(net.requests[1]).toMatchObject({ sequence: 3, content: doc("A"), expectedRevision: 9 });
    net.answer();
    await settle();
    await controller.dispose();
  });
});

describe("the authoritative base", () => {
  it("starts from the server's document and revision, and refuses a mismatch", () => {
    const { controller } = setup({ revision: 8 });
    const transport = fakeTransport([], "auto").transport;
    expect(() =>
      createSaveCoordinator({
        controller,
        transport,
        base: { content: canonical(doc("Opened")), revision: 7 },
      }),
    ).toThrow(SaveCoordinatorError);
    expect(() =>
      createSaveCoordinator({
        controller,
        transport,
        base: { content: { type: "paragraph" }, revision: 8 },
      }),
    ).toThrow(expect.objectContaining({ kind: "base" }));
    const made = createSaveCoordinator({
      controller,
      transport,
      base: { content: canonical(doc("Opened")), revision: 8 },
    });
    expect(made.getState()).toMatchObject({
      phase: "idle",
      revision: 8,
      base: { revision: 8, provenance: "server", canonical: true },
      submission: null,
    });
  });

  it("refuses a disposed controller", async () => {
    const { controller } = setup();
    await controller.dispose();
    expect(() =>
      createSaveCoordinator({
        controller,
        transport: fakeTransport([], "auto").transport,
        base: { content: canonical(doc("Opened")), revision: 8 },
      }),
    ).toThrow(expect.objectContaining({ kind: "disposed" }));
  });

  it("refuses a controller whose claim is still held: an unresolved save is never forgotten by starting again", async () => {
    const { editor, net, controller, coordinator } = setup({ mode: "manual" });
    editor.edit(doc("In flight"));
    await vi.advanceTimersByTimeAsync(1500);
    net.reject(new TypeError("offline"));
    await settle();
    expect(coordinator.getState().phase).toBe("reconciling");
    coordinator.dispose();
    expect(controller.getState().saving).toBe(1);
    expect(() =>
      createSaveCoordinator({
        controller,
        transport: fakeTransport([], "auto").transport,
        base: { content: canonical(doc("Opened")), revision: 8 },
      }),
    ).toThrow(expect.objectContaining({ kind: "claimed" }));
    await controller.dispose();
  });

  it("says when the base it was given is not in canonical form", async () => {
    const v3 = Object.values(documentFixtures)[0] as JSONContent;
    const { controller } = setup({ initial: v3 });
    const made = createSaveCoordinator({
      controller,
      transport: fakeTransport([], "auto").transport,
      base: { content: v3, revision: 8 },
    });
    expect(made.getState().base).toMatchObject({ provenance: "server", canonical: false });
    expect(made.getBase().content).toBe(v3);
    await controller.dispose();
  });

  it("keeps sent and authoritative content apart, and moves the base only to the confirmed canonical form", async () => {
    const words = "La gracia — ¿Por qué? «Sí», Señor 🙏🏽 👨‍👩‍👧 ñáéíóú";
    const { editor, net, controller, coordinator } = setup({ mode: "manual" });
    const opened = coordinator.getBase();
    editor.edit(doc(words));
    await vi.advanceTimersByTimeAsync(1500);
    const submission = coordinator.getSubmission();
    expect(submission?.content).toBe(net.requests[0].content);
    expect(JSON.stringify(submission?.content)).toContain(words);
    expect(coordinator.getBase()).toBe(opened); // not yet confirmed
    net.answer();
    await settle();
    const base = coordinator.getBase();
    expect(base.revision).toBe(9);
    expect(base.content).not.toBe(net.requests[0].content);
    expect(equal(base.content, canonical(doc(words)))).toBe(true);
    expect(JSON.stringify(base.content)).toContain(words);
    expect(coordinator.getState().base).toEqual({
      revision: 9,
      provenance: "confirmed",
      canonical: true,
    });
    expect(coordinator.getSubmission()).toBeNull();
    await controller.dispose();
  });
});

describe("outcomes", () => {
  async function inFlight(options: SetupOptions = {}) {
    const parts = setup({ mode: "manual", ...options });
    parts.editor.edit(doc("Sent"));
    await vi.advanceTimersByTimeAsync(1500);
    expect(parts.net.requests).toHaveLength(1);
    return parts;
  }

  /** Edits and lets time pass; nothing should be sent. */
  async function keepEditing(parts: Awaited<ReturnType<typeof inFlight>>) {
    for (let i = 0; i < 20; i += 1) {
      parts.editor.edit(doc(`After ${i}`));
      await vi.advanceTimersByTimeAsync(1000);
    }
    await vi.advanceTimersByTimeAsync(30_000);
    await parts.coordinator.saveNow();
  }

  it.each([
    [
      "no revision",
      (r: DocumentSaveRequest) => ({
        kind: "confirmed",
        sequence: r.sequence,
        revision: Number.NaN,
      }),
    ],
    [
      "the same revision",
      (r: DocumentSaveRequest) => ({
        kind: "confirmed",
        sequence: r.sequence,
        revision: r.expectedRevision,
      }),
    ],
    [
      "an older revision",
      (r: DocumentSaveRequest) => ({
        kind: "confirmed",
        sequence: r.sequence,
        revision: r.expectedRevision - 1,
      }),
    ],
    [
      "two revisions on",
      (r: DocumentSaveRequest) => ({
        kind: "confirmed",
        sequence: r.sequence,
        revision: r.expectedRevision + 2,
      }),
    ],
  ])("confirms nothing on success with %s, and sends nothing more", async (_name, outcome) => {
    const parts = await inFlight();
    parts.net.answer(outcome as (r: DocumentSaveRequest) => DocumentSaveOutcome);
    await settle();
    expect(parts.coordinator.getState()).toMatchObject({
      phase: "reconciling",
      revision: 8,
      block: { reason: "unexpected_revision" },
      submission: { sequence: 1, expectedRevision: 8 },
    });
    expect(parts.controller.getState()).toMatchObject({
      confirmedSequence: 0,
      revision: 8,
      saving: 1,
    });
    await keepEditing(parts);
    expect(parts.net.requests).toHaveLength(1);
    // Read once (B.2B.1), then five more times by itself (A2.3B.2C); the stand-in's
    // read fails each time, so it stays held, and the retries are spent: never a write.
    expect(parts.net.reads).toBe(1 + 5);
    expect(parts.coordinator.getState().reconciliation).toMatchObject({ result: "failed" });
    expect(parts.coordinator.getState().recovery).toMatchObject({ status: "exhausted" });
    expect(parts.status()).toBe("stalled");
    await parts.controller.dispose();
  });

  it("never lets an answer for another sequence confirm anything", async () => {
    const parts = await inFlight();
    parts.net.answer((r) => ({
      kind: "confirmed",
      sequence: 99,
      revision: r.expectedRevision + 1,
    }));
    await settle();
    expect(parts.coordinator.getState()).toMatchObject({
      phase: "reconciling",
      block: { reason: "uncertain" },
    });
    expect(parts.controller.getState().confirmedSequence).toBe(0);
    await keepEditing(parts);
    expect(parts.net.requests).toHaveLength(1);
    await parts.controller.dispose();
  });

  it("holds the claim and sends nothing more after a request that threw or got no answer", async () => {
    for (const fail of [
      (net: ReturnType<typeof fakeTransport>) => net.reject(new TypeError("Failed to fetch")),
      (net: ReturnType<typeof fakeTransport>) =>
        net.answer((r) => ({ kind: "failed", sequence: r.sequence, uncertain: true })),
    ]) {
      const parts = await inFlight();
      fail(parts.net);
      await settle();
      expect(parts.coordinator.getState()).toMatchObject({
        phase: "reconciling",
        block: { reason: "uncertain", origin: "server" },
        submission: { sequence: 1, expectedRevision: 8 },
      });
      expect(parts.coordinator.getSubmission()?.content).toEqual(doc("Sent"));
      expect(parts.controller.getState().saving).toBe(1);
      expect(parts.controller.claimSave()).toBeNull();
      await keepEditing(parts);
      await parts.coordinator.retry();
      expect(parts.net.requests).toHaveLength(1);
      // The first read and five automatic ones (A2.3B.2C), all failed: reads, never a write.
      expect(parts.net.reads).toBe(1 + 5);
      // The newer words are still kept on the device.
      expect(parts.controller.getState().localSequence).toBeGreaterThan(1);
      expect(parts.controller.getState().saving).toBe(1);
      expect(parts.status()).toBe("stalled");
      await parts.controller.dispose();
    }
  });

  it("an uncertain answer through the real transport (success without a revision) blocks too", async () => {
    const actions = {
      save: vi.fn(async () => ({ ok: true, message: "Saved" })),
      read: vi.fn(),
    };
    const parts = setup({ transport: realTransport(actions) });
    parts.editor.edit(doc("Sent"));
    await vi.advanceTimersByTimeAsync(1500);
    expect(parts.coordinator.getState().phase).toBe("reconciling");
    await keepEditing(parts as unknown as Awaited<ReturnType<typeof inFlight>>);
    expect(actions.save).toHaveBeenCalledTimes(1);
    await parts.controller.dispose();
  });

  it.each([
    ["a stale conflict", { kind: "conflict", code: "stale", revision: 12 }, "conflict"],
    ["a missing document", { kind: "conflict", code: "missing" }, "conflict"],
    ["an ended session", { kind: "unauthorized" }, "unauthorized"],
  ])("stops for %s, keeps the work, and never asks again", async (_name, answer, reason) => {
    const parts = await inFlight();
    parts.net.answer((r) => ({ ...answer, sequence: r.sequence }) as DocumentSaveOutcome);
    await settle();
    expect(parts.coordinator.getState()).toMatchObject({
      phase: "blocked",
      revision: 8, // never the conflict's revision: B.2B reads and decides
      block: { reason, origin: "server" },
      // Nothing was written: no submission is left unresolved, and the answer says which refusal.
      submission: null,
      outcome: { kind: (answer as { kind: string }).kind },
    });
    expect(parts.coordinator.getSubmission()).toBeNull();
    expect(parts.controller.getState()).toMatchObject({
      confirmedSequence: 0,
      revision: 8,
      saving: null,
    });
    await keepEditing(parts);
    await parts.coordinator.retry();
    expect(parts.net.requests).toHaveLength(1);
    expect(parts.status()).toBe("blocked");
    expect(parts.controller.getState().localSequence).toBeGreaterThan(1);
    await parts.controller.dispose();
  });

  it.each([
    ["an invalid refusal", { kind: "refused", code: "invalid", problems: [] }],
    ["a too_large refusal", { kind: "refused", code: "too_large", bytes: 5, limit: 4 }],
  ])(
    "stops for %s, keeps the work, and sends the next new snapshot (A2.3B.2B.3)",
    async (_name, answer) => {
      const parts = await inFlight();
      parts.net.answer((r) => ({ ...answer, sequence: r.sequence }) as DocumentSaveOutcome);
      await settle();
      expect(parts.coordinator.getState()).toMatchObject({
        phase: "blocked",
        revision: 8,
        block: { reason: "refused", origin: "server" },
        submission: null,
        outcome: { kind: "refused" },
      });
      expect(parts.controller.getState()).toMatchObject({ saving: null, confirmedSequence: 0 });
      // Nothing new: nothing sent, however long, however asked.
      await vi.advanceTimersByTimeAsync(30_000);
      await parts.coordinator.saveNow();
      await parts.coordinator.retry();
      expect(parts.net.requests).toHaveLength(1);
      expect(parts.status()).toBe("blocked");
      // A newer snapshot is sent as usual, against the same revision.
      parts.editor.edit(doc("Corrected"));
      await vi.advanceTimersByTimeAsync(1500);
      expect(parts.net.requests).toHaveLength(2);
      expect(parts.net.requests[1]).toMatchObject({
        sequence: 2,
        expectedRevision: 8,
        content: doc("Corrected"),
      });
      expect(parts.coordinator.getState()).toMatchObject({ phase: "saving", block: null });
      parts.net.answer();
      await settle();
      expect(parts.status()).toBe("saved");
      await parts.controller.dispose();
    },
  );

  it("a confirmation the controller will not take is unresolved, not blocked: the server wrote it", async () => {
    const parts = await inFlight();
    // Something else released the claim while the request was in flight.
    expect(parts.controller.releaseSave(1)).toBe(true);
    parts.net.answer();
    await settle();
    expect(parts.coordinator.getState()).toMatchObject({
      phase: "reconciling",
      revision: 8,
      block: { reason: "rejected_confirmation", origin: "local" },
      submission: { sequence: 1, expectedRevision: 8 },
      outcome: { kind: "confirmed", sequence: 1, revision: 9 },
    });
    expect(parts.controller.getState().confirmedSequence).toBe(0);
    await keepEditing(parts);
    expect(parts.net.requests).toHaveLength(1);
    // Its reads failed and were retried until spent (A2.3B.2C): still held, never written.
    expect(parts.coordinator.getState().submission).toMatchObject({ sequence: 1 });
    expect(parts.controller.getState().confirmedSequence).toBe(0);
    expect(parts.status()).toBe("stalled");
    await parts.controller.dispose();
  });

  it("after a failure that wrote nothing, tries again by itself after 1 s, or at once on retry()", async () => {
    const parts = await inFlight();
    parts.net.answer((r) => ({ kind: "failed", sequence: r.sequence, uncertain: false }));
    await settle();
    expect(parts.coordinator.getState()).toMatchObject({
      phase: "failed",
      block: null,
      submission: null,
      recovery: { kind: "save", retries: 0, status: "scheduled", delayMs: 1000 },
    });
    expect(parts.controller.getState().saving).toBeNull();
    expect(parts.status()).toBe("failed");
    parts.editor.edit(doc("Newer"));
    await vi.advanceTimersByTimeAsync(999);
    expect(parts.net.requests).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    // The automatic attempt (A2.3B.2C) claims the newest snapshot, against the same revision.
    expect(parts.net.requests).toHaveLength(2);
    expect(parts.net.requests[1]).toMatchObject({ expectedRevision: 8, content: doc("Newer") });
    expect(parts.coordinator.getState().recovery).toMatchObject({ retries: 1, status: "running" });
    parts.net.answer((r) => ({ kind: "failed", sequence: r.sequence, uncertain: false }));
    await settle();
    expect(parts.coordinator.getState().recovery).toMatchObject({
      retries: 1,
      status: "scheduled",
      delayMs: 2000,
    });
    // retry() goes now, and gives back no attempts.
    const retried = parts.coordinator.retry();
    await settle();
    expect(parts.net.requests).toHaveLength(3);
    parts.net.answer();
    await retried;
    expect(parts.coordinator.getState()).toMatchObject({
      phase: "idle",
      revision: 9,
      recovery: null,
    });
    expect(parts.status()).toBe("saved");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(parts.net.requests).toHaveLength(3);
    await parts.controller.dispose();
  });
});

describe("disposal during a request", () => {
  it("takes a late confirmation for its own session and schedules nothing", async () => {
    const { editor, net, controller, coordinator, log } = setup({ mode: "manual" });
    editor.edit(doc("In flight"));
    await vi.advanceTimersByTimeAsync(1500);
    coordinator.dispose();
    editor.edit(doc("After dispose"));
    await vi.advanceTimersByTimeAsync(30_000);
    net.answer();
    await settle();
    expect(controller.getState()).toMatchObject({ confirmedSequence: 1, revision: 9 });
    expect(log).toContain("clear:1");
    await vi.advanceTimersByTimeAsync(30_000);
    expect(net.requests).toHaveLength(1);
    expect(coordinator.getState().phase).toBe("disposed");
    await controller.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("an unresolved request after dispose stays unresolved and starts nothing", async () => {
    const { editor, net, controller, coordinator } = setup({ mode: "manual" });
    editor.edit(doc("In flight"));
    await vi.advanceTimersByTimeAsync(1500);
    coordinator.dispose();
    net.reject(new TypeError("offline"));
    await settle();
    expect(coordinator.getState()).toMatchObject({
      phase: "disposed",
      block: { reason: "uncertain" },
      submission: { sequence: 1 },
    });
    expect(controller.getState()).toMatchObject({ confirmedSequence: 0, saving: 1 });
    await coordinator.saveNow();
    await coordinator.retry();
    await coordinator.reconcile();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(net.requests).toHaveLength(1);
    // Disposed before the answer: no read is started.
    expect(net.reads).toBe(0);
    await controller.dispose();
  });

  it("releases a claim it made while being disposed, without sending it", async () => {
    const { editor, stub, net, controller, coordinator } = setup({ mode: "manual" });
    const held = stub.holdNext();
    editor.edit(doc("Held"));
    void coordinator.saveNow();
    await settle();
    coordinator.dispose();
    held.release();
    await settle();
    expect(net.requests).toHaveLength(0);
    expect(controller.getState().saving).toBeNull();
    await controller.dispose();
  });
});

describe("reconciliation (A2.3B.2B.1)", () => {
  // R0 is 8. What was sent is doc("Sent") (S); the base is doc("Opened") (B0).
  const sent = () => canonical(doc("Sent"));
  const opened = () => canonical(doc("Opened"));
  /** A fresh plain copy, as a read from the server gives. */
  const found = (content: JSONContent, revision: number): DocumentReadOutcome => ({
    kind: "found",
    content: JSON.parse(JSON.stringify(content)) as JSONContent,
    revision,
  });

  /** A save sent against 8 that got no answer; its automatic read is left waiting. */
  async function unanswered(options: SetupOptions & { words?: string } = {}) {
    const parts = setup({ mode: "manual", ...options });
    parts.net.holdReads();
    parts.editor.edit(doc(options.words ?? "Sent"));
    await vi.advanceTimersByTimeAsync(1500);
    expect(parts.net.requests).toHaveLength(1);
    parts.net.reject(new TypeError("Failed to fetch"));
    await settle();
    expect(parts.coordinator.getState()).toMatchObject({
      phase: "reconciling",
      reading: true,
      block: { reason: "uncertain", origin: "server" },
      submission: { sequence: 1, expectedRevision: 8 },
    });
    expect(parts.net.reads).toBe(1);
    return parts;
  }
  type Parts = Awaited<ReturnType<typeof unanswered>>;

  async function read(parts: Parts, outcome: DocumentReadOutcome) {
    parts.net.answerRead(outcome);
    await settle();
  }

  /**
   * Edits and lets time pass: nothing is sent, and nothing more is read
   * (`reads`; null where A2.3B.2C's automatic reads follow, which never write).
   */
  async function nothingMore(parts: Parts, reads: number | null = 1, requests = 1) {
    for (let i = 0; i < 5; i += 1) {
      parts.editor.edit(doc(`Later ${i}`));
      await vi.advanceTimersByTimeAsync(2000);
    }
    await vi.advanceTimersByTimeAsync(60_000);
    await parts.coordinator.saveNow();
    await parts.coordinator.retry();
    await parts.coordinator.retryUnchanged();
    expect(parts.net.requests).toHaveLength(requests);
    if (reads !== null) expect(parts.net.reads).toBe(reads);
  }

  /** Still unknown: the claim, the submission, and revision 8 stay; nothing confirmed. */
  function expectHeld(parts: Parts, reconciliation: Record<string, unknown>, requests = 1) {
    expect(parts.coordinator.getState()).toMatchObject({
      phase: "reconciling",
      revision: 8,
      reading: false,
      confirmedSequence: 0,
      submission: { sequence: 1, expectedRevision: 8 },
      block: { reason: "uncertain", origin: "server" },
      outcome: { kind: "failed", uncertain: true },
      reconciliation: { sequence: 1, ...reconciliation },
    });
    expect(parts.coordinator.getSubmission()?.content).toEqual(doc("Sent"));
    expect(parts.controller.getState()).toMatchObject({
      confirmedSequence: 0,
      revision: 8,
      saving: 1,
    });
    expect(parts.controller.claimSave()).toBeNull();
    expect(parts.coordinator.getBase().revision).toBe(8);
    expect(parts.net.requests).toHaveLength(requests);
    expect(parts.status()).toBe("unresolved");
  }

  /** Can never be written now: released and blocked as a conflict; nothing confirmed. */
  function expectReleased(parts: Parts, reconciliation: Record<string, unknown>) {
    expect(parts.coordinator.getState()).toMatchObject({
      phase: "blocked",
      revision: 8,
      reading: false,
      confirmedSequence: 0,
      submission: null,
      block: { reason: "conflict", origin: "server" },
      outcome: { kind: "failed", uncertain: true },
      reconciliation: { sequence: 1, ...reconciliation },
    });
    expect(parts.coordinator.getSubmission()).toBeNull();
    expect(parts.controller.getState()).toMatchObject({
      confirmedSequence: 0,
      revision: 8,
      saving: null,
    });
    expect(parts.coordinator.getBase().revision).toBe(8);
    expect(parts.status()).toBe("blocked");
  }

  it("A: a lost answer to a save that was taken, read at R0 + 1 with what was sent, is settled", async () => {
    const parts = await unanswered();
    const listener = vi.fn();
    parts.coordinator.subscribe(listener);
    await read(parts, found(sent(), 9));
    expect(parts.coordinator.getState()).toMatchObject({
      phase: "idle",
      revision: 9,
      reading: false,
      confirmedSequence: 1,
      submission: null,
      block: null,
      // A read never becomes a `confirmed` answer.
      outcome: { kind: "failed", uncertain: true },
      reconciliation: {
        sequence: 1,
        result: "saved",
        revision: 9,
        submitted: "exact",
        base: null,
        equivalent: false,
      },
      base: { revision: 9, provenance: "server", canonical: true },
    });
    expect(parts.controller.getState()).toMatchObject({
      confirmedSequence: 1,
      revision: 9,
      saving: null,
    });
    expect(equal(parts.coordinator.getBase().content, sent())).toBe(true);
    expect(parts.log).toContain("clear:1");
    expect(parts.status()).toBe("saved");
    expect(listener.mock.calls.map(([state]) => state.phase)).toEqual(["idle"]);
    // Nothing written by the reconciliation, nothing read again.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(parts.net.requests).toHaveLength(1);
    expect(parts.net.reads).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
    await parts.controller.dispose();
  });

  it("A, then the next save names the read revision; newer edits are kept and never confirmed by the read", async () => {
    const parts = await unanswered();
    parts.editor.edit(doc("Newer"));
    await vi.advanceTimersByTimeAsync(5000);
    expect(parts.net.requests).toHaveLength(1);
    expect(parts.controller.getState().sequence).toBe(2);
    await read(parts, found(sent(), 9));
    expect(parts.controller.getState()).toMatchObject({
      confirmedSequence: 1,
      sequence: 2,
      revision: 9,
    });
    expect(parts.coordinator.getState()).toMatchObject({
      phase: "scheduled",
      confirmedSequence: 1,
    });
    expect(parts.status()).not.toBe("saved");
    await vi.advanceTimersByTimeAsync(1500);
    expect(parts.net.requests).toHaveLength(2);
    expect(parts.net.requests[1]).toMatchObject({
      sequence: 2,
      expectedRevision: 9,
      content: doc("Newer"),
    });
    // A new submission clears the last reconciliation, and names the base it was made against.
    expect(parts.coordinator.getState().reconciliation).toBeNull();
    expect(parts.coordinator.getSubmission()?.base.revision).toBe(9);
    expect(equal(parts.coordinator.getSubmission()?.base.content, sent())).toBe(true);
    parts.net.answer();
    await settle();
    expect(parts.coordinator.getState()).toMatchObject({ phase: "idle", revision: 10 });
    expect(parts.status()).toBe("saved");
    await parts.controller.dispose();
  });

  it("C: the base still there at R0 is sent once more as it was (A2.3B.2B.2), and never a third time", async () => {
    const parts = await unanswered();
    await read(parts, found(opened(), 8));
    // The one conditional retry: the same request, under the same claim.
    expect(parts.net.requests).toHaveLength(2);
    expect(parts.net.requests[1]).toEqual(parts.net.requests[0]);
    expect(parts.coordinator.getState()).toMatchObject({
      phase: "reconciling",
      retrying: true,
      reading: false,
      submission: { sequence: 1, expectedRevision: 8, attempts: 2 },
      reconciliation: { result: "unchanged" },
    });
    // No answer to it either: read back once, and the base is still there.
    parts.net.reject(new TypeError("Failed to fetch"));
    await settle();
    expect(parts.net.reads).toBe(2);
    await read(parts, found(opened(), 8));
    expectHeld(
      parts,
      {
        result: "unchanged",
        revision: 8,
        submitted: "different",
        base: "exact",
        equivalent: false,
      },
      2,
    );
    expect(parts.coordinator.getState()).toMatchObject({
      retrying: false,
      submission: { attempts: 2 },
    });
    // The retry is spent: A2.3B.2C reads again by itself (held reads time out), never a third save.
    await nothingMore(parts, null, 2);
    expect(parts.net.reads).toBeGreaterThan(2);
    await parts.controller.dispose();
  });

  it("B: what was sent says what the base says, at R0: held, not settled (the request may still move the revision)", async () => {
    const parts = setup({ mode: "manual" });
    parts.net.holdReads();
    // An edit away and back: a snapshot equal to the base, sent.
    parts.editor.edit(doc("Away"));
    await vi.advanceTimersByTimeAsync(400);
    parts.editor.edit(doc("Opened"));
    await vi.advanceTimersByTimeAsync(1500);
    expect(parts.net.requests).toHaveLength(1);
    expect(parts.net.requests[0]).toMatchObject({ sequence: 2, content: doc("Opened") });
    parts.net.reject(new TypeError("offline"));
    await settle();
    parts.net.answerRead(found(opened(), 8));
    await settle();
    expect(parts.coordinator.getState()).toMatchObject({
      phase: "reconciling",
      revision: 8,
      confirmedSequence: 0,
      submission: { sequence: 2, expectedRevision: 8 },
      reconciliation: {
        sequence: 2,
        result: "unchanged",
        revision: 8,
        submitted: "exact",
        base: "exact",
        equivalent: true,
      },
    });
    expect(parts.controller.getState()).toMatchObject({
      confirmedSequence: 0,
      revision: 8,
      saving: 2,
    });
    // Settled only by the retry's own confirmation, never by the read at R0.
    expect(parts.net.requests).toHaveLength(2);
    expect(parts.net.requests[1]).toMatchObject({ sequence: 2, expectedRevision: 8 });
    parts.net.answer();
    await settle();
    expect(parts.coordinator.getState()).toMatchObject({
      phase: "idle",
      revision: 9,
      confirmedSequence: 2,
      outcome: { kind: "confirmed", sequence: 2, revision: 9 },
    });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(parts.net.requests).toHaveLength(2);
    expect(parts.net.reads).toBe(1);
    await parts.controller.dispose();
  });

  it("D: R0 + 1 with other content is a conflict: released, blocked, the draft kept", async () => {
    const parts = await unanswered();
    await read(parts, found(canonical(doc("Someone else")), 9));
    expectReleased(parts, { result: "conflict", revision: 9, submitted: "different" });
    // The recovery draft of what was sent stays: nothing confirmed or cleared it.
    expect(parts.log).toContain("write:1");
    expect(parts.log.some((entry) => entry.startsWith("clear:"))).toBe(false);
    expect(parts.stub.storage.confirmDraft).not.toHaveBeenCalled();
    await nothingMore(parts);
    expect(parts.controller.getState().localSequence).toBeGreaterThan(1);
    await parts.controller.dispose();
  });

  it.each([
    ["with what was sent", () => canonical(doc("Sent")), "exact"],
    ["with other content", () => canonical(doc("Elsewhere")), "different"],
  ])(
    "F: a jump of more than one revision, %s, is a conflict, never the single expected save",
    async (_name, content, submitted) => {
      const parts = await unanswered();
      await read(parts, found(content(), 10));
      expectReleased(parts, { result: "conflict", revision: 10, submitted });
      await nothingMore(parts);
      await parts.controller.dispose();
    },
  );

  it("E: other content at R0 is held as diverged (the request may still be written)", async () => {
    const parts = await unanswered();
    await read(parts, found(canonical(doc("Unexpected")), 8));
    expectHeld(parts, {
      result: "diverged",
      revision: 8,
      submitted: "different",
      base: "different",
    });
    await nothingMore(parts);
    await parts.controller.dispose();
  });

  it("E: what was sent, at R0 but not the base, is held as diverged: a write always moves the revision", async () => {
    const parts = await unanswered();
    await read(parts, found(sent(), 8));
    expectHeld(parts, { result: "diverged", revision: 8, submitted: "exact", base: "different" });
    await parts.controller.dispose();
  });

  it("F: a revision below R0 is held as diverged, even with what was sent", async () => {
    const parts = await unanswered();
    await read(parts, found(sent(), 7));
    expectHeld(parts, { result: "diverged", revision: 7, submitted: null, base: null });
    await nothingMore(parts);
    await parts.controller.dispose();
  });

  it("G: a missing document is released and blocked; nothing is created or converted", async () => {
    const parts = await unanswered();
    await read(parts, { kind: "missing" });
    expectReleased(parts, { result: "missing", revision: null });
    await nothingMore(parts);
    await parts.controller.dispose();
  });

  it.each([
    [8, "held"],
    [undefined, "held"],
    [9, "released"],
  ])("H: an unreadable document at %s is %s, never repaired", async (stored, how) => {
    const parts = await unanswered();
    await read(parts, { kind: "unreadable", revision: stored });
    const expected = { result: "unreadable", revision: stored ?? null };
    if (how === "held") expectHeld(parts, expected);
    else expectReleased(parts, expected);
    // The answer carries no content, and none is reported.
    expect(JSON.stringify(parts.coordinator.getState())).not.toContain("Sent");
    await nothingMore(parts);
    await parts.controller.dispose();
  });

  it("J: an account that may not read is blocked with the claim still held, and is not read again", async () => {
    const parts = await unanswered();
    await read(parts, { kind: "unauthorized" });
    expect(parts.coordinator.getState()).toMatchObject({
      phase: "blocked",
      revision: 8,
      block: { reason: "unauthorized", origin: "server" },
      submission: { sequence: 1, expectedRevision: 8 },
      reconciliation: { sequence: 1, result: "unauthorized" },
    });
    expect(parts.controller.getState()).toMatchObject({ saving: 1, confirmedSequence: 0 });
    await parts.coordinator.reconcile();
    await nothingMore(parts);
    expect(parts.status()).toBe("blocked");
    await parts.controller.dispose();
  });

  it("I: a failed read stays held and is read again by itself after 1 s (A2.3B.2C), never written", async () => {
    const parts = await unanswered();
    await read(parts, { kind: "failed" });
    expectHeld(parts, { result: "failed", revision: null });
    expect(parts.coordinator.getState().recovery).toMatchObject({
      kind: "read",
      retries: 0,
      limit: 5,
      status: "scheduled",
      delayMs: 1000,
    });
    await vi.advanceTimersByTimeAsync(999);
    expect(parts.net.reads).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(parts.net.reads).toBe(2);
    expect(parts.coordinator.getState()).toMatchObject({
      reading: true,
      recovery: { retries: 1, status: "running" },
    });
    expect(parts.net.requests).toHaveLength(1);
    parts.net.answerRead(found(opened(), 8));
    await settle();
    // Unchanged: the one conditional retry, then its read back, as B.2B.2 does.
    expect(parts.net.requests).toHaveLength(2);
    parts.net.reject(new TypeError("offline"));
    await settle();
    parts.net.answerRead({ kind: "failed" });
    await settle();
    expect(parts.coordinator.getState()).toMatchObject({
      phase: "reconciling",
      reading: false,
      retrying: false,
      reconciliation: { result: "failed" },
      submission: { attempts: 2 },
      // The same episode: its count goes on, and the next read waits 2 s.
      recovery: { retries: 1, status: "scheduled", delayMs: 2000 },
    });
    expect(parts.net.reads).toBe(3);
    await parts.controller.dispose();
  });

  it("I: a transport that throws is a failed read, never a rejection", async () => {
    const parts = await unanswered();
    await read(parts, { kind: "failed" });
    (parts.net.transport.read as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error("boom");
    });
    await expect(parts.coordinator.reconcile()).resolves.toMatchObject({
      phase: "reconciling",
      reading: false,
      reconciliation: { result: "failed" },
    });
    expect(parts.net.reads).toBe(2);
    // Not stuck: the next call reads again.
    void parts.coordinator.reconcile();
    await settle();
    expect(parts.net.reads).toBe(3);
    await parts.controller.dispose();
  });

  it.each([
    ["no revision", { kind: "found", content: "doc", revision: Number.NaN }],
    ["a negative revision", { kind: "found", content: "doc", revision: -1 }],
    ["a fractional revision", { kind: "found", content: "doc", revision: 8.5 }],
    ["content that is not a document", { kind: "found", content: [], revision: 9 }],
    ["no content", { kind: "found", content: null, revision: 9 }],
    ["an unknown answer", { kind: "teapot" }],
    ["nothing", null],
  ])("a malformed read (%s) confirms nothing and is held", async (_name, answer) => {
    const parts = await unanswered();
    const outcome =
      answer && "content" in answer && answer.content === "doc"
        ? { ...answer, content: sent() }
        : answer;
    await read(parts, outcome as unknown as DocumentReadOutcome);
    expectHeld(parts, { result: "failed", revision: null });
    await parts.controller.dispose();
  });

  it("one read at a time: concurrent reconcile() calls share the automatic read and settle once", async () => {
    const parts = await unanswered();
    const first = parts.coordinator.reconcile();
    const second = parts.coordinator.reconcile();
    expect(first).toBe(second);
    expect(parts.net.reads).toBe(1);
    parts.net.answerRead(found(sent(), 9));
    const [a, b] = await Promise.all([first, second]);
    expect(a).toEqual(b);
    expect(a).toMatchObject({ phase: "idle", revision: 9, confirmedSequence: 1 });
    // Settled: asking again reads nothing and advances nothing.
    await parts.coordinator.reconcile();
    expect(parts.net.reads).toBe(1);
    expect(parts.coordinator.getState().revision).toBe(9);
    expect(parts.controller.getState()).toMatchObject({ revision: 9, confirmedSequence: 1 });
    expect(parts.log.filter((entry) => entry === "clear:1")).toHaveLength(1);
    await parts.controller.dispose();
  });

  it("a listener that asks again while being told of the read gets the same read", async () => {
    const parts = setup({ mode: "manual" });
    parts.net.holdReads();
    const asked: Promise<unknown>[] = [];
    parts.coordinator.subscribe((state) => {
      if (state.reading) asked.push(parts.coordinator.reconcile());
    });
    parts.editor.edit(doc("Sent"));
    await vi.advanceTimersByTimeAsync(1500);
    parts.net.reject(new TypeError("offline"));
    await settle();
    expect(parts.net.reads).toBe(1);
    expect(asked.length).toBeGreaterThan(0);
    parts.net.answerRead(found(sent(), 9));
    await Promise.all(asked);
    expect(parts.net.reads).toBe(1);
    await parts.controller.dispose();
  });

  it("does nothing outside reconciling", async () => {
    const parts = setup({ mode: "manual" });
    expect(await parts.coordinator.reconcile()).toMatchObject({ phase: "idle", reading: false });
    parts.editor.edit(doc("In flight"));
    await vi.advanceTimersByTimeAsync(1500);
    expect(await parts.coordinator.reconcile()).toMatchObject({ phase: "saving" });
    expect(parts.net.reads).toBe(0);
    parts.net.answer();
    await settle();
    expect(parts.net.reads).toBe(0);
    await parts.controller.dispose();
  });

  it("a read answered after dispose: a save it proves is given to the same session, and nothing is scheduled or told", async () => {
    const parts = await unanswered();
    const listener = vi.fn();
    parts.coordinator.subscribe(listener);
    parts.coordinator.dispose();
    listener.mockClear();
    parts.editor.edit(doc("After dispose"));
    await read(parts, found(sent(), 9));
    expect(listener).not.toHaveBeenCalled();
    expect(parts.coordinator.getState()).toMatchObject({
      phase: "disposed",
      reconciliation: { result: "saved", revision: 9 },
    });
    expect(parts.controller.getState()).toMatchObject({
      confirmedSequence: 1,
      revision: 9,
      saving: null,
    });
    expect(parts.log).toContain("clear:1");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(parts.net.requests).toHaveLength(1);
    expect(parts.net.reads).toBe(1);
    await parts.controller.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a conflict read after dispose releases the claim, keeps the draft, and tells no one", async () => {
    const parts = await unanswered();
    const listener = vi.fn();
    parts.coordinator.subscribe(listener);
    parts.coordinator.dispose();
    listener.mockClear();
    await read(parts, found(canonical(doc("Elsewhere")), 9));
    expect(listener).not.toHaveBeenCalled();
    expect(parts.coordinator.getState()).toMatchObject({
      phase: "disposed",
      reconciliation: { result: "conflict" },
    });
    expect(parts.controller.getState()).toMatchObject({ confirmedSequence: 0, saving: null });
    expect(parts.log.some((entry) => entry.startsWith("clear:"))).toBe(false);
    await parts.controller.dispose();
  });

  it("a late commit after an unchanged read: the retry meets stale, and its read back settles exactly the sequence sent; newer work stays pending", async () => {
    const parts = await unanswered();
    // The automatic read answers before the lost request commits: the base, still at R0.
    await read(parts, found(opened(), 8));
    expectHeld(parts, { result: "unchanged", revision: 8, base: "exact" }, 2);
    // Newer local work while held: kept on the device, never sent.
    parts.editor.edit(doc("Newer"));
    await vi.advanceTimersByTimeAsync(5000);
    expect(parts.controller.getState()).toMatchObject({
      sequence: 2,
      saving: 1,
      confirmedSequence: 0,
    });
    expect(parts.net.requests).toHaveLength(2);
    expect(parts.net.requests[1]).toMatchObject({ sequence: 1, content: doc("Sent") });
    // The original request commits on the server first: the retry is refused as stale.
    parts.net.answer((r) => ({
      kind: "conflict",
      sequence: r.sequence,
      code: "stale",
      revision: 9,
    }));
    await settle();
    // Not a conflict: read back.
    expect(parts.coordinator.getState()).toMatchObject({ phase: "reconciling", reading: true });
    expect(parts.net.reads).toBe(2);
    const settled = parts.coordinator.reconcile();
    parts.net.answerRead(found(sent(), 9));
    expect(await settled).toMatchObject({
      revision: 9,
      confirmedSequence: 1,
      submission: null,
      block: null,
      reconciliation: { sequence: 1, result: "saved", revision: 9, submitted: "exact" },
      base: { revision: 9, provenance: "server" },
    });
    expect(parts.coordinator.getSubmission()).toBeNull();
    expect(equal(parts.coordinator.getBase().content, sent())).toBe(true);
    // Exactly the sequence sent is confirmed; the newer one is still pending.
    expect(parts.controller.getState()).toMatchObject({
      confirmedSequence: 1,
      sequence: 2,
      revision: 9,
      saving: null,
    });
    expect(parts.log.filter((entry) => entry.startsWith("clear:"))).toEqual(["clear:1"]);
    expect(parts.status()).not.toBe("saved");
    // Nothing of sequence 1 a third time: the next request is the newer work, against R0 + 1.
    expect(parts.net.requests).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1500);
    expect(parts.net.requests).toHaveLength(3);
    expect(parts.net.requests[2]).toMatchObject({
      sequence: 2,
      expectedRevision: 9,
      content: doc("Newer"),
    });
    expect(parts.net.requests.filter((request) => request.sequence === 1)).toHaveLength(2);
    await parts.controller.dispose();
  });

  it("a settlement the controller will not take is held with its evidence, and advances nothing", async () => {
    const parts = await unanswered();
    // Something else released the claim while the read was in flight.
    expect(parts.controller.releaseSave(1)).toBe(true);
    await read(parts, found(sent(), 9));
    expect(parts.coordinator.getState()).toMatchObject({
      phase: "reconciling",
      revision: 8,
      confirmedSequence: 0,
      submission: { sequence: 1, expectedRevision: 8 },
      block: { reason: "rejected_confirmation", origin: "local" },
      // What the server holds matches, but nothing was settled: never `saved`.
      reconciliation: { sequence: 1, result: "unsettled", revision: 9, submitted: "exact" },
    });
    expect(parts.status()).toBe("unresolved");
    expect(parts.coordinator.getSubmission()?.content).toEqual(doc("Sent"));
    expect(parts.coordinator.getBase().revision).toBe(8);
    expect(parts.controller.getState()).toMatchObject({ confirmedSequence: 0, revision: 8 });
    expect(parts.log.some((entry) => entry.startsWith("clear:"))).toBe(false);
    await nothingMore(parts);
    await parts.controller.dispose();
  });

  it("compares canonically: another key order is exact, another form of the same document is normalized", async () => {
    const reordered = JSON.parse(JSON.stringify(sent()), (_key, value) =>
      value && typeof value === "object" && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value).reverse())
        : value,
    ) as JSONContent;
    expect(JSON.stringify(reordered)).not.toBe(JSON.stringify(sent()));
    const exact = await unanswered();
    await read(exact, found(reordered, 9));
    expect(exact.coordinator.getState()).toMatchObject({
      phase: "idle",
      reconciliation: { result: "saved", submitted: "exact" },
      base: { provenance: "server", canonical: true },
    });
    await exact.controller.dispose();

    // A v3 document sent; the read answers it in that form, which the browser's core migrates to what was predicted.
    const v3 = Object.values(documentFixtures)[0] as JSONContent;
    const predicted = canonical(v3);
    expect(equal(v3, predicted)).toBe(false);
    const parts = setup({ mode: "manual" });
    parts.net.holdReads();
    parts.editor.edit(v3);
    await vi.advanceTimersByTimeAsync(1500);
    expect(equal(parts.coordinator.getSubmission()?.predicted, predicted)).toBe(true);
    parts.net.reject(new TypeError("offline"));
    await settle();
    parts.net.answerRead(found(v3, 9));
    await settle();
    expect(parts.coordinator.getState()).toMatchObject({
      phase: "idle",
      revision: 9,
      reconciliation: { result: "saved", submitted: "normalized" },
      base: { revision: 9, provenance: "server", canonical: false },
    });
    // The base is the server's document as read.
    expect(equal(parts.coordinator.getBase().content, v3)).toBe(true);
    await parts.controller.dispose();
  });

  it("a server on another schema (a document the browser's core refuses) at R0 + 1 is held as unverifiable, never a conflict", async () => {
    const parts = await unanswered();
    await read(parts, found({ type: "doc", content: [{ type: "node_from_a_newer_schema" }] }, 9));
    expectHeld(parts, { result: "unverifiable", revision: 9, submitted: "unknown" });
    await nothingMore(parts);
    await parts.controller.dispose();
  });

  it("a server failure (perhaps after a commit) through the real transport is read back and settled", async () => {
    const actions = {
      save: vi.fn(async () => ({ ok: false, code: "failed", message: "Not saved" })),
      read: vi.fn(async () => ({ ok: true, message: "", content: sent(), revision: 9 })),
    };
    const parts = setup({ transport: realTransport(actions) });
    parts.editor.edit(doc("Sent"));
    await vi.advanceTimersByTimeAsync(1500);
    await settle();
    expect(actions.save).toHaveBeenCalledTimes(1);
    expect(actions.read).toHaveBeenCalledTimes(1);
    expect(actions.read).toHaveBeenCalledWith(outlineId);
    expect(parts.coordinator.getState()).toMatchObject({
      phase: "idle",
      revision: 9,
      outcome: { kind: "failed", uncertain: true },
      reconciliation: { result: "saved" },
    });
    expect(parts.controller.getState()).toMatchObject({ confirmedSequence: 1, revision: 9 });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(actions.save).toHaveBeenCalledTimes(1);
    await parts.controller.dispose();
  });

  it("the same server failure with the base still there is sent once more, then held", async () => {
    const actions = {
      save: vi.fn(async () => ({ ok: false, code: "failed", message: "Not saved" })),
      read: vi.fn(async () => ({ ok: true, message: "", content: opened(), revision: 8 })),
    };
    const parts = setup({ transport: realTransport(actions) });
    parts.editor.edit(doc("Sent"));
    await vi.advanceTimersByTimeAsync(1500);
    await settle();
    expect(parts.coordinator.getState()).toMatchObject({
      phase: "reconciling",
      reconciliation: { result: "unchanged" },
    });
    expect(parts.controller.getState().saving).toBe(1);
    // One save, one read, one retry, one read back: then nothing more by itself.
    expect(actions.save).toHaveBeenCalledTimes(2);
    expect(actions.read).toHaveBeenCalledTimes(2);
    expect(parts.coordinator.getState().submission).toMatchObject({ attempts: 2 });
    await parts.coordinator.retry();
    await parts.coordinator.retryUnchanged();
    await parts.coordinator.reconcile();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(actions.save).toHaveBeenCalledTimes(2);
    // Two, the one asked for, and five automatic ones (A2.3B.2C, the retry spent): reads only.
    expect(actions.read).toHaveBeenCalledTimes(2 + 1 + 5);
    expect(parts.coordinator.getState().recovery).toMatchObject({ status: "exhausted" });
    expect(parts.controller.getState().saving).toBe(1);
    await parts.controller.dispose();
  });

  it("an unexpected confirmed revision is read back too, and settled by what the read shows", async () => {
    const parts = setup({ mode: "manual" });
    parts.net.holdReads();
    parts.editor.edit(doc("Sent"));
    await vi.advanceTimersByTimeAsync(1500);
    parts.net.answer((r) => ({
      kind: "confirmed",
      sequence: r.sequence,
      revision: r.expectedRevision + 2,
    }));
    await settle();
    expect(parts.coordinator.getState()).toMatchObject({
      phase: "reconciling",
      reading: true,
      block: { reason: "unexpected_revision" },
    });
    parts.net.answerRead(found(sent(), 9));
    await settle();
    expect(parts.coordinator.getState()).toMatchObject({ phase: "idle", revision: 9 });
    await parts.controller.dispose();
  });

  it("keeps Spanish and emoji exactly through the read", async () => {
    const words = "La gracia — ¿Por qué? «Sí», Señor 🙏🏽 👨‍👩‍👧 ñáéíóú";
    const parts = await unanswered({ words });
    expect(JSON.stringify(parts.coordinator.getSubmission()?.content)).toContain(words);
    await read(parts, found(canonical(doc(words)), 9));
    expect(parts.coordinator.getState()).toMatchObject({
      phase: "idle",
      reconciliation: { result: "saved", submitted: "exact" },
    });
    expect(JSON.stringify(parts.coordinator.getBase().content)).toContain(words);
    // The state reports no words.
    expect(JSON.stringify(parts.coordinator.getState())).not.toContain("Señor");
    await parts.controller.dispose();
  });

  it("keeps the base the save was made against in the submission, not a later one", async () => {
    const parts = await unanswered();
    const submission = parts.coordinator.getSubmission();
    expect(submission?.base.revision).toBe(8);
    expect(equal(submission?.base.content, opened())).toBe(true);
    expect(equal(submission?.predicted, sent())).toBe(true);
    await parts.controller.dispose();
  });
});

describe("conditional retry (A2.3B.2B.2)", () => {
  // R0 is 8. What was sent is doc("Sent") (S); the base is doc("Opened") (B0).
  const sent = () => canonical(doc("Sent"));
  const opened = () => canonical(doc("Opened"));
  const found = (content: JSONContent, revision: number): DocumentReadOutcome => ({
    kind: "found",
    content: JSON.parse(JSON.stringify(content)) as JSONContent,
    revision,
  });
  const stale =
    (revision: number) =>
    (r: DocumentSaveRequest): DocumentSaveOutcome => ({
      kind: "conflict",
      sequence: r.sequence,
      code: "stale",
      revision,
    });

  /** A save sent against 8 whose answer was lost; its automatic read waits. */
  async function lost(options: SetupOptions = {}) {
    const parts = setup({ mode: "manual", ...options });
    parts.net.holdReads();
    parts.editor.edit(doc("Sent"));
    await vi.advanceTimersByTimeAsync(1500);
    expect(parts.net.requests).toHaveLength(1);
    parts.net.reject(new TypeError("Failed to fetch"));
    await settle();
    expect(parts.coordinator.getState()).toMatchObject({ phase: "reconciling", reading: true });
    return parts;
  }
  type Parts = Awaited<ReturnType<typeof lost>>;

  /** The lost save, read back as unchanged: the retry is now in flight. */
  async function retrying(options: SetupOptions = {}) {
    const parts = await lost(options);
    parts.net.answerRead(found(opened(), 8));
    await settle();
    expect(parts.net.requests).toHaveLength(2);
    expect(parts.coordinator.getState()).toMatchObject({
      phase: "reconciling",
      retrying: true,
      reading: false,
      submission: { sequence: 1, expectedRevision: 8, attempts: 2 },
    });
    return parts;
  }

  /** Held, as B.2B.1 holds: the claim, the submission, revision 8; nothing confirmed. */
  function expectStillHeld(parts: Parts) {
    expect(parts.coordinator.getState()).toMatchObject({
      phase: "reconciling",
      revision: 8,
      confirmedSequence: 0,
      submission: { sequence: 1, expectedRevision: 8, attempts: 2 },
      retrying: false,
    });
    expect(parts.controller.getState()).toMatchObject({
      saving: 1,
      confirmedSequence: 0,
      revision: 8,
    });
    expect(parts.coordinator.getSubmission()?.content).toEqual(doc("Sent"));
    expect(parts.status()).toBe("unresolved");
  }

  /** Every way of asking, and time: no third request. */
  async function noThirdRequest(parts: Parts) {
    parts.editor.edit(doc("Later"));
    await vi.advanceTimersByTimeAsync(60_000);
    await parts.coordinator.retryUnchanged();
    await parts.coordinator.saveNow();
    await parts.coordinator.retry();
    expect(parts.net.requests.filter((r) => r.sequence === 1)).toHaveLength(2);
    expect(parts.net.requests).toHaveLength(2);
  }

  it("is not available before a read shows the base unchanged: while saving, while reading, or after another finding", async () => {
    const parts = setup({ mode: "manual" });
    parts.net.holdReads();
    expect(await parts.coordinator.retryUnchanged()).toMatchObject({ phase: "idle" });
    parts.editor.edit(doc("Sent"));
    await vi.advanceTimersByTimeAsync(1500);
    expect(await parts.coordinator.retryUnchanged()).toMatchObject({ phase: "saving" });
    parts.net.reject(new TypeError("offline"));
    await settle();
    // A read in flight: the call shares it and sends nothing.
    const during = parts.coordinator.retryUnchanged();
    expect(during).toBe(parts.coordinator.reconcile());
    parts.net.answerRead({ kind: "failed" });
    await during;
    expect(parts.net.requests).toHaveLength(1);
    // A finding other than unchanged: never sent again.
    const findings: DocumentReadOutcome[] = [
      found(canonical(doc("Unexpected")), 8),
      found(sent(), 8),
      found(sent(), 7),
      { kind: "failed" },
      { kind: "unreadable", revision: 8 },
      found({ type: "doc", content: [{ type: "node_from_a_newer_schema" }] }, 9),
    ];
    for (const outcome of findings) {
      const asked = parts.coordinator.reconcile();
      await settle();
      parts.net.answerRead(outcome);
      await asked;
      await parts.coordinator.retryUnchanged();
      expect(parts.net.requests).toHaveLength(1);
      expect(parts.coordinator.getState()).toMatchObject({
        phase: "reconciling",
        submission: { attempts: 1 },
      });
    }
    await parts.controller.dispose();
  });

  it("sends exactly the original request: content, sequence, and revision, never newer edits", async () => {
    const parts = await lost();
    const original = parts.coordinator.getSubmission();
    // Newer work while the read is out: kept on the device, never part of the retry.
    parts.editor.edit(doc("Newer"));
    await vi.advanceTimersByTimeAsync(3000);
    expect(parts.controller.getState()).toMatchObject({ sequence: 2, saving: 1 });
    parts.net.answerRead(found(opened(), 8));
    await settle();
    expect(parts.net.requests).toHaveLength(2);
    const [first, second] = parts.net.requests;
    expect(second).toEqual(first);
    expect(second.content).toBe(first.content);
    expect(second).toMatchObject({ sequence: 1, expectedRevision: 8, outlineId });
    expect(JSON.stringify(second.content)).not.toContain("Newer");
    // The same logical save: the same submission and the same claim, not a new one.
    expect(parts.coordinator.getSubmission()).toBe(original);
    expect(parts.controller.getState().saving).toBe(1);
    expect(parts.controller.claimSave()).toBeNull();
    await parts.controller.dispose();
  });

  it("a confirmation of the retry settles only the sequence sent; newer work is sent after, against R0 + 1", async () => {
    const parts = await lost();
    parts.editor.edit(doc("Newer"));
    await vi.advanceTimersByTimeAsync(3000);
    parts.net.answerRead(found(opened(), 8));
    await settle();
    parts.net.answer();
    await settle();
    expect(parts.coordinator.getState()).toMatchObject({
      phase: "scheduled",
      revision: 9,
      confirmedSequence: 1,
      submission: null,
      block: null,
      retrying: false,
      outcome: { kind: "confirmed", sequence: 1, revision: 9 },
      base: { revision: 9, provenance: "confirmed", canonical: true },
    });
    expect(equal(parts.coordinator.getBase().content, sent())).toBe(true);
    expect(parts.controller.getState()).toMatchObject({
      confirmedSequence: 1,
      sequence: 2,
      revision: 9,
      saving: null,
    });
    expect(parts.log.filter((e) => e.startsWith("clear:"))).toEqual(["clear:1"]);
    expect(parts.status()).not.toBe("saved");
    expect(parts.net.reads).toBe(1);
    await vi.advanceTimersByTimeAsync(1500);
    expect(parts.net.requests).toHaveLength(3);
    expect(parts.net.requests[2]).toMatchObject({ sequence: 2, expectedRevision: 9 });
    parts.net.answer();
    await settle();
    expect(parts.status()).toBe("saved");
    await parts.controller.dispose();
  });

  it("the original wins: the retry's stale answer is read back, and what was sent at R0 + 1 settles it once", async () => {
    const parts = await retrying();
    const listener = vi.fn();
    parts.coordinator.subscribe(listener);
    parts.net.answer(stale(9));
    await settle();
    // Never a conflict on the strength of `stale` alone.
    expect(parts.coordinator.getState()).toMatchObject({
      phase: "reconciling",
      reading: true,
      outcome: { kind: "conflict", code: "stale" },
    });
    expect(listener.mock.calls.some(([s]) => s.phase === "blocked")).toBe(false);
    parts.net.answerRead(found(sent(), 9));
    await settle();
    expect(parts.coordinator.getState()).toMatchObject({
      phase: "idle",
      revision: 9,
      confirmedSequence: 1,
      submission: null,
      reconciliation: { sequence: 1, result: "saved", revision: 9 },
    });
    expect(parts.controller.getState()).toMatchObject({ confirmedSequence: 1, revision: 9 });
    expect(parts.log.filter((e) => e === "clear:1")).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(parts.net.requests).toHaveLength(2);
    expect(parts.net.reads).toBe(2);
    await parts.controller.dispose();
  });

  it("another writer wins: stale, then other content past R0 is released and blocked as a conflict, never merged", async () => {
    const parts = await retrying();
    parts.net.answer(stale(9));
    await settle();
    parts.net.answerRead(found(canonical(doc("Someone else")), 9));
    await settle();
    expect(parts.coordinator.getState()).toMatchObject({
      phase: "blocked",
      revision: 8,
      submission: null,
      block: { reason: "conflict", origin: "server" },
      reconciliation: { result: "conflict", revision: 9, submitted: "different" },
    });
    expect(parts.controller.getState()).toMatchObject({ saving: null, confirmedSequence: 0 });
    expect(parts.coordinator.getBase().revision).toBe(8);
    expect(parts.log.some((e) => e.startsWith("clear:"))).toBe(false);
    await noThirdRequest(parts);
    await parts.controller.dispose();
  });

  it.each([
    ["no answer", (p: Parts) => p.net.reject(new TypeError("offline"))],
    [
      "a server failure",
      (p: Parts) =>
        p.net.answer((r) => ({ kind: "failed", sequence: r.sequence, uncertain: true })),
    ],
    [
      "a refusal (what the server does now, not proof the original can never be written)",
      (p: Parts) =>
        p.net.answer((r) => ({ kind: "refused", sequence: r.sequence, code: "invalid" })),
    ],
    [
      "a confirmation at R0 + 2",
      (p: Parts) =>
        p.net.answer((r) => ({ kind: "confirmed", sequence: r.sequence, revision: 10 })),
    ],
    [
      "a confirmation without a revision",
      (p: Parts) =>
        p.net.answer((r) => ({ kind: "confirmed", sequence: r.sequence, revision: Number.NaN })),
    ],
    [
      "an answer for another sequence",
      (p: Parts) => p.net.answer(() => ({ kind: "confirmed", sequence: 2, revision: 9 })),
    ],
    ["nothing", (p: Parts) => p.net.answer(() => null as unknown as DocumentSaveOutcome)],
  ])(
    "%s: confirms nothing, is read back once, and is never sent a third time",
    async (_name, answer) => {
      const parts = await retrying();
      answer(parts);
      await settle();
      expect(parts.coordinator.getState()).toMatchObject({ phase: "reconciling", reading: true });
      expect(parts.net.reads).toBe(2);
      expect(parts.controller.getState()).toMatchObject({ saving: 1, confirmedSequence: 0 });
      parts.net.answerRead(found(opened(), 8));
      await settle();
      expectStillHeld(parts);
      expect(parts.coordinator.getState().reconciliation).toMatchObject({ result: "unchanged" });
      // The retry spent and the base still there: read again after 1 s (A2.3B.2C), never resent.
      expect(parts.coordinator.getState().recovery).toMatchObject({
        status: "scheduled",
        delayMs: 1000,
      });
      await noThirdRequest(parts);
      expect(parts.net.reads).toBeGreaterThan(2);
      await parts.controller.dispose();
    },
  );

  it("the read back unavailable: held, read again by itself or when asked, never resent", async () => {
    const parts = await retrying();
    parts.net.reject(new TypeError("offline"));
    await settle();
    parts.net.answerRead({ kind: "failed" });
    await settle();
    expectStillHeld(parts);
    expect(parts.coordinator.getState().reconciliation).toMatchObject({ result: "failed" });
    await noThirdRequest(parts);
    // An explicit read that finds the base again still sends nothing: the retry is spent.
    // (The automatic reads left waiting by the held transport timed out; this one is the newest.)
    const asked = parts.coordinator.reconcile();
    await settle();
    parts.net.answerLatestRead(found(opened(), 8));
    await asked;
    expectStillHeld(parts);
    expect(parts.net.requests).toHaveLength(2);
    await parts.controller.dispose();
  });

  it("read back after the retry: the same document in another form settles; other content at R0 + 1 does not", async () => {
    const reordered = JSON.parse(JSON.stringify(sent()), (_key, value) =>
      value && typeof value === "object" && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value).reverse())
        : value,
    ) as JSONContent;
    const parts = await retrying();
    parts.net.answer(stale(9));
    await settle();
    parts.net.answerRead(found(reordered, 9));
    await settle();
    expect(parts.coordinator.getState()).toMatchObject({
      phase: "idle",
      reconciliation: { result: "saved", submitted: "exact" },
    });
    await parts.controller.dispose();

    const other = await retrying();
    other.net.answer(stale(9));
    await settle();
    other.net.answerRead(found(canonical(doc("Sent, edited elsewhere")), 9));
    await settle();
    expect(other.coordinator.getState()).toMatchObject({
      phase: "blocked",
      reconciliation: { result: "conflict" },
    });
    await other.controller.dispose();
  });

  it("what was sent equal to the base, at R0 after the retry, is still not a confirmation", async () => {
    const parts = setup({ mode: "manual" });
    parts.net.holdReads();
    parts.editor.edit(doc("Away"));
    await vi.advanceTimersByTimeAsync(400);
    parts.editor.edit(doc("Opened"));
    await vi.advanceTimersByTimeAsync(1500);
    parts.net.reject(new TypeError("offline"));
    await settle();
    parts.net.answerRead(found(opened(), 8));
    await settle();
    expect(parts.net.requests).toHaveLength(2);
    parts.net.reject(new TypeError("offline"));
    await settle();
    parts.net.answerRead(found(opened(), 8));
    await settle();
    expect(parts.coordinator.getState()).toMatchObject({
      phase: "reconciling",
      confirmedSequence: 0,
      reconciliation: { result: "unchanged", submitted: "exact", equivalent: true },
    });
    expect(parts.controller.getState()).toMatchObject({ saving: 2, confirmedSequence: 0 });
    expect(parts.status()).toBe("unresolved");
    await parts.controller.dispose();
  });

  it("a confirmation of the retry the controller will not take is held and read back, never saved", async () => {
    const parts = await retrying();
    expect(parts.controller.releaseSave(1)).toBe(true);
    parts.net.answer();
    await settle();
    expect(parts.coordinator.getState()).toMatchObject({
      phase: "reconciling",
      reading: true,
      revision: 8,
      block: { reason: "rejected_confirmation", origin: "local" },
    });
    parts.net.answerRead(found(sent(), 9));
    await settle();
    expect(parts.coordinator.getState()).toMatchObject({
      phase: "reconciling",
      revision: 8,
      confirmedSequence: 0,
      reconciliation: { result: "unsettled" },
    });
    expect(parts.status()).toBe("unresolved");
    expect(parts.log.some((e) => e.startsWith("clear:"))).toBe(false);
    await parts.controller.dispose();
  });

  it("the document gone: the retry's missing answer releases and blocks; nothing created", async () => {
    const parts = await retrying();
    parts.net.answer((r) => ({ kind: "conflict", sequence: r.sequence, code: "missing" }));
    await settle();
    expect(parts.coordinator.getState()).toMatchObject({
      phase: "blocked",
      submission: null,
      block: { reason: "conflict", origin: "server" },
      outcome: { kind: "conflict", code: "missing" },
      reading: false,
    });
    expect(parts.controller.getState().saving).toBeNull();
    expect(parts.net.reads).toBe(1);
    await noThirdRequest(parts);
    await parts.controller.dispose();
  });

  it("an account that may not save: blocked, the claim held (the original may still be written), not read", async () => {
    const parts = await retrying();
    parts.net.answer((r) => ({ kind: "unauthorized", sequence: r.sequence }));
    await settle();
    expect(parts.coordinator.getState()).toMatchObject({
      phase: "blocked",
      block: { reason: "unauthorized", origin: "server" },
      submission: { sequence: 1, attempts: 2 },
    });
    expect(parts.controller.getState().saving).toBe(1);
    await parts.coordinator.reconcile();
    expect(parts.net.reads).toBe(1);
    await noThirdRequest(parts);
    await parts.controller.dispose();
  });

  it("one retry in flight: concurrent calls, reconcile(), and re-entrant listeners share it", async () => {
    const parts = await lost();
    const seen: Promise<unknown>[] = [];
    parts.coordinator.subscribe(() => {
      // Asks for everything on every state: still one retry, and one read back.
      seen.push(parts.coordinator.retryUnchanged(), parts.coordinator.reconcile());
    });
    parts.net.answerRead(found(opened(), 8));
    await settle();
    expect(parts.net.requests).toHaveLength(2);
    const a = parts.coordinator.retryUnchanged();
    const b = parts.coordinator.retryUnchanged();
    const c = parts.coordinator.reconcile();
    expect(a).toBe(b);
    expect(a).toBe(c);
    parts.net.answer(stale(9));
    await settle();
    expect(parts.net.reads).toBe(2);
    expect(parts.net.readsWaiting).toBe(1);
    parts.net.answerRead(found(sent(), 9));
    await Promise.all([a, b, c, ...seen]);
    expect(parts.net.requests).toHaveLength(2);
    expect(parts.net.reads).toBe(2);
    expect(parts.coordinator.getState()).toMatchObject({ phase: "idle", confirmedSequence: 1 });
    expect(parts.log.filter((e) => e === "clear:1")).toHaveLength(1);
    await parts.controller.dispose();
  });

  it("disposed while the read is out: an unchanged read sends no retry", async () => {
    const parts = await lost();
    parts.coordinator.dispose();
    parts.net.answerRead(found(opened(), 8));
    await settle();
    await parts.coordinator.retryUnchanged();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(parts.net.requests).toHaveLength(1);
    expect(parts.controller.getState().saving).toBe(1);
    await parts.controller.dispose();
  });

  it("disposed while the retry is out: a late confirmation reaches the same session; nothing is scheduled or read", async () => {
    const parts = await retrying();
    const listener = vi.fn();
    parts.coordinator.subscribe(listener);
    parts.coordinator.dispose();
    listener.mockClear();
    parts.editor.edit(doc("After dispose"));
    parts.net.answer();
    await settle();
    expect(listener).not.toHaveBeenCalled();
    expect(parts.controller.getState()).toMatchObject({
      confirmedSequence: 1,
      revision: 9,
      saving: null,
    });
    expect(parts.log).toContain("clear:1");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(parts.net.requests).toHaveLength(2);
    expect(parts.net.reads).toBe(1);
    await parts.controller.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("disposed while the retry is out: a late stale answer is not read back, and the claim stays held", async () => {
    const parts = await retrying();
    parts.coordinator.dispose();
    parts.net.answer(stale(9));
    await settle();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(parts.net.reads).toBe(1);
    expect(parts.net.requests).toHaveLength(2);
    // Possibly written: never released because its coordinator went away.
    expect(parts.controller.getState()).toMatchObject({ saving: 1, confirmedSequence: 0 });
    expect(() =>
      createSaveCoordinator({
        controller: parts.controller,
        transport: parts.net.transport,
        base: { content: opened(), revision: 8 },
      }),
    ).toThrow(SaveCoordinatorError);
    await parts.controller.dispose();
  });

  it("a later save gets its own retry: the budget belongs to one submission", async () => {
    const parts = await retrying();
    parts.net.answer();
    await settle();
    expect(parts.coordinator.getState()).toMatchObject({ phase: "idle", revision: 9 });
    parts.editor.edit(doc("Second"));
    await vi.advanceTimersByTimeAsync(1500);
    expect(parts.net.requests).toHaveLength(3);
    expect(parts.coordinator.getState().submission).toMatchObject({ sequence: 2, attempts: 1 });
    parts.net.reject(new TypeError("offline"));
    await settle();
    parts.net.answerRead(found(sent(), 9));
    await settle();
    expect(parts.net.requests).toHaveLength(4);
    expect(parts.net.requests[3]).toMatchObject({ sequence: 2, expectedRevision: 9 });
    expect(parts.coordinator.getState().submission).toMatchObject({ sequence: 2, attempts: 2 });
    await parts.controller.dispose();
  });
});

describe("refusals: recorded, and resumed from (A2.3B.2B.3)", () => {
  const found = (content: JSONContent, revision: number): DocumentReadOutcome => ({
    kind: "found",
    content: JSON.parse(JSON.stringify(content)) as JSONContent,
    revision,
  });
  const refusals = (log: string[]) => log.filter((e) => e.startsWith("refuse"));
  const invalid = { type: "doc", content: [{ type: "no_such_node" }] } as JSONContent;
  const huge = (words: string) => doc(words + "x".repeat(documentLimits.bytes + 10));

  async function inFlight(words = "Sent") {
    const parts = setup({ mode: "manual" });
    parts.net.holdReads();
    parts.editor.edit(doc(words));
    await vi.advanceTimersByTimeAsync(1500);
    expect(parts.net.requests).toHaveLength(1);
    return parts;
  }

  it.each([
    ["invalid", { kind: "refused", code: "invalid", problems: [] }, "refuse:1:invalid"],
    ["too_large", { kind: "refused", code: "too_large", bytes: 5, limit: 4 }, "refuse:1:too_large"],
    ["stale", { kind: "conflict", code: "stale", revision: 12 }, "refuse:1:stale"],
    ["missing", { kind: "conflict", code: "missing" }, "refuse:1:missing"],
  ])(
    "a definite %s answer is recorded for the sequence sent, after its own draft write",
    async (_n, answer, entry) => {
      const parts = await inFlight();
      parts.net.answer((r) => ({ ...answer, sequence: r.sequence }) as DocumentSaveOutcome);
      await settle();
      expect(refusals(parts.log)).toEqual([entry]);
      expect(parts.log.indexOf("write:1")).toBeLessThan(parts.log.indexOf(entry));
      expect(parts.controller.getState()).toMatchObject({
        saving: null,
        confirmedSequence: 0,
        refusalRecord: { sequence: 1, status: "recorded" },
      });
      // The words are still the device's: nothing was cleared.
      expect(parts.log.some((e) => e.startsWith("clear:"))).toBe(false);
      if (answer.kind === "conflict" && answer.code === "stale") {
        expect(parts.stub.storage.refuseDraft).toHaveBeenCalledWith(
          owner,
          expect.objectContaining({ sequence: 1, code: "stale", revision: 12 }),
        );
      }
      await parts.controller.dispose();
    },
  );

  it.each([
    ["no answer", (p: Parts) => p.net.reject(new TypeError("offline"))],
    [
      "a server failure",
      (p: Parts) =>
        p.net.answer((r) => ({ kind: "failed", sequence: r.sequence, uncertain: true })),
    ],
    [
      "an ended session",
      (p: Parts) => p.net.answer((r) => ({ kind: "unauthorized", sequence: r.sequence })),
    ],
  ])("%s records nothing: it is not a refusal", async (_n, answer) => {
    const parts = await inFlight();
    answer(parts);
    await settle();
    expect(refusals(parts.log)).toEqual([]);
    expect(parts.controller.getState().refusalRecord).toBeNull();
    await parts.controller.dispose();
  });
  type Parts = Awaited<ReturnType<typeof inFlight>>;

  it("a retry's stale answer is not recorded until a read proves the save can never be written", async () => {
    const parts = await inFlight();
    parts.net.reject(new TypeError("offline"));
    await settle();
    parts.net.answerRead(found(canonical(doc("Opened")), 8));
    await settle();
    expect(parts.net.requests).toHaveLength(2);
    parts.net.answer((r) => ({
      kind: "conflict",
      sequence: r.sequence,
      code: "stale",
      revision: 9,
    }));
    await settle();
    // Read back, not recorded: the original may be what moved the revision.
    expect(refusals(parts.log)).toEqual([]);
    parts.net.answerRead(found(canonical(doc("Elsewhere")), 9));
    await settle();
    expect(refusals(parts.log)).toEqual(["refuse:1:stale"]);
    expect(parts.stub.storage.refuseDraft).toHaveBeenCalledWith(
      owner,
      expect.objectContaining({ sequence: 1, code: "stale", revision: 9 }),
    );
    await parts.controller.dispose();
  });

  it("a read that settles the save records nothing; a read that finds it gone records missing", async () => {
    const saved = await inFlight();
    saved.net.reject(new TypeError("offline"));
    await settle();
    saved.net.answerRead(found(canonical(doc("Sent")), 9));
    await settle();
    expect(refusals(saved.log)).toEqual([]);
    await saved.controller.dispose();

    const gone = await inFlight();
    gone.net.reject(new TypeError("offline"));
    await settle();
    gone.net.answerRead({ kind: "missing" });
    await settle();
    expect(refusals(gone.log)).toEqual(["refuse:1:missing"]);
    await gone.controller.dispose();
  });

  it("locally invalid content is never sent: not the first time, not after an edit away and back", async () => {
    const parts = setup({ mode: "manual" });
    parts.editor.edit(invalid);
    await vi.advanceTimersByTimeAsync(1500);
    expect(parts.coordinator.getState()).toMatchObject({
      phase: "blocked",
      block: { reason: "refused", origin: "local" },
    });
    // Still invalid, in other words: checked, refused, never sent.
    parts.editor.edit({ type: "doc", content: [{ type: "no_such_node" }, { type: "nor_this" }] });
    await vi.advanceTimersByTimeAsync(1500);
    parts.editor.edit(invalid);
    await vi.advanceTimersByTimeAsync(1500);
    await parts.coordinator.saveNow();
    expect(parts.net.requests).toHaveLength(0);
    expect(refusals(parts.log)).toEqual([
      "refuse:1:invalid",
      "refuse:2:invalid",
      "refuse:3:invalid",
    ]);
    expect(parts.status()).toBe("blocked");
    await parts.controller.dispose();
  });

  it("content the server refused is never sent again, even under a new sequence", async () => {
    const parts = await inFlight("Refused words");
    parts.net.answer((r) => ({ kind: "refused", sequence: r.sequence, code: "invalid" }));
    await settle();
    // Away and back to exactly what was refused, each kept as its own snapshot.
    parts.editor.edit(doc("Something else"));
    await vi.advanceTimersByTimeAsync(400);
    parts.editor.edit(doc("Refused words"));
    await vi.advanceTimersByTimeAsync(1500);
    expect(parts.controller.getState().sequence).toBe(3);
    expect(parts.net.requests).toHaveLength(1);
    expect(parts.coordinator.getState()).toMatchObject({
      phase: "blocked",
      block: { reason: "refused", origin: "local" },
      outcome: { kind: "refused", code: "invalid", sequence: 3 },
    });
    expect(refusals(parts.log)).toEqual(["refuse:1:invalid", "refuse:3:invalid"]);
    // An edit to the same words again is not a new snapshot: nothing at all.
    parts.editor.edit(doc("Refused words"));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(parts.net.requests).toHaveLength(1);
    // Different words are sent.
    parts.editor.edit(doc("Accepted words"));
    await vi.advanceTimersByTimeAsync(1500);
    expect(parts.net.requests).toHaveLength(2);
    expect(parts.net.requests[1]).toMatchObject({ sequence: 4, content: doc("Accepted words") });
    await parts.controller.dispose();
  });

  it("an oversized document is never sent while it stays oversized, and is sent once corrected", async () => {
    const parts = setup({ mode: "manual" });
    parts.editor.edit(huge("Long "));
    await vi.advanceTimersByTimeAsync(1500);
    for (let i = 0; i < 4; i += 1) {
      parts.editor.edit(huge(`Longer ${i} `));
      await vi.advanceTimersByTimeAsync(2000);
    }
    await parts.coordinator.saveNow();
    expect(parts.net.requests).toHaveLength(0);
    expect(parts.status()).toBe("attention");
    parts.editor.edit(doc("Shortened"));
    await vi.advanceTimersByTimeAsync(1500);
    expect(parts.net.requests).toHaveLength(1);
    expect(parts.net.requests[0]).toMatchObject({ expectedRevision: 8, content: doc("Shortened") });
    parts.net.answer();
    await settle();
    expect(parts.status()).toBe("saved");
    expect(parts.net.requests).toHaveLength(1);
    await parts.controller.dispose();
  });

  it("a corrected edit that is still invalid does not resume; a valid one saves once", async () => {
    const parts = setup({ mode: "manual" });
    parts.editor.edit(invalid);
    await vi.advanceTimersByTimeAsync(1500);
    parts.editor.edit({ type: "doc", content: [{ type: "still_wrong" }] });
    await vi.advanceTimersByTimeAsync(1500);
    expect(parts.net.requests).toHaveLength(0);
    parts.editor.edit(doc("Valid"));
    await vi.advanceTimersByTimeAsync(1500);
    expect(parts.net.requests).toHaveLength(1);
    parts.net.answer();
    await settle();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(parts.net.requests).toHaveLength(1);
    expect(parts.coordinator.getState()).toMatchObject({ phase: "idle", revision: 9, block: null });
    await parts.controller.dispose();
  });

  it("a newer snapshot made while the refused one was in flight is sent without another edit", async () => {
    const parts = await inFlight();
    parts.editor.edit(doc("Newer"));
    await vi.advanceTimersByTimeAsync(3000);
    expect(parts.controller.getState().sequence).toBe(2);
    parts.net.answer((r) => ({ kind: "refused", sequence: r.sequence, code: "invalid" }));
    await settle();
    expect(parts.coordinator.getState().phase).toBe("blocked");
    expect(refusals(parts.log)).toEqual(["refuse:1:invalid"]);
    // The draft holds 2 and is not overwritten by the refusal of 1.
    expect(parts.log.indexOf("write:2")).toBeGreaterThan(-1);
    await vi.advanceTimersByTimeAsync(1500);
    expect(parts.net.requests).toHaveLength(2);
    expect(parts.net.requests[1]).toMatchObject({
      sequence: 2,
      expectedRevision: 8,
      content: doc("Newer"),
    });
    parts.net.answer();
    await settle();
    expect(parts.controller.getState()).toMatchObject({ confirmedSequence: 2, revision: 9 });
    expect(parts.status()).toBe("saved");
    await parts.controller.dispose();
  });

  it("a refusal recorded after the coordinator is disposed still reaches the draft; nothing is sent", async () => {
    const parts = await inFlight();
    parts.coordinator.dispose();
    parts.net.answer((r) => ({ kind: "refused", sequence: r.sequence, code: "too_large" }));
    await settle();
    expect(refusals(parts.log)).toEqual(["refuse:1:too_large"]);
    expect(parts.controller.getState().saving).toBeNull();
    parts.editor.edit(doc("After"));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(parts.net.requests).toHaveLength(1);
    // Released for certain: a new coordinator may take the controller over.
    expect(() =>
      createSaveCoordinator({
        controller: parts.controller,
        transport: parts.net.transport,
        base: { content: canonical(doc("Opened")), revision: 8 },
      }),
    ).not.toThrow();
    await parts.controller.dispose();
  });

  it("a refusal the draft could not take is reported as failed; the words' own state is untouched", async () => {
    const parts = await inFlight();
    parts.stub.failNextRefuse(new DraftStorageError("quota"));
    const before = parts.controller.getState();
    parts.net.answer((r) => ({ kind: "refused", sequence: r.sequence, code: "invalid" }));
    await settle();
    expect(parts.controller.getState()).toMatchObject({
      refusalRecord: { sequence: 1, code: "invalid", status: "failed", error: "quota" },
      storageError: before.storageError,
      localSequence: before.localSequence,
    });
    expect(parts.coordinator.getState().phase).toBe("blocked");
    await parts.controller.dispose();
  });
});

describe("network failures (A2.3B.2C)", () => {
  const sent = () => canonical(doc("Sent"));
  const opened = () => canonical(doc("Opened"));
  const found = (content: JSONContent, revision: number): DocumentReadOutcome => ({
    kind: "found",
    content: JSON.parse(JSON.stringify(content)) as JSONContent,
    revision,
  });
  const delays = [1000, 2000, 4000, 8000, 16_000];

  /** Connectivity the test sets; it tells every listener, even of the same news. */
  function fakeConnectivity(initial = true) {
    let online = initial;
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
      get listeners() {
        return listeners.size;
      },
    };
  }

  /** A save sent against 8 that got no answer, on the network `link` says. */
  async function unanswered(options: { holdReads?: boolean; online?: boolean } = {}) {
    const link = fakeConnectivity(options.online ?? true);
    const parts = setup({ mode: "manual", connectivity: link.connectivity });
    if (options.holdReads) parts.net.holdReads();
    parts.editor.edit(doc("Sent"));
    await vi.advanceTimersByTimeAsync(1500);
    expect(parts.net.requests).toHaveLength(1);
    parts.net.reject(new TypeError("Failed to fetch"));
    await settle();
    expect(parts.coordinator.getState()).toMatchObject({
      phase: "reconciling",
      submission: { sequence: 1 },
    });
    return { ...parts, link };
  }
  type Parts = Awaited<ReturnType<typeof unanswered>>;

  /** Held, never written: the claim, the submission, revision 8. */
  function expectHeld(parts: Parts, requests = 1) {
    expect(parts.coordinator.getState()).toMatchObject({
      phase: "reconciling",
      revision: 8,
      confirmedSequence: 0,
      submission: { sequence: 1, expectedRevision: 8 },
    });
    expect(parts.controller.getState()).toMatchObject({ saving: 1, confirmedSequence: 0 });
    expect(parts.net.requests).toHaveLength(requests);
  }

  describe("the timing", () => {
    it("defaults to 15 s, 10 s, and 1, 2, 4, 8, 16 s; a configured delay never passes 30 s", () => {
      const timing = recoveryTiming();
      expect(timing).toEqual(networkRecoveryTiming);
      expect(timing).toMatchObject({ saveTimeoutMs: 15_000, readTimeoutMs: 10_000, maxRetries: 5 });
      expect([0, 1, 2, 3, 4].map((n) => retryDelay(timing, n))).toEqual(delays);
      expect(retryDelay(timing, 9)).toBe(30_000);
      expect(recoveryTiming({ retryMaxDelayMs: 120_000 }).retryMaxDelayMs).toBe(30_000);
      expect(retryDelay(recoveryTiming({ retryBaseMs: 60_000 }), 0)).toBe(30_000);
      for (const bad of [Number.NaN, -1, 0, Number.POSITIVE_INFINITY]) {
        expect(
          recoveryTiming({ saveTimeoutMs: bad, readTimeoutMs: bad, retryBaseMs: bad }),
        ).toEqual(networkRecoveryTiming);
      }
      for (const bad of [-1, 1.5, Number.NaN]) {
        expect(recoveryTiming({ maxRetries: bad }).maxRetries).toBe(5);
      }
      expect(recoveryTiming({ maxRetries: 0 }).maxRetries).toBe(0);
    });
  });

  describe("timeouts", () => {
    it("a save not answered in 15 s is no answer: held and read back; its late confirmation is dropped", async () => {
      const parts = setup({ mode: "manual" });
      parts.net.holdReads();
      parts.editor.edit(doc("Sent"));
      await vi.advanceTimersByTimeAsync(1500);
      await vi.advanceTimersByTimeAsync(14_999);
      expect(parts.coordinator.getState().phase).toBe("saving");
      expect(parts.net.reads).toBe(0);
      await vi.advanceTimersByTimeAsync(1);
      expect(parts.coordinator.getState()).toMatchObject({
        phase: "reconciling",
        block: { reason: "uncertain", origin: "server" },
        outcome: { kind: "failed", sequence: 1, uncertain: true },
        reading: true,
      });
      expect(parts.net.reads).toBe(1);
      // The server committed after the browser stopped waiting; its answer arrives late.
      parts.net.answer();
      await settle();
      expect(parts.controller.getState()).toMatchObject({ saving: 1, confirmedSequence: 0 });
      expect(parts.coordinator.getState().outcome).toMatchObject({ kind: "failed" });
      // The read is what settles it, at exactly R0 + 1 with what was sent.
      parts.net.answerRead(found(sent(), 9));
      await settle();
      expect(parts.coordinator.getState()).toMatchObject({
        phase: "idle",
        revision: 9,
        reconciliation: { result: "saved" },
        recovery: null,
      });
      expect(parts.controller.getState()).toMatchObject({ saving: null, confirmedSequence: 1 });
      expect(parts.net.requests).toHaveLength(1);
      await parts.controller.dispose();
      expect(vi.getTimerCount()).toBe(0);
    });

    it("a save that times out before the server commits: the base still there gets the one conditional retry", async () => {
      const parts = setup({ mode: "manual" });
      parts.net.holdReads();
      parts.editor.edit(doc("Sent"));
      await vi.advanceTimersByTimeAsync(1500 + 15_000);
      parts.net.answerRead(found(opened(), 8));
      await settle();
      expect(parts.net.requests).toHaveLength(2);
      expect(parts.net.requests[1]).toEqual(parts.net.requests[0]);
      expect(parts.coordinator.getState().submission).toMatchObject({ attempts: 2 });
      await parts.controller.dispose();
    });

    it("the conditional retry not answered in 15 s is read back, and never sent a third time", async () => {
      const parts = setup({ mode: "manual" });
      parts.net.holdReads();
      parts.editor.edit(doc("Sent"));
      await vi.advanceTimersByTimeAsync(1500);
      parts.net.reject(new TypeError("Failed to fetch"));
      await settle();
      parts.net.answerRead(found(opened(), 8));
      await settle();
      expect(parts.coordinator.getState().retrying).toBe(true);
      await vi.advanceTimersByTimeAsync(15_000);
      expect(parts.coordinator.getState()).toMatchObject({ retrying: false, reading: true });
      expect(parts.net.reads).toBe(2);
      parts.net.answerRead({ kind: "failed" });
      await settle();
      // Every attempt the budget allows is a read; the save is never sent again.
      for (let i = 0; i < 5; i += 1) {
        await vi.advanceTimersByTimeAsync(30_000);
        if (parts.net.readsWaiting) parts.net.answerLatestRead({ kind: "failed" });
        await settle();
      }
      expect(parts.coordinator.getState().recovery).toMatchObject({ status: "exhausted" });
      expect(parts.net.requests).toHaveLength(2);
      // The retry's answer comes in late (it committed): it is not taken as evidence.
      expect(parts.net.waiting).toBe(1);
      parts.net.answer();
      await settle();
      expect(parts.controller.getState()).toMatchObject({ saving: 1, confirmedSequence: 0 });
      await parts.controller.dispose();
    });

    it("a read not answered in 10 s is a failed read; its late answer is dropped", async () => {
      const parts = await unanswered({ holdReads: true });
      await vi.advanceTimersByTimeAsync(9999);
      expect(parts.coordinator.getState().reading).toBe(true);
      await vi.advanceTimersByTimeAsync(1);
      expect(parts.coordinator.getState()).toMatchObject({
        reading: false,
        reconciliation: { result: "failed" },
        recovery: { status: "scheduled", retries: 0, delayMs: 1000 },
      });
      // The late answer shows the base; taken, it would send the conditional retry. It is dropped.
      parts.net.answerRead(found(opened(), 8));
      await settle();
      expect(parts.coordinator.getState().reconciliation).toMatchObject({ result: "failed" });
      expectHeld(parts);
      await parts.controller.dispose();
    });

    it("once disposed nothing times out: a confirmation 20 s late still reaches the same controller", async () => {
      const { editor, net, controller, coordinator, log } = setup({ mode: "manual" });
      editor.edit(doc("Late"));
      await vi.advanceTimersByTimeAsync(1500);
      coordinator.dispose();
      await vi.advanceTimersByTimeAsync(20_000);
      expect(controller.getState().saving).toBe(1);
      net.answer();
      await settle();
      expect(controller.getState()).toMatchObject({ saving: null, confirmedSequence: 1 });
      expect(log).toContain("clear:1");
      expect(net.reads).toBe(0);
      await controller.dispose();
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe("bounded retries", () => {
    it("reads again after 1, 2, 4, 8, 16 s, then stops (exhausted), holding the claim", async () => {
      const parts = await unanswered();
      const seen: string[] = [];
      parts.coordinator.subscribe((state) => {
        if (state.recovery) seen.push(`${state.recovery.status}:${state.recovery.retries}`);
      });
      expect(parts.net.reads).toBe(1);
      for (const [n, delay] of delays.entries()) {
        expect(parts.coordinator.getState().recovery).toMatchObject({
          kind: "read",
          retries: n,
          status: "scheduled",
          delayMs: delay,
        });
        await vi.advanceTimersByTimeAsync(delay - 1);
        expect(parts.net.reads).toBe(1 + n);
        await vi.advanceTimersByTimeAsync(1);
        expect(parts.net.reads).toBe(2 + n);
      }
      expect(parts.coordinator.getState().recovery).toEqual({
        kind: "read",
        retries: 5,
        limit: 5,
        status: "exhausted",
        delayMs: null,
      });
      expect(parts.status()).toBe("stalled");
      expectHeld(parts);
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      expect(parts.net.reads).toBe(6);
      expect(seen.at(-1)).toBe("exhausted:5");
      await parts.controller.dispose();
      expect(vi.getTimerCount()).toBe(0);
    });

    it("a read that fails once, then succeeds, settles the save and ends the episode", async () => {
      const parts = await unanswered({ holdReads: true });
      parts.net.answerRead({ kind: "failed" });
      await settle();
      await vi.advanceTimersByTimeAsync(1000);
      expect(parts.net.reads).toBe(2);
      parts.net.answerRead(found(sent(), 9));
      await settle();
      expect(parts.coordinator.getState()).toMatchObject({
        phase: "idle",
        revision: 9,
        recovery: null,
        reconciliation: { result: "saved" },
      });
      expect(parts.status()).toBe("saved");
      // The next save that is lost has a budget of its own.
      parts.editor.edit(doc("Next"));
      await vi.advanceTimersByTimeAsync(1500);
      parts.net.reject(new TypeError("Failed to fetch"));
      await settle();
      parts.net.answerRead({ kind: "failed" });
      await settle();
      expect(parts.coordinator.getState().recovery).toMatchObject({ retries: 0, delayMs: 1000 });
      await parts.controller.dispose();
    });

    it("with the conditional retry spent and the base still there, reads again and settles a late commit", async () => {
      const parts = await unanswered({ holdReads: true });
      parts.net.answerRead(found(opened(), 8));
      await settle();
      parts.net.reject(new TypeError("Failed to fetch")); // the retry, lost
      await settle();
      parts.net.answerRead(found(opened(), 8));
      await settle();
      expect(parts.coordinator.getState()).toMatchObject({
        reconciliation: { result: "unchanged" },
        submission: { attempts: 2 },
        recovery: { status: "scheduled", retries: 0, delayMs: 1000 },
      });
      await vi.advanceTimersByTimeAsync(1000);
      expect(parts.net.reads).toBe(3);
      // Still the base: read again later, never resent.
      parts.net.answerRead(found(opened(), 8));
      await settle();
      expect(parts.net.requests).toHaveLength(2);
      await vi.advanceTimersByTimeAsync(2000);
      expect(parts.net.reads).toBe(4);
      // One of the two requests committed meanwhile.
      parts.net.answerRead(found(sent(), 9));
      await settle();
      expect(parts.coordinator.getState()).toMatchObject({
        phase: "idle",
        revision: 9,
        recovery: null,
        reconciliation: { result: "saved" },
      });
      expect(parts.net.requests).toHaveLength(2);
      await parts.controller.dispose();
    });

    it.each([
      ["diverged", (): DocumentReadOutcome => found(canonical(doc("Other")), 8)],
      [
        "unverifiable",
        (): DocumentReadOutcome => found({ type: "doc", content: [{ type: "x" }] }, 9),
      ],
      ["unreadable at R0", (): DocumentReadOutcome => ({ kind: "unreadable", revision: 8 })],
    ])("a read that answered (%s) is not retried by itself", async (_name, outcome) => {
      const parts = await unanswered({ holdReads: true });
      parts.net.answerRead(outcome());
      await settle();
      expect(parts.coordinator.getState()).toMatchObject({ phase: "reconciling", recovery: null });
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      expect(parts.net.reads).toBe(1);
      expectHeld(parts);
      expect(parts.status()).toBe("unresolved");
      await parts.controller.dispose();
    });

    it("neither reconcile() nor a listener multiplies the budget; reconcile() takes the timer's place", async () => {
      const parts = await unanswered({ holdReads: true });
      parts.net.answerRead({ kind: "failed" });
      await settle();
      const asked: Promise<unknown>[] = [];
      parts.coordinator.subscribe((state) => {
        if (state.reading) asked.push(parts.coordinator.reconcile(), parts.coordinator.recover());
      });
      const first = parts.coordinator.reconcile();
      const second = parts.coordinator.reconcile();
      expect(second).toBe(first);
      await settle();
      expect(parts.net.reads).toBe(2);
      expect(asked.length).toBeGreaterThan(0);
      expect(asked.every((promise) => promise === first)).toBe(true);
      // Asked for, so not counted; the timer it replaced is gone.
      expect(parts.coordinator.getState().recovery).toMatchObject({
        retries: 0,
        status: "running",
      });
      parts.net.answerRead({ kind: "failed" });
      await first;
      expect(parts.coordinator.getState().recovery).toMatchObject({
        retries: 0,
        status: "scheduled",
        delayMs: 1000,
      });
      await vi.advanceTimersByTimeAsync(1000);
      expect(parts.net.reads).toBe(3);
      expect(parts.coordinator.getState().recovery).toMatchObject({ retries: 1 });
      await parts.controller.dispose();
    });
  });

  describe("connectivity", () => {
    it("offline before a save is due: waits, keeps every snapshot on the device, and sends once online, once", async () => {
      const link = fakeConnectivity(true);
      const parts = setup({ mode: "auto", connectivity: link.connectivity });
      link.set(false);
      parts.editor.edit(doc("Offline 1"));
      await vi.advanceTimersByTimeAsync(1500);
      expect(parts.net.requests).toHaveLength(0);
      expect(parts.coordinator.getState()).toMatchObject({ online: false, waiting: true });
      expect(parts.status()).toBe("offline");
      for (let i = 2; i <= 5; i += 1) {
        parts.editor.edit(doc(`Offline ${i}`));
        await vi.advanceTimersByTimeAsync(3000);
      }
      await parts.coordinator.saveNow();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(parts.net.requests).toHaveLength(0);
      expect(parts.controller.getState()).toMatchObject({ localSequence: 5, sequence: 5 });
      expect(parts.status()).toBe("offline");
      link.set(true);
      link.set(true);
      link.set(true);
      await settle();
      expect(parts.net.requests).toHaveLength(1);
      expect(parts.net.requests[0]).toMatchObject({ sequence: 5, content: doc("Offline 5") });
      expect(parts.coordinator.getState()).toMatchObject({ waiting: false, online: true });
      expect(parts.status()).toBe("saved");
      link.set(false);
      link.set(true);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(parts.net.requests).toHaveLength(1);
      await parts.controller.dispose();
    });

    it("offline during a save: the request goes on; the read of a lost answer waits for online, uncounted", async () => {
      const link = fakeConnectivity(true);
      const parts = setup({ mode: "manual", connectivity: link.connectivity });
      parts.editor.edit(doc("Sent"));
      await vi.advanceTimersByTimeAsync(1500);
      link.set(false);
      expect(parts.coordinator.getState().phase).toBe("saving");
      parts.net.reject(new TypeError("Failed to fetch"));
      await settle();
      expect(parts.coordinator.getState()).toMatchObject({
        phase: "reconciling",
        recovery: { status: "offline", retries: 0 },
      });
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      expect(parts.net.reads).toBe(0);
      expect(parts.controller.getState().saving).toBe(1);
      link.set(true);
      await settle();
      expect(parts.net.reads).toBe(1);
      // The fake read failed: the first automatic retry follows, after 1 s.
      expect(parts.coordinator.getState().recovery).toMatchObject({
        retries: 0,
        status: "scheduled",
        delayMs: 1000,
      });
      await parts.controller.dispose();
    });

    it("offline during a read: the next read waits; online makes one at once, counted; repeated news makes none", async () => {
      const parts = await unanswered({ holdReads: true });
      parts.link.set(false);
      parts.net.answerRead({ kind: "failed" });
      await settle();
      expect(parts.coordinator.getState().recovery).toMatchObject({
        status: "offline",
        retries: 0,
      });
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      expect(parts.net.reads).toBe(1);
      parts.link.set(true);
      parts.link.set(true);
      await settle();
      expect(parts.net.reads).toBe(2);
      expect(parts.coordinator.getState().recovery).toMatchObject({
        status: "running",
        retries: 1,
      });
      // Offline and online again while that read is in flight: nothing more.
      parts.link.set(false);
      parts.link.set(true);
      await settle();
      expect(parts.net.reads).toBe(2);
      expectHeld(parts);
      await parts.controller.dispose();
    });

    it("online news while already online changes nothing: the retry keeps its delay", async () => {
      const parts = await unanswered();
      expect(parts.coordinator.getState().recovery).toMatchObject({
        status: "scheduled",
        delayMs: 1000,
      });
      for (let i = 0; i < 10; i += 1) parts.link.set(true);
      await settle();
      expect(parts.net.reads).toBe(1);
      expect(parts.coordinator.getState().recovery).toMatchObject({
        retries: 0,
        status: "scheduled",
      });
      await vi.advanceTimersByTimeAsync(1000);
      expect(parts.net.reads).toBe(2);
      await parts.controller.dispose();
    });

    it("online again with a retry pending: one attempt at once in place of the timer", async () => {
      const parts = await unanswered({ holdReads: true });
      parts.net.answerRead({ kind: "failed" });
      await settle();
      expect(parts.coordinator.getState().recovery).toMatchObject({ status: "scheduled" });
      parts.link.set(false);
      expect(parts.coordinator.getState().recovery).toMatchObject({
        status: "offline",
        delayMs: null,
      });
      parts.link.set(true);
      await settle();
      expect(parts.net.reads).toBe(2);
      await vi.advanceTimersByTimeAsync(1000);
      expect(parts.net.reads).toBe(2);
      await parts.controller.dispose();
    });

    it("a browser that says online but reaches nothing: the same five attempts, then online changes nothing", async () => {
      const parts = await unanswered();
      for (let i = 0; i < 12; i += 1) {
        parts.link.set(false);
        parts.link.set(true);
        await settle();
      }
      expect(parts.net.reads).toBe(6);
      expect(parts.coordinator.getState().recovery).toMatchObject({
        status: "exhausted",
        retries: 5,
      });
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      expect(parts.net.reads).toBe(6);
      expect(parts.status()).toBe("stalled");
      expectHeld(parts);
      await parts.controller.dispose();
    });

    it("a connectivity that throws on subscribe: the error is the caller's, and nothing is left behind", async () => {
      const log: string[] = [];
      const editor = fakeSource(doc("Opened"));
      const stub = stubStorage(log);
      const controller = createAutosaveController({
        owner,
        outlineId,
        revision: 8,
        source: editor.source,
        storage: stub.storage,
      });
      const net = fakeTransport(log, "auto");
      const failure = new Error("no network API");
      const broken: Connectivity = {
        online: () => true,
        subscribe: () => {
          throw failure;
        },
      };
      const make = (connectivity?: Connectivity) =>
        createSaveCoordinator({
          controller,
          transport: net.transport,
          base: { content: canonical(doc("Opened")), revision: 8 },
          connectivity,
        });
      expect(() => make(broken)).toThrow(failure);
      expect(vi.getTimerCount()).toBe(0);
      // A change listener left behind would arm its own save: none is ever sent.
      editor.edit(doc("Typed"));
      await vi.advanceTimersByTimeAsync(60_000);
      expect(net.requests).toHaveLength(0);
      expect(net.reads).toBe(0);
      expect(controller.getState()).toMatchObject({ saving: null, localSequence: 1 });
      expect(vi.getTimerCount()).toBe(0);
      // The same controller still takes a working coordinator, which alone sends, once.
      const link = fakeConnectivity(true);
      const coordinator = make(link.connectivity);
      expect(link.listeners).toBe(1);
      editor.edit(doc("Typed again"));
      await vi.advanceTimersByTimeAsync(1500);
      expect(net.requests).toHaveLength(1);
      expect(coordinator.getState()).toMatchObject({ phase: "idle", revision: 9 });
      await controller.dispose();
      expect(link.listeners).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    });

    it("is unsubscribed on dispose, and news after it changes nothing", async () => {
      const parts = await unanswered();
      expect(parts.link.listeners).toBe(1);
      parts.coordinator.dispose();
      expect(parts.link.listeners).toBe(0);
      parts.link.set(false);
      parts.link.set(true);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(parts.net.reads).toBe(1);
      expect(parts.controller.getState().saving).toBe(1);
      await parts.controller.dispose();
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe("manual recovery", () => {
    /** Exhausted after the conditional retry was spent: 2 requests, 7 reads. */
    async function exhaustedAfterRetry() {
      const parts = await unanswered({ holdReads: true });
      parts.net.answerRead(found(opened(), 8));
      await settle();
      parts.net.reject(new TypeError("Failed to fetch"));
      await settle();
      parts.net.failReads();
      parts.net.answerRead({ kind: "failed" });
      await settle();
      await vi.advanceTimersByTimeAsync(31_000);
      expect(parts.coordinator.getState().recovery).toMatchObject({ status: "exhausted" });
      expect(parts.net.reads).toBe(7);
      expect(parts.net.requests).toHaveLength(2);
      return parts;
    }

    it("recover() after exhaustion reads, never writes, and starts one new bounded cycle", async () => {
      const parts = await exhaustedAfterRetry();
      const one = parts.coordinator.recover();
      const two = parts.coordinator.recover();
      expect(two).toBe(one);
      await one;
      expect(parts.net.reads).toBe(8);
      expect(parts.net.requests).toHaveLength(2);
      expect(parts.coordinator.getState().recovery).toMatchObject({
        retries: 0,
        status: "scheduled",
        delayMs: 1000,
      });
      await vi.advanceTimersByTimeAsync(31_000);
      expect(parts.net.reads).toBe(13);
      expect(parts.coordinator.getState().recovery).toMatchObject({ status: "exhausted" });
      expect(parts.coordinator.getState().submission).toMatchObject({ attempts: 2 });
      expectHeld(parts, 2);
      await parts.controller.dispose();
    });

    it("recover() that finds the base still there with the retry spent sends nothing", async () => {
      const parts = await exhaustedAfterRetry();
      parts.net.holdReads();
      const asked = parts.coordinator.recover();
      await settle();
      parts.net.answerLatestRead(found(opened(), 8));
      await asked;
      expect(parts.net.requests).toHaveLength(2);
      expect(parts.coordinator.getState()).toMatchObject({
        reconciliation: { result: "unchanged" },
        recovery: { retries: 0, status: "scheduled" },
      });
      await parts.controller.dispose();
    });

    it("recover() that finds the save written settles it", async () => {
      const parts = await exhaustedAfterRetry();
      parts.net.holdReads();
      const asked = parts.coordinator.recover();
      await settle();
      parts.net.answerLatestRead(found(sent(), 9));
      await asked;
      expect(parts.coordinator.getState()).toMatchObject({
        phase: "idle",
        revision: 9,
        recovery: null,
      });
      expect(parts.controller.getState()).toMatchObject({ saving: null, confirmedSequence: 1 });
      expect(parts.status()).toBe("saved");
      await parts.controller.dispose();
    });

    it("recover() that finds another writer releases it as a conflict", async () => {
      const parts = await exhaustedAfterRetry();
      parts.net.holdReads();
      const asked = parts.coordinator.recover();
      await settle();
      parts.net.answerLatestRead(found(canonical(doc("Elsewhere")), 10));
      await asked;
      expect(parts.coordinator.getState()).toMatchObject({
        phase: "blocked",
        block: { reason: "conflict" },
        recovery: null,
        submission: null,
      });
      expect(parts.status()).toBe("blocked");
      await vi.advanceTimersByTimeAsync(60_000);
      expect(parts.net.requests).toHaveLength(2);
      await parts.controller.dispose();
    });

    it("recover() after failed saves are exhausted makes one save and a new cycle", async () => {
      const parts = setup({ mode: "auto" });
      const save = parts.net.transport.save as ReturnType<typeof vi.fn>;
      save.mockImplementation((request: DocumentSaveRequest) =>
        Promise.resolve({ kind: "failed", sequence: request.sequence, uncertain: false }),
      );
      parts.editor.edit(doc("Never through"));
      await vi.advanceTimersByTimeAsync(1500);
      await vi.advanceTimersByTimeAsync(31_000);
      expect(save).toHaveBeenCalledTimes(6);
      expect(parts.coordinator.getState()).toMatchObject({
        phase: "failed",
        recovery: { kind: "save", status: "exhausted", retries: 5 },
      });
      expect(parts.status()).toBe("stalled");
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      expect(save).toHaveBeenCalledTimes(6);
      save.mockImplementation((request: DocumentSaveRequest) =>
        Promise.resolve(confirmedFor(request)),
      );
      await parts.coordinator.recover();
      expect(parts.coordinator.getState()).toMatchObject({
        phase: "idle",
        revision: 9,
        recovery: null,
      });
      expect(parts.status()).toBe("saved");
      await parts.controller.dispose();
    });

    it("recover() does nothing while idle or disposed", async () => {
      const parts = setup();
      expect(await parts.coordinator.recover()).toMatchObject({ phase: "idle" });
      parts.coordinator.dispose();
      expect(await parts.coordinator.recover()).toMatchObject({ phase: "disposed" });
      expect(parts.net.requests).toHaveLength(0);
      expect(parts.net.reads).toBe(0);
      await parts.controller.dispose();
    });
  });

  describe("disposal", () => {
    it("during backoff: no timer is left and nothing more is read", async () => {
      const parts = await unanswered();
      expect(parts.coordinator.getState().recovery).toMatchObject({ status: "scheduled" });
      parts.coordinator.dispose();
      // Cancelled at once, not left to find itself disposed.
      expect(vi.getTimerCount()).toBe(0);
      expect(parts.coordinator.getState().recovery).toBeNull();
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      expect(parts.net.reads).toBe(1);
      expect(parts.controller.getState().saving).toBe(1);
      await parts.controller.dispose();
      expect(vi.getTimerCount()).toBe(0);
    });

    it("during a read: its late answer is classified, nothing is scheduled, and the claim is kept", async () => {
      const parts = await unanswered({ holdReads: true });
      parts.coordinator.dispose();
      parts.net.answerRead({ kind: "failed" });
      await settle();
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      expect(parts.net.reads).toBe(1);
      expect(parts.controller.getState().saving).toBe(1);
      await parts.controller.dispose();
      expect(vi.getTimerCount()).toBe(0);
    });

    it("the controller disposed before a scheduled retry: the coordinator goes with it, reading nothing", async () => {
      const parts = await unanswered();
      await parts.controller.dispose();
      expect(parts.coordinator.getState().phase).toBe("disposed");
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      expect(parts.net.reads).toBe(1);
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
