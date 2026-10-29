import "fake-indexeddb/auto";

import { Editor } from "@tiptap/core";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { labV4Extensions, loadV4 } from "@/features/editor-lab/v4/extensions";
import { documentV4, pointV4, proseV4 } from "@/features/editor-lab/v4/fixtures";
import { caret } from "@/features/editor-lab/v4/testing";
import { resetAccountMemory } from "@/features/offline/account";
import { closeOfflineDb, openOfflineDb } from "@/features/offline/db";
import { editorSource } from "../autosave/editor-adapter";
import { autosaveStatus, jsonEqual, serverSaveStatus } from "../autosave/model";
import type { DocumentTransport } from "../autosave/transport";
import type { JsonValue } from "../json";
import { documentLimits } from "../model";
import { cleanupKind, draftKind } from "../recovery/model";
import {
  confirmDraft,
  inspectRecoveryRecords,
  readDraft,
  refuseDraft,
  settleCleanups,
  writeDraft,
} from "../recovery/store";
import type { EditorSessionState } from "./model";
import type { RecoveryInspection, RecoveryToken } from "./resolution";
import { createEditorSession, type EditorSession, type EditorSessionOptions } from "./session";
import {
  fakeBus,
  fakeIdentity,
  fakeLink,
  fakeLocks,
  fakePage,
  fakeServer,
  fakeSource,
} from "./testing";
import { sessionWriteGuard } from "./write-guard";

/*
 * Recovery resolution in editor sessions (A2.3C, checkpoints C.3–C.5):
 * pretend tabs sharing stand-in Web Locks and a BroadcastChannel, the real
 * recovery store (fake-indexeddb), the real controller and coordinator, and
 * a server that writes only at the revision a save names. Only `setTimeout`
 * is faked. Every test also checks that no two sessions edit at once.
 */

const owner = "4f1c2d3e-0000-4000-8000-00000000a11c";
const outlineId = "0b6a3c1e-9d54-4c7e-8a55-1f1f6d3b2a10";
const old1 = "c0ffee00-0000-4000-8000-000000000d01";
const old2 = "c0ffee00-0000-4000-8000-000000000d02";
const R0 = 8;

const doc = (words: string) => documentV4([pointV4("p-1", "Grace", 1), proseV4(words, 1)]);
const equal = (a: unknown, b: unknown) => jsonEqual(a as JsonValue, b as JsonValue);
const has = (json: unknown, words: string) => JSON.stringify(json).includes(words);

async function drain(rounds = 30) {
  for (let i = 0; i < rounds; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
    await vi.advanceTimersByTimeAsync(0);
  }
}
async function advance(ms: number, step = 500) {
  for (let passed = 0; passed < ms; passed += step) {
    await vi.advanceTimersByTimeAsync(Math.min(step, ms - passed));
    await drain(4);
  }
  await drain();
}

function world() {
  return {
    locks: fakeLocks(),
    bus: fakeBus(),
    net: fakeServer(doc("Opened"), R0),
    identity: fakeIdentity("clerk-a"),
    link: fakeLink(),
  };
}
type World = ReturnType<typeof world>;

let opened: EditorSession[] = [];
let violations: string[] = [];
function checkWriters() {
  const writers = new Map<string, number>();
  for (const session of opened) {
    if (!session.canEdit()) continue;
    const key = `${session.owner}:${session.outlineId}`;
    writers.set(key, (writers.get(key) ?? 0) + 1);
  }
  for (const [key, count] of writers) if (count > 1) violations.push(`${count} writers on ${key}`);
}

/** Reads the test holds until it lets them go (`release`). */
function heldReads() {
  const waiting: (() => void)[] = [];
  let holding = false;
  return {
    hold() {
      holding = true;
    },
    release() {
      holding = false;
      while (waiting.length) waiting.shift()!();
    },
    wrap(read: DocumentTransport["read"]): DocumentTransport["read"] {
      return (id) =>
        holding ? new Promise((resolve) => waiting.push(() => resolve(read(id)))) : read(id);
    },
  };
}

function tab(w: World, name: string, extra: Partial<EditorSessionOptions> = {}) {
  let dead = false;
  const reads = heldReads();
  const inner = w.net.transport();
  const transport: DocumentTransport = {
    save: (request) => (dead ? new Promise(() => {}) : inner.save(request)),
    read: reads.wrap((id) => (dead ? new Promise(() => {}) : inner.read(id))),
  };
  const session = createEditorSession({
    owner,
    outlineId,
    identity: w.identity.signal,
    transport,
    connectivity: w.link.connectivity,
    locks: w.locks.forTab(name),
    channel: w.bus.factory(name),
    page: fakePage().target,
    releases: new Map(),
    ...extra,
  });
  opened.push(session);
  session.subscribe(checkWriters);
  return {
    session,
    reads,
    kind: () => session.getState().kind,
    state: () => session.getState(),
    kill() {
      dead = true;
      opened = opened.filter((other) => other !== session);
      w.locks.closeTab(name);
      w.bus.closeTab(name);
    },
  };
}
type Tab = ReturnType<typeof tab>;

async function anOldDraft(draftId: string, words: string, sequence = 3) {
  await writeDraft(owner, { outlineId, draftId, content: doc(words), sequence, baseRevision: R0 });
}

async function inspected(t: Tab): Promise<Extract<RecoveryInspection, { ok: true }>> {
  const inspection = await t.session.inspectRecovery();
  if (!inspection.ok) throw new Error(`inspection failed: ${inspection.reason}`);
  return inspection;
}

/** The head token of the one unit whose head is `draftId`. */
function headOf(inspection: Extract<RecoveryInspection, { ok: true }>, draftId: string) {
  const unit = inspection.units.find((candidate) => candidate.head.draftId === draftId);
  if (!unit) throw new Error(`no unit headed by ${draftId}`);
  return unit.head.token;
}

/** Restores, opens the editor from what was restored, and attaches. */
async function restoreAndAttach(t: Tab, token: RecoveryToken) {
  const result = await t.session.restore(token);
  expect(result.outcome).toBe("restored");
  await drain();
  const state = t.state();
  if (state.kind !== "ready" || !state.restored) throw new Error(`not restored: ${state.kind}`);
  const editor = fakeSource(state.restored.content);
  expect(t.session.attach(editor.source)).toEqual({ ok: true });
  return { editor, restored: state.restored };
}

const draftsNow = async () => (await inspectRecoveryRecords(owner, outlineId)).drafts;

beforeEach(async () => {
  await closeOfflineDb();
  globalThis.indexedDB = new IDBFactory();
  resetAccountMemory();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  opened = [];
  violations = [];
});
afterEach(async () => {
  vi.restoreAllMocks();
  for (const session of opened) void session.dispose();
  await drain();
  vi.useRealTimers();
  await closeOfflineDb();
  expect(violations).toEqual([]);
});

describe("inspection (C.1 in a session)", () => {
  it("shows what the device holds against the verified server, with no content but on request", async () => {
    const w = world();
    await anOldDraft(old1, "Unsaved elsewhere");
    await writeDraft(owner, {
      outlineId,
      draftId: old2,
      content: doc("Opened"),
      sequence: 2,
      baseRevision: R0,
    });
    const a = tab(w, "A");
    await drain();
    expect(a.kind()).toBe("recovery_required");
    const inspection = await inspected(a);
    expect(inspection.server.revision).toBe(R0);
    expect(inspection.units).toHaveLength(1);
    expect(inspection.single).toBe(true);
    expect(inspection.drafts.map((d) => d.kind).sort()).toEqual(["divergent", "equivalent"]);
    expect(JSON.stringify(inspection.units)).not.toContain("Unsaved elsewhere");
    const preview = a.session.previewRecovered(headOf(inspection, old1));
    expect(has(preview, "Unsaved elsewhere")).toBe(true);
    // Inspecting changed nothing.
    expect(a.kind()).toBe("recovery_required");
    expect(await draftsNow()).toHaveLength(2);
    expect(w.net.sent).toHaveLength(0);
  });

  it("refuses outside recovery, and takes no token it did not make or that is spent", async () => {
    const w = world();
    const clean = tab(w, "A");
    await drain();
    expect(await clean.session.inspectRecovery()).toEqual({ ok: false, reason: "state" });
    const forged = Object.freeze({}) as RecoveryToken;
    expect(await clean.session.restore(forged)).toEqual({ outcome: "unknown_token" });
    expect(await clean.session.discard(forged)).toEqual({ outcome: "unknown_token" });
    expect(clean.session.previewRecovered(forged)).toBeNull();
    await clean.session.dispose();

    await anOldDraft(old1, "Unsaved");
    const b = tab(w, "B");
    await drain();
    const first = await inspected(b);
    b.session.recheck();
    await drain();
    // A recheck changes course: the earlier review's tokens are spent.
    expect(await b.session.restore(headOf(first, old1))).toEqual({ outcome: "unknown_token" });
    expect(await readDraft(owner, { outlineId, draftId: old1 })).toMatchObject({ status: "ok" });
  });

  it("never takes a failed listing as nothing to recover", async () => {
    const w = world();
    await anOldDraft(old1, "Unsaved");
    let fail = false;
    const a = tab(w, "A", {
      inspectDrafts: (...args) =>
        fail ? Promise.reject(new Error("boom")) : inspectRecoveryRecords(...args),
    });
    await drain();
    expect(a.kind()).toBe("recovery_required");
    fail = true;
    expect(await a.session.inspectRecovery()).toEqual({
      ok: false,
      reason: "inspection_failed",
      error: "failed",
    });
    // And opening with no listing is blocked, never clear.
    a.session.recheck();
    await drain();
    expect(a.state()).toMatchObject({ kind: "recovery_required", reason: "inspection_failed" });
    expect(a.session.canEdit()).toBe(false);
  });
});

describe("restoring (C.3)", () => {
  it("keeps the restored work durably first, then edits and saves it conditionally, never as saved before the server says", async () => {
    const w = world();
    await anOldDraft(old1, "Recovered words");
    const a = tab(w, "A");
    await drain();
    const { editor, restored } = await restoreAndAttach(a, headOf(await inspected(a), old1));
    expect(a.kind()).toBe("active");
    expect(restored.from).toBe(old1);
    // Durable before ready: the new draft is this session's own, at sequence 1, naming its origin.
    const adopted = await readDraft(owner, { outlineId, draftId: restored.draftId });
    if (adopted?.status !== "ok") throw new Error();
    expect(adopted.draft).toMatchObject({ sequence: 1, baseRevision: R0 });
    expect(adopted.draft.adoption?.lineage[0].draftId).toBe(old1);
    // Unsaved work, kept on the device: never "saved", never "unchanged".
    const auto = a.session.getAutosave()!;
    expect(auto.controller.draftId).toBe(restored.draftId);
    expect(autosaveStatus(auto.controller.getState())).toBe("local");
    expect(serverSaveStatus(auto.controller.getState(), auto.coordinator.getState())).toBe(
      "waiting",
    );
    // The original is kept.
    expect(await readDraft(owner, { outlineId, draftId: old1 })).toMatchObject({ status: "ok" });

    // Ordinary editing, then the normal conditional save.
    editor.edit(doc("Recovered words, and more"));
    await advance(12_000);
    expect(w.net.server.revision).toBe(R0 + 1);
    expect(has(w.net.server.content, "Recovered words, and more")).toBe(true);
    expect(w.net.sent.every((request) => request.expectedRevision === R0)).toBe(true);
    expect(w.net.sent).toHaveLength(1);
    expect(serverSaveStatus(auto.controller.getState(), auto.coordinator.getState())).toBe("saved");
    // The confirmation was the evidence: the original and the marker are gone.
    expect(await readDraft(owner, { outlineId, draftId: old1 })).toBeNull();
    expect(await draftsNow()).toHaveLength(0);
    expect(
      await (
        await openOfflineDb()
      ).get("accountData", [owner, cleanupKind, `${outlineId}:${restored.draftId}`]),
    ).toBeUndefined();

    // The next session opens clear.
    await a.session.dispose();
    const b = tab(w, "B");
    await drain();
    expect(b.kind()).toBe("ready");
  });

  it("saves restored work with no edit at all, once, through the same timers", async () => {
    const w = world();
    await anOldDraft(old1, "Recovered words");
    const a = tab(w, "A");
    await drain();
    await restoreAndAttach(a, headOf(await inspected(a), old1));
    await advance(1_000);
    expect(w.net.sent).toHaveLength(0);
    await advance(2_000);
    expect(w.net.sent).toHaveLength(1);
    expect(has(w.net.server.content, "Recovered words")).toBe(true);
    await advance(30_000, 5_000);
    expect(w.net.sent).toHaveLength(1);
  });

  it("refuses an editor that does not hold the restored document", async () => {
    const w = world();
    await anOldDraft(old1, "Recovered words");
    const a = tab(w, "A");
    await drain();
    expect((await a.session.restore(headOf(await inspected(a), old1))).outcome).toBe("restored");
    const state = a.state();
    if (state.kind !== "ready") throw new Error();
    expect(a.session.attach(fakeSource(state.base.content).source)).toEqual({
      ok: false,
      reason: "mismatch",
    });
    expect(a.session.canEdit()).toBe(false);
  });

  it("restores an oversized draft, keeps it on the device, and never sends it until it fits", async () => {
    const w = world();
    await writeDraft(owner, {
      outlineId,
      draftId: old1,
      content: doc("z".repeat(documentLimits.bytes + 100)),
      sequence: 2,
      baseRevision: R0,
    });
    const a = tab(w, "A");
    await drain();
    const inspection = await inspected(a);
    expect(inspection.units[0].head.restorable).toMatchObject({ ok: true, oversized: true });
    const { editor, restored } = await restoreAndAttach(a, headOf(inspection, old1));
    expect(restored.oversized).toBe(true);
    const auto = a.session.getAutosave()!;
    expect(autosaveStatus(auto.controller.getState())).toBe("attention");
    await advance(20_000, 2_000);
    expect(w.net.sent).toHaveLength(0);
    // Trimmed below the limit: saved as usual.
    editor.edit(doc("Trimmed"));
    await advance(12_000);
    expect(w.net.sent).toHaveLength(1);
    expect(has(w.net.server.content, "Trimmed")).toBe(true);
  });

  it("refuses a draft the document core refuses, and keeps it", async () => {
    const w = world();
    await writeDraft(owner, {
      outlineId,
      draftId: old1,
      content: { type: "doc", content: [{ type: "nonsense" }] },
      sequence: 2,
      baseRevision: R0,
    });
    const a = tab(w, "A");
    await drain();
    const inspection = await inspected(a);
    expect(inspection.units[0].restorable).toBe(false);
    expect(a.session.previewRecovered(headOf(inspection, old1))).toBeNull();
    expect(await a.session.restore(headOf(inspection, old1))).toEqual({
      outcome: "not_restorable",
    });
    await drain();
    expect(a.kind()).toBe("recovery_required");
    expect(await readDraft(owner, { outlineId, draftId: old1 })).toMatchObject({ status: "ok" });
  });

  it("requires every other divergent draft to be resolved first, and discards only what was reviewed", async () => {
    const w = world();
    await anOldDraft(old1, "First words");
    await anOldDraft(old2, "Second words");
    const a = tab(w, "A");
    await drain();
    let inspection = await inspected(a);
    expect(inspection.single).toBe(false);
    expect(await a.session.restore(headOf(inspection, old1))).toEqual({
      outcome: "other_candidates",
    });
    await drain();
    expect(a.kind()).toBe("recovery_required");
    expect(await draftsNow()).toHaveLength(2);

    inspection = await inspected(a);
    expect(await a.session.discard(headOf(inspection, old2))).toEqual({ outcome: "discarded" });
    await drain();
    expect(await readDraft(owner, { outlineId, draftId: old2 })).toBeNull();
    expect(await readDraft(owner, { outlineId, draftId: old1 })).toMatchObject({ status: "ok" });
    inspection = await inspected(a);
    expect(inspection.single).toBe(true);
    await restoreAndAttach(a, headOf(inspection, old1));
    expect(a.kind()).toBe("active");
  });

  it("refuses an approval for a draft that changed after it was reviewed, to restore or to discard", async () => {
    const w = world();
    await anOldDraft(old1, "Reviewed words");
    const a = tab(w, "A");
    await drain();
    let inspection = await inspected(a);
    // The draft is written again (a late operation of its own controller) after the review.
    await refuseDraft(owner, {
      outlineId,
      draftId: old1,
      sequence: 3,
      code: "stale",
      revision: R0,
    });
    expect(await a.session.restore(headOf(inspection, old1))).toEqual({ outcome: "changed" });
    await drain();
    expect(a.kind()).toBe("recovery_required");
    inspection = await inspected(a);
    await anOldDraft(old1, "Newer words", 4);
    expect(await a.session.discard(headOf(inspection, old1))).toEqual({ outcome: "changed" });
    await drain();
    expect(await readDraft(owner, { outlineId, draftId: old1 })).toMatchObject({ status: "ok" });
    expect((await draftsNow()).filter((d) => d.read.status === "ok")).toHaveLength(1);
  });

  it("looks again when the server's document moved on after the review", async () => {
    const w = world();
    await anOldDraft(old1, "Reviewed words");
    const a = tab(w, "A");
    await drain();
    const inspection = await inspected(a);
    w.net.external(doc("Saved elsewhere"));
    expect(await a.session.restore(headOf(inspection, old1))).toEqual({
      outcome: "server_changed",
    });
    await drain();
    const state = a.state();
    expect(state.kind).toBe("recovery_required");
    if (state.kind === "recovery_required") expect(state.base.revision).toBe(R0 + 1);
    expect(await draftsNow()).toHaveLength(1);
    expect(w.net.sent).toHaveLength(0);
  });

  it("keeps the draft when the authenticated read fails, and says so", async () => {
    const w = world();
    await anOldDraft(old1, "Reviewed words");
    const a = tab(w, "A");
    await drain();
    const inspection = await inspected(a);
    w.net.answerReads({ kind: "unauthorized" });
    expect(await a.session.restore(headOf(inspection, old1))).toEqual({
      outcome: "read_failed",
      reason: "unauthorized",
    });
    expect(a.state()).toEqual({ kind: "verification_failed", reason: "unauthorized" });
    w.net.answerReads({ kind: "missing" });
    a.session.recheck();
    await drain();
    expect(a.state()).toEqual({ kind: "verification_failed", reason: "missing" });
    expect(await draftsNow()).toHaveLength(1);
  });

  it("keeps everything when the device cannot keep the restored work", async () => {
    const w = world();
    await anOldDraft(old1, "Reviewed words");
    const a = tab(w, "A");
    await drain();
    const inspection = await inspected(a);
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    expect(await a.session.restore(headOf(inspection, old1))).toEqual({
      outcome: "storage_failed",
      error: "quota",
    });
    vi.restoreAllMocks();
    await drain();
    expect(a.kind()).toBe("recovery_required");
    expect(await draftsNow()).toHaveLength(1);
    expect(a.session.canEdit()).toBe(false);
  });

  it("declines a takeover while resolving, and ends on an account change or a lost lock without editing", async () => {
    const w = world();
    await anOldDraft(old1, "Reviewed words");
    const a = tab(w, "A");
    await drain();
    const inspection = await inspected(a);
    a.reads.hold();
    const pending = a.session.restore(headOf(inspection, old1));
    await drain();
    expect(a.state()).toEqual({ kind: "resolving", action: "restore" });
    const b = tab(w, "B");
    await drain();
    b.session.requestTakeover();
    await drain();
    expect(b.state()).toEqual({ kind: "read_only", takeover: "declined", reason: "starting" });

    // The account changes while the read is out: nothing is kept as this session's.
    w.identity.set("clerk-b");
    await drain();
    a.reads.release();
    expect((await pending).outcome).toBe("state");
    await drain();
    expect(a.kind()).toBe("identity_invalidated");
    expect(await draftsNow()).toHaveLength(1);
  });

  it("leaves nothing half done when the tab dies mid-restore, and the next session finds the original", async () => {
    const w = world();
    await anOldDraft(old1, "Reviewed words");
    const a = tab(w, "A");
    await drain();
    const inspection = await inspected(a);
    a.reads.hold();
    void a.session.restore(headOf(inspection, old1));
    await drain();
    a.kill();
    await drain();
    expect(await draftsNow()).toHaveLength(1);
    const b = tab(w, "B");
    await drain();
    expect(b.kind()).toBe("recovery_required");
    expect((await inspected(b)).units[0].head.draftId).toBe(old1);
  });
});

describe("lineage across interruptions (C.4)", () => {
  it("resumes restored work after a crash without discarding what it came from, over several generations", async () => {
    const w = world();
    await anOldDraft(old1, "Original words");
    const a = tab(w, "A");
    await drain();
    w.net.hold();
    const first = await restoreAndAttach(a, headOf(await inspected(a), old1));
    // Crash straight after the durable adoption, before any save lands.
    a.kill();
    await drain();

    const b = tab(w, "B");
    await drain();
    expect(b.kind()).toBe("recovery_required");
    let inspection = await inspected(b);
    expect(inspection.units).toHaveLength(1);
    expect(inspection.single).toBe(true);
    expect(inspection.units[0].head.draftId).toBe(first.restored.draftId);
    expect(inspection.units[0].ancestors.map((d) => d.draftId)).toEqual([old1]);
    const second = await restoreAndAttach(b, inspection.units[0].head.token);
    b.kill();
    await drain();

    const c = tab(w, "C");
    await drain();
    inspection = await inspected(c);
    expect(inspection.units).toHaveLength(1);
    expect(inspection.units[0].head.draftId).toBe(second.restored.draftId);
    expect(inspection.units[0].ancestors.map((d) => d.draftId)).toEqual([
      first.restored.draftId,
      old1,
    ]);
    // Nothing was ever sent by the dead tabs' held saves that landed.
    for (const attempt of w.net.attempts) attempt.lose();
    await drain();
    w.net.attempts.length = 0;
    // An unrelated draft appears: now the person must resolve it first.
    await anOldDraft(old2, "Unrelated");
    c.session.recheck();
    await drain();
    inspection = await inspected(c);
    expect(inspection.units).toHaveLength(2);
    expect(await c.session.restore(headOf(inspection, second.restored.draftId))).toEqual({
      outcome: "other_candidates",
    });
    await drain();
    inspection = await inspected(c);
    expect((await c.session.discard(headOf(inspection, old2))).outcome).toBe("discarded");
    await drain();
    inspection = await inspected(c);
    const third = await restoreAndAttach(c, headOf(inspection, second.restored.draftId));
    expect(c.kind()).toBe("active");
    // The lineage is all three generations; all retained until a confirmation.
    const head = await readDraft(owner, { outlineId, draftId: third.restored.draftId });
    if (head?.status !== "ok") throw new Error();
    expect(head.draft.adoption?.lineage.map((link) => link.draftId)).toEqual([
      second.restored.draftId,
      first.restored.draftId,
      old1,
    ]);
    expect(await draftsNow()).toHaveLength(4);
  });

  it("keeps the original through a new conflict, never overwriting what landed meanwhile", async () => {
    const w = world();
    await anOldDraft(old1, "Original words");
    const a = tab(w, "A");
    await drain();
    const { restored } = await restoreAndAttach(a, headOf(await inspected(a), old1));
    // Someone else's save lands first.
    w.net.external(doc("Landed elsewhere"));
    await advance(12_000);
    const auto = a.session.getAutosave()!;
    expect(auto.coordinator.getState().phase).toBe("blocked");
    expect(auto.coordinator.getState().block?.reason).toBe("conflict");
    expect(has(w.net.server.content, "Landed elsewhere")).toBe(true);
    expect(w.net.server.writes).toBe(1);
    // Both kept: the restored work (refused, stale) and its original.
    const adopted = await readDraft(owner, { outlineId, draftId: restored.draftId });
    if (adopted?.status !== "ok") throw new Error();
    expect(adopted.draft.refusal?.code).toBe("stale");
    expect(await readDraft(owner, { outlineId, draftId: old1 })).toMatchObject({ status: "ok" });
    await a.session.dispose();
    const b = tab(w, "B");
    await drain();
    const inspection = await inspected(b);
    expect(inspection.units).toHaveLength(1);
    expect(inspection.units[0].head).toMatchObject({
      draftId: restored.draftId,
      status: "conflict",
    });
  });

  it("lets an earlier session's late commit win, as a conflict, with no overwrite and no third write", async () => {
    const w = world();
    const a = tab(w, "A");
    await drain();
    const state = a.state();
    if (state.kind !== "ready") throw new Error();
    const editor = fakeSource(state.base.content);
    a.session.attach(editor.source);
    w.net.hold();
    editor.edit(doc("First tab words"));
    await advance(12_000);
    expect(w.net.attempts).toHaveLength(1);
    a.kill();
    await drain();

    const b = tab(w, "B");
    await drain();
    expect(b.kind()).toBe("recovery_required");
    const restored = await restoreAndAttach(b, (await inspected(b)).units[0].head.token);
    // The dead tab's request lands now.
    const late = w.net.attempts.shift()!;
    late.commit();
    restored.editor.edit(doc("First tab words, continued"));
    await advance(15_000);
    for (const attempt of w.net.attempts.splice(0)) attempt.respond(attempt.commit());
    await advance(60_000, 5_000);
    expect(w.net.server.writes).toBe(1);
    expect(has(w.net.server.content, "First tab words")).toBe(true);
    expect(has(w.net.server.content, "continued")).toBe(false);
    const auto = b.session.getAutosave()!;
    expect(auto.coordinator.getState().phase).toBe("blocked");
    // The restored work and its original are both still on the device.
    expect((await draftsNow()).filter((d) => d.read.status === "ok")).toHaveLength(2);
    // At most two requests for any one submission (the save and its one conditional retry).
    const bySequence = new Map<string, number>();
    for (const request of w.net.sent.slice(1)) {
      const key = String(request.sequence);
      bySequence.set(key, (bySequence.get(key) ?? 0) + 1);
    }
    for (const count of bySequence.values()) expect(count).toBeLessThanOrEqual(2);
  });

  it("finishes a cleanup interrupted after the confirmation, when the next session opens", async () => {
    const w = world();
    await anOldDraft(old1, "Original words");
    const a = tab(w, "A", {
      autosave: {
        storage: {
          writeDraft,
          confirmDraft,
          refuseDraft,
          settleCleanups: () => Promise.reject(new Error("interrupted")),
        },
      },
    });
    await drain();
    const { restored } = await restoreAndAttach(a, headOf(await inspected(a), old1));
    await advance(12_000);
    expect(w.net.server.revision).toBe(R0 + 1);
    // Confirmed: the evidence is kept, the original not yet removed.
    const db = await openOfflineDb();
    expect(
      await db.get("accountData", [owner, cleanupKind, `${outlineId}:${restored.draftId}`]),
    ).toBeDefined();
    expect(await readDraft(owner, { outlineId, draftId: old1 })).toMatchObject({ status: "ok" });
    await a.session.dispose();

    const b = tab(w, "B");
    await drain();
    expect(b.kind()).toBe("ready");
    expect(await draftsNow()).toHaveLength(0);
    expect(
      await db.get("accountData", [owner, cleanupKind, `${outlineId}:${restored.draftId}`]),
    ).toBeUndefined();
  });

  it("records a confirmation whose transaction failed again, without another request", async () => {
    const w = world();
    await anOldDraft(old1, "Original words");
    let failures = 1;
    const a = tab(w, "A", {
      autosave: {
        storage: {
          writeDraft,
          refuseDraft,
          settleCleanups,
          confirmDraft: (...args) =>
            failures-- > 0 ? Promise.reject(new Error("interrupted")) : confirmDraft(...args),
        },
      },
    });
    await drain();
    await restoreAndAttach(a, headOf(await inspected(a), old1));
    await advance(12_000);
    expect(w.net.sent).toHaveLength(1);
    // The retry runs right after the failure, locally.
    expect(await draftsNow()).toHaveLength(0);
    expect(w.net.sent).toHaveLength(1);
  });

  it("keeps the restored work discoverable when a tab closes after restoring but before attaching", async () => {
    const w = world();
    await anOldDraft(old1, "Original words");
    const a = tab(w, "A");
    await drain();
    expect((await a.session.restore(headOf(await inspected(a), old1))).outcome).toBe("restored");
    await a.session.dispose();
    const b = tab(w, "B");
    await drain();
    const inspection = await inspected(b);
    expect(inspection.units).toHaveLength(1);
    expect(inspection.units[0].ancestors.map((d) => d.draftId)).toEqual([old1]);
  });

  it("never lets an unrelated candidate be removed by a restore or its cleanup", async () => {
    const w = world();
    await anOldDraft(old1, "Original words");
    await writeDraft(owner, {
      outlineId,
      draftId: old2,
      content: doc("Opened"),
      sequence: 2,
      baseRevision: R0,
    });
    const a = tab(w, "A");
    await drain();
    await restoreAndAttach(a, headOf(await inspected(a), old1));
    await advance(12_000);
    expect(await readDraft(owner, { outlineId, draftId: old1 })).toBeNull();
    // The equivalent unrelated draft is untouched.
    expect(await readDraft(owner, { outlineId, draftId: old2 })).toMatchObject({ status: "ok" });
    const records = await (await openOfflineDb()).getAll("accountData");
    expect(records.filter((r) => r.kind === draftKind)).toHaveLength(1);
  });
});

describe("a restored sermon in a real editor (C.3 gate)", () => {
  const editors: Editor[] = [];
  afterEach(() => {
    while (editors.length) editors.pop()!.destroy();
  });

  it("is loaded as a fresh state, edited, undone, redone, and saved conditionally, with the write guard in force", async () => {
    const w = world();
    await writeDraft(owner, {
      outlineId,
      draftId: old1,
      content: documentV4([pointV4("p-1", "Grace", 1), proseV4("Recovered prose", 1)]),
      sequence: 2,
      baseRevision: R0,
    });
    const a = tab(w, "A");
    await drain();
    let session = a.session;
    let next = 0;
    const editor = new Editor({
      element: document.createElement("div"),
      extensions: [
        ...labV4Extensions({ newId: () => `new-${(next += 1)}` }),
        sessionWriteGuard(() => session.canEdit()),
      ],
    });
    editors.push(editor);
    session = a.session;
    const result = await a.session.restore(headOf(await inspected(a), old1));
    if (result.outcome !== "restored") throw new Error(result.outcome);
    await drain();
    // Loading replaces the state (no transaction through the guard, no history).
    expect(loadV4(editor, result.restored.content, "doc").ok).toBe(true);
    expect(editor.can().undo()).toBe(false);
    // Not editable before attach: the guard refuses a change.
    caret(editor, "p-1", 0);
    editor.view.dispatch(editor.state.tr.insertText("X"));
    expect(has(editor.getJSON(), "XGrace")).toBe(false);
    expect(a.session.attach(editorSource(editor))).toEqual({ ok: true });

    caret(editor, "p-1", 0);
    editor.view.dispatch(editor.state.tr.insertText("Amazing "));
    expect(has(editor.getJSON(), "Amazing Grace")).toBe(true);
    editor.commands.undo();
    expect(has(editor.getJSON(), "Amazing")).toBe(false);
    // Undo stops at the restored document: it never takes the restore back.
    expect(editor.can().undo()).toBe(false);
    expect(has(editor.getJSON(), "Recovered prose")).toBe(true);
    editor.commands.redo();
    expect(has(editor.getJSON(), "Amazing Grace")).toBe(true);
    await advance(12_000);
    expect(w.net.sent).toHaveLength(1);
    expect(w.net.sent[0].expectedRevision).toBe(R0);
    expect(has(w.net.server.content, "Amazing Grace")).toBe(true);
    expect(has(w.net.server.content, "Recovered prose")).toBe(true);
    const auto = a.session.getAutosave()!;
    expect(serverSaveStatus(auto.controller.getState(), auto.coordinator.getState())).toBe("saved");
    expect(await draftsNow()).toHaveLength(0);
  });
});

describe("the controller's resume option (C.3)", () => {
  it("starts from the adopted snapshot as kept, unsaved, claimable work; without it, nothing changes", async () => {
    const { createAutosaveController } = await import("../autosave/controller");
    const source = fakeSource(doc("Adopted"));
    const resumed = createAutosaveController({
      owner,
      outlineId,
      revision: R0,
      source: source.source,
      resume: { draftId: old1, sequence: 1 },
    });
    expect(resumed.draftId).toBe(old1);
    expect(resumed.getState()).toMatchObject({
      sequence: 1,
      localSequence: 1,
      confirmedSequence: 0,
    });
    expect(autosaveStatus(resumed.getState())).toBe("local");
    expect(resumed.claimSave()).toMatchObject({ sequence: 1, expectedRevision: R0 });
    await resumed.dispose();

    const fresh = createAutosaveController({
      owner,
      outlineId,
      revision: R0,
      source: fakeSource(doc("Opened")).source,
    });
    expect(fresh.draftId).not.toBe(old1);
    expect(autosaveStatus(fresh.getState())).toBe("unchanged");
    expect(fresh.claimSave()).toBeNull();
    await fresh.dispose();

    expect(() =>
      createAutosaveController({
        owner,
        outlineId,
        revision: R0,
        source: source.source,
        resume: { draftId: "not-a-uuid", sequence: 1 },
      }),
    ).toThrow();
  });
});

// Keep the state type in use for readers of these tests.
export type { EditorSessionState };
void equal;
