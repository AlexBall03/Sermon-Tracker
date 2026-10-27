import type { Editor, JSONContent } from "@tiptap/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { documentFixtures } from "@/features/editor-lab/documents";
import { documentV4, pointV4, proseV4 } from "@/features/editor-lab/v4/fixtures";
import { caret, testEditorV4 } from "@/features/editor-lab/v4/testing";
import { canonicalDocument } from "../canonical";
import type { JsonValue } from "../json";
import { documentLimits } from "../model";
import { DraftStorageError } from "../recovery/store";
import type { DocumentSaveOutcome, DocumentSaveRequest } from "../saving";
import { createAutosaveController, type DraftStorage } from "./controller";
import { createSaveCoordinator, SaveCoordinatorError } from "./coordinator";
import { editorSource } from "./editor-adapter";
import { jsonEqual, serverSaveStatus, type DocumentSource } from "./model";
import { actionTransport, type DocumentActions, type DocumentTransport } from "./transport";

/*
 * The save coordinator (A2.3B.2A) over the real autosave controller, on fake
 * timers, with a storage stand-in and a transport the test answers by hand.
 */

const owner = "4f1c2d3e-0000-4000-8000-00000000a11c";
const outlineId = "0b6a3c1e-9d54-4c7e-8a55-1f1f6d3b2a10";

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
  };
  return {
    storage,
    holdNext() {
      hold = deferred();
      return hold;
    },
    failNext: (error: unknown) => failures.push(error),
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
    read: vi.fn(async () => ({ kind: "failed" as const })),
  };
  return {
    transport,
    requests,
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
};

function setup({
  initial = doc("Opened"),
  revision = 8,
  mode = "auto",
  transport,
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

  it("never sends what the server's canonical function refuses, and stops", async () => {
    const { editor, net, controller, coordinator, status } = setup();
    editor.edit({ type: "doc", content: [{ type: "no_such_node" }] });
    await vi.advanceTimersByTimeAsync(1500);
    expect(net.requests).toHaveLength(0);
    expect(coordinator.getState()).toMatchObject({
      phase: "blocked",
      block: { reason: "refused", origin: "local" },
      outcome: { kind: "refused", code: "invalid", sequence: 1 },
    });
    expect(controller.getState().saving).toBeNull();
    editor.edit(doc("Fixed?"));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(net.requests).toHaveLength(0);
    expect(status()).toBe("blocked");
    await controller.dispose();
  });
});

describe("one request at a time", () => {
  it("never has two requests in flight, keeps edits for the next, and never sends a sequence twice", async () => {
    const { editor, net, controller, coordinator } = setup({ mode: "manual" });
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
    expect(parts.status()).toBe("unresolved");
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
      // The newer words are still kept on the device.
      expect(parts.controller.getState().localSequence).toBeGreaterThan(1);
      expect(parts.status()).toBe("unresolved");
      await parts.controller.dispose();
    }
  });

  it("an uncertain answer through the real transport (success without a revision) blocks too", async () => {
    const actions = {
      save: vi.fn(async () => ({ ok: true, message: "Saved" })),
      read: vi.fn(),
    } as unknown as DocumentActions;
    const parts = setup({ transport: actionTransport(actions) });
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
    ["an invalid refusal", { kind: "refused", code: "invalid", problems: [] }, "refused"],
    ["a too_large refusal", { kind: "refused", code: "too_large", bytes: 5, limit: 4 }, "refused"],
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
    expect(parts.status()).toBe("unresolved");
    await parts.controller.dispose();
  });

  it("after a failure that wrote nothing, sends again only on retry()", async () => {
    const parts = await inFlight();
    parts.net.answer((r) => ({ kind: "failed", sequence: r.sequence, uncertain: false }));
    await settle();
    expect(parts.coordinator.getState()).toMatchObject({
      phase: "failed",
      block: null,
      submission: null,
    });
    expect(parts.controller.getState().saving).toBeNull();
    expect(parts.status()).toBe("failed");
    parts.editor.edit(doc("Newer"));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(parts.net.requests).toHaveLength(1);
    const retried = parts.coordinator.retry();
    await settle();
    expect(parts.net.requests).toHaveLength(2);
    expect(parts.net.requests[1]).toMatchObject({ expectedRevision: 8, content: doc("Newer") });
    parts.net.answer();
    await retried;
    expect(parts.coordinator.getState()).toMatchObject({ phase: "idle", revision: 9 });
    expect(parts.status()).toBe("saved");
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
    await vi.advanceTimersByTimeAsync(30_000);
    expect(net.requests).toHaveLength(1);
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
