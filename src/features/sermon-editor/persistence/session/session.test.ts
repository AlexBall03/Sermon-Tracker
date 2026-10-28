import "fake-indexeddb/auto";

import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { documentV4, pointV4, proseV4 } from "@/features/editor-lab/v4/fixtures";
import { resetAccountMemory } from "@/features/offline/account";
import { closeOfflineDb, openOfflineDb } from "@/features/offline/db";
import type { DraftStorage } from "../autosave/controller";
import { holdsUnsavedWork } from "./model";
import { jsonEqual, serverSaveStatus } from "../autosave/model";
import type { DocumentTransport } from "../autosave/transport";
import type { JsonValue } from "../json";
import { draftKind } from "../recovery/model";
import {
  confirmDraft,
  discardDraft,
  DraftStorageError,
  listDrafts,
  readDraft,
  refuseDraft,
  writeDraft,
} from "../recovery/store";
import type { EditorSessionState } from "./model";
import type { ReleaseRegistry } from "./ownership";
import { createEditorSession, type EditorSession, type EditorSessionOptions } from "./session";
import {
  canonical,
  fakeBus,
  fakeIdentity,
  fakeLink,
  fakeLocks,
  fakePage,
  fakeServer,
  fakeSource,
} from "./testing";

/*
 * Editor sessions (A2.3B.3): pretend tabs of one browser profile sharing
 * stand-in Web Locks, a BroadcastChannel, and the real recovery store
 * (fake-indexeddb), each with the real autosave controller and save
 * coordinator, against a server that writes only at the revision a save
 * names. Only `setTimeout` is faked, so IndexedDB keeps its real ordering.
 * Every test also checks that no two sessions of one account and outline may
 * edit at once.
 */

const owner = "4f1c2d3e-0000-4000-8000-00000000a11c";
const owner2 = "9a8b7c6d-0000-4000-8000-00000000b22d";
const outlineId = "0b6a3c1e-9d54-4c7e-8a55-1f1f6d3b2a10";
const otherOutline = "7d3e9a10-1b2c-4d5e-8f60-718293a4b5c6";
const foreignDraft = "c0ffee00-0000-4000-8000-000000000d01";
const R0 = 8;

const doc = (words: string) => documentV4([pointV4("p-1", "Grace", 1), proseV4(words, 1)]);
const equal = (a: unknown, b: unknown) => jsonEqual(a as JsonValue, b as JsonValue);

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

function world({ manual = false } = {}) {
  return {
    locks: fakeLocks({ manual }),
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

type TabOptions = Partial<EditorSessionOptions> & { releases?: ReleaseRegistry };

/** A pretend tab. `kill()` ends it as a crash does: nothing of it runs or answers again. */
function tab(w: World, name: string, extra: TabOptions = {}) {
  const page = fakePage();
  let dead = false;
  const inner = w.net.transport();
  const transport: DocumentTransport = {
    save: (request) => (dead ? new Promise(() => {}) : inner.save(request)),
    read: (id) => (dead ? new Promise(() => {}) : inner.read(id)),
  };
  const session = createEditorSession({
    owner,
    outlineId,
    identity: w.identity.signal,
    transport,
    connectivity: w.link.connectivity,
    locks: w.locks.forTab(name),
    channel: w.bus.factory(name),
    page: page.target,
    releases: new Map(),
    ...extra,
  });
  opened.push(session);
  session.subscribe(checkWriters);
  return {
    session,
    page,
    name,
    kind: () => session.getState().kind,
    kill() {
      dead = true;
      // A crashed tab runs nothing: its session object is no longer anyone's editor.
      opened = opened.filter((other) => other !== session);
      w.locks.closeTab(name);
      w.bus.closeTab(name);
    },
  };
}
type Tab = ReturnType<typeof tab>;

/** Opens the editor from the verified base and attaches it. */
function attach(t: Tab) {
  const state = t.session.getState();
  if (state.kind !== "ready") throw new Error(`not ready: ${state.kind}`);
  const editor = fakeSource(state.base.content);
  expect(t.session.attach(editor.source)).toEqual({ ok: true });
  expect(t.kind()).toBe("active");
  return editor;
}

/** An edit as the write guard would let it through: only while the session may edit. */
function type(t: Tab, editor: ReturnType<typeof fakeSource>, words: string) {
  if (!t.session.canEdit()) return false;
  editor.edit(doc(words));
  return true;
}

const savesOf = (w: World, words: string) =>
  w.net.sent.filter((request) => JSON.stringify(request.content).includes(words));

async function aForeignDraft(words: string, sequence = 3) {
  await writeDraft(owner, {
    outlineId,
    draftId: foreignDraft,
    content: doc(words),
    sequence,
    baseRevision: R0,
  });
}

beforeEach(async () => {
  await closeOfflineDb();
  globalThis.indexedDB = new IDBFactory();
  resetAccountMemory();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  opened = [];
  violations = [];
});

afterEach(async () => {
  for (const session of opened) void session.dispose();
  await drain();
  vi.useRealTimers();
  await closeOfflineDb();
  expect(violations).toEqual([]);
});

describe("exclusive ownership (checkpoint B)", () => {
  it("lets the first tab edit; a second is read only and never becomes editable by itself", async () => {
    const w = world();
    const a = tab(w, "A");
    await drain();
    attach(a);
    const b = tab(w, "B");
    await drain();
    expect(b.session.getState()).toEqual({ kind: "read_only", takeover: "available" });
    expect(b.session.canEdit()).toBe(false);
    expect(b.session.attach(fakeSource(doc("Opened")).source)).toEqual({
      ok: false,
      reason: "state",
    });

    // The editing tab ends, cleanly or by crashing: the other stays read only.
    await a.session.dispose();
    await advance(60_000, 5_000);
    expect(b.kind()).toBe("read_only");
    const c = tab(w, "C");
    await drain();
    attach(c);
    c.kill();
    await advance(60_000, 5_000);
    expect(b.kind()).toBe("read_only");
    expect(b.session.canEdit()).toBe(false);

    // Only "Edit here" makes it an editor, through verification.
    b.session.requestTakeover();
    await drain();
    expect(b.kind()).toBe("ready");
  });

  it("grants one of two tabs opened at the same moment", async () => {
    const w = world();
    const a = tab(w, "A");
    const b = tab(w, "B");
    await drain();
    expect([a.kind(), b.kind()].sort()).toEqual(["read_only", "ready"]);
  });

  it("keeps other outlines and other accounts apart", async () => {
    const w = world();
    const a = tab(w, "A");
    const other = tab(w, "B", { outlineId: otherOutline });
    const second = fakeIdentity("clerk-b");
    const account = tab(w, "C", { owner: owner2, identity: second.signal });
    await drain();
    expect(a.kind()).toBe("ready");
    expect(other.kind()).toBe("ready");
    expect(account.kind()).toBe("ready");
  });

  it("makes a second editor in the same tab read only", async () => {
    const w = world();
    const releases: ReleaseRegistry = new Map();
    const first = tab(w, "A", { releases });
    await drain();
    attach(first);
    const second = tab(w, "A", { releases });
    await drain();
    expect(second.kind()).toBe("read_only");
  });

  it("survives Strict Mode: mount, unmount, mount gives one editor", async () => {
    const w = world();
    const releases: ReleaseRegistry = new Map();
    const first = tab(w, "A", { releases });
    const ended = first.session.dispose();
    const second = tab(w, "A", { releases });
    await drain();
    await ended;
    expect(first.kind()).toBe("disposed");
    expect(second.kind()).toBe("ready");
    // The first one's cleanup, again, frees nothing of the second's.
    await first.session.dispose();
    await drain();
    expect(w.locks.holder(`sermon-tracker-editor:${owner}:${outlineId}`)).toBe("A");
    attach(second);
    expect(second.session.canEdit()).toBe(true);
  });

  it("never activates a session disposed before its lock was granted", async () => {
    const w = world({ manual: true });
    const a = tab(w, "A");
    await drain();
    void a.session.dispose();
    for (let i = 0; i < 5; i += 1) {
      w.locks.grant();
      await drain(2);
    }
    expect(a.kind()).toBe("disposed");
    expect(w.locks.holder(`sermon-tracker-editor:${owner}:${outlineId}`)).toBeNull();
  });

  it("is unavailable, never an unguarded editor, without working Web Locks", async () => {
    const w = world();
    const none = tab(w, "A", { locks: null });
    const broken = tab(w, "B", {
      locks: {
        request: () => {
          throw new Error("SecurityError");
        },
      },
    });
    await drain();
    expect(none.session.getState()).toEqual({ kind: "unavailable", reason: "unsupported" });
    expect(broken.session.getState()).toEqual({ kind: "unavailable", reason: "failed" });
    expect(none.session.canEdit()).toBe(false);
    expect(broken.session.canEdit()).toBe(false);
    expect(none.session.attach(fakeSource(doc("Opened")).source).ok).toBe(false);
  });

  it("lets the lock be taken again once released", async () => {
    const w = world();
    const a = tab(w, "A");
    await drain();
    attach(a);
    await a.session.dispose();
    const c = tab(w, "C");
    await drain();
    expect(c.kind()).toBe("ready");
  });
});

describe("recovery clearance", () => {
  it("blocks editing and saving on a different draft from another session, and keeps it", async () => {
    const w = world();
    await aForeignDraft("Unsaved elsewhere");
    const a = tab(w, "A");
    await drain();
    const state = a.session.getState();
    expect(state.kind).toBe("recovery_required");
    if (state.kind !== "recovery_required" || state.reason !== "drafts") throw new Error();
    expect(state.candidates).toEqual([
      expect.objectContaining({ status: "pending", draftId: foreignDraft, sequence: 3 }),
    ]);
    // No content of the draft in the state.
    expect(JSON.stringify(state.candidates)).not.toContain("Unsaved elsewhere");
    expect(a.session.canEdit()).toBe(false);
    expect(a.session.attach(fakeSource(state.base.content).source).ok).toBe(false);
    expect(a.session.getAutosave()).toBeNull();
    await advance(30_000, 5_000);
    expect(w.net.sent).toHaveLength(0);
    expect(a.kind()).toBe("recovery_required");
    expect((await readDraft(owner, { outlineId, draftId: foreignDraft }))?.status).toBe("ok");

    // Only once the person resolved it (here, discarded) and asked again.
    await discardDraft(owner, { outlineId, draftId: foreignDraft, sequence: 3 });
    a.session.recheck();
    await drain();
    expect(a.kind()).toBe("ready");
  });

  it("does not block on a draft equal to the server's document, keeps it, and saves conditionally", async () => {
    const w = world();
    await writeDraft(owner, {
      outlineId,
      draftId: foreignDraft,
      content: w.net.server.content,
      sequence: 2,
      baseRevision: R0 - 1,
    });
    const a = tab(w, "A");
    await drain();
    expect(a.kind()).toBe("ready");
    expect((await readDraft(owner, { outlineId, draftId: foreignDraft }))?.status).toBe("ok");
    const editor = attach(a);
    type(a, editor, "New words");
    await advance(2_500);
    expect(w.net.sent).toHaveLength(1);
    expect(w.net.sent[0].expectedRevision).toBe(R0);
  });

  it("requires clearance after a takeover too: a grant is not enough", async () => {
    const w = world();
    const a = tab(w, "A");
    await drain();
    attach(a);
    // A tab that crashed earlier left words the server does not have.
    await aForeignDraft("Crashed tab's words");
    const b = tab(w, "B");
    await drain();
    b.session.requestTakeover();
    await drain();
    expect(a.session.getState()).toEqual({ kind: "lost", reason: "handedOff" });
    expect(b.kind()).toBe("recovery_required");
    expect(b.session.canEdit()).toBe(false);
  });

  it("blocks on an unreadable or unsupported draft, and leaves both as they are", async () => {
    const w = world();
    const db = await openOfflineDb();
    const unreadable = `${outlineId}:${"d0d0d0d0-0000-4000-8000-000000000001"}`;
    const unsupported = `${outlineId}:${"d0d0d0d0-0000-4000-8000-000000000002"}`;
    await db.put("accountData", {
      owner,
      kind: draftKind,
      id: unreadable,
      data: { format: 1, nonsense: true },
      updatedAt: 1,
    });
    await db.put("accountData", {
      owner,
      kind: draftKind,
      id: unsupported,
      data: { format: 99 },
      updatedAt: 1,
    });
    const a = tab(w, "A");
    await drain();
    const state = a.session.getState();
    if (state.kind !== "recovery_required" || state.reason !== "drafts")
      throw new Error(state.kind);
    expect(state.candidates.map((candidate) => candidate.status).sort()).toEqual([
      "unreadable",
      "unsupported",
    ]);
    expect(await listDrafts(owner, outlineId)).toHaveLength(2);
  });

  it("blocks when the drafts cannot be inspected", async () => {
    const w = world();
    const a = tab(w, "A", {
      listDrafts: () => Promise.reject(new DraftStorageError("unavailable")),
    });
    await drain();
    expect(a.session.getState()).toMatchObject({
      kind: "recovery_required",
      reason: "inspection_failed",
      error: "unavailable",
    });
    expect(a.session.canEdit()).toBe(false);
  });

  it("does not edit when the server's document cannot be read, and reads again only when asked", async () => {
    const w = world();
    for (const [answer, reason] of [
      [{ kind: "failed" }, "failed"],
      [{ kind: "missing" }, "missing"],
      [{ kind: "unauthorized" }, "unauthorized"],
      [{ kind: "unreadable", revision: R0 }, "unreadable"],
      [
        { kind: "found", content: { type: "doc", content: [{ type: "nope" }] }, revision: R0 },
        "unreadable",
      ],
    ] as const) {
      w.net.answerReads(answer as never);
      const t = tab(w, `T-${reason}-${opened.length}`);
      await drain();
      expect(t.session.getState()).toEqual({ kind: "verification_failed", reason });
      await t.session.dispose();
    }
    w.link.set(false);
    w.net.answerReads({ kind: "failed" });
    const a = tab(w, "A");
    await drain();
    expect(a.session.getState()).toEqual({ kind: "verification_failed", reason: "offline" });
    await advance(60_000, 10_000);
    expect(a.kind()).toBe("verification_failed");
    w.link.set(true);
    w.net.answerReads(null);
    a.session.recheck();
    await drain();
    expect(a.kind()).toBe("ready");
  });
});

describe("page lifecycle (checkpoint C)", () => {
  it("keeps and saves the newest words when hidden, once, and never on showing", async () => {
    const w = world();
    const a = tab(w, "A");
    await drain();
    const editor = attach(a);
    type(a, editor, "Hidden words");
    a.page.hide();
    await drain();
    expect(savesOf(w, "Hidden words")).toHaveLength(1);
    a.page.hide();
    a.page.hide();
    a.page.show();
    await advance(5_000);
    expect(w.net.sent).toHaveLength(1);
    expect(a.session.getAutosave()?.controller.getState().confirmedSequence).toBe(1);
  });

  it("starts no second request while one is in flight or unresolved", async () => {
    const w = world();
    w.net.hold();
    const a = tab(w, "A");
    await drain();
    const editor = attach(a);
    type(a, editor, "First");
    await advance(2_000);
    expect(w.net.sent).toHaveLength(1);
    type(a, editor, "Second");
    a.page.hide();
    a.page.hide();
    await drain();
    expect(w.net.sent).toHaveLength(1);
    // Unanswered: unresolved, read back, and the one conditional retry; never a third.
    await advance(16_000, 1_000);
    expect(a.session.getAutosave()?.coordinator.getState().phase).toBe("reconciling");
    a.page.hide();
    await advance(5_000);
    expect(savesOf(w, "First").length).toBeLessThanOrEqual(2);
    expect(savesOf(w, "Second")).toHaveLength(0);
  });

  it("never queues a save behind one in flight when hidden", async () => {
    const w = world();
    w.net.hold();
    const a = tab(w, "A");
    await drain();
    const editor = attach(a);
    type(a, editor, "First");
    await advance(2_000);
    expect(w.net.sent).toHaveLength(1);
    type(a, editor, "Second");
    a.page.hide();
    const attempt = w.net.attempts[0];
    attempt.respond(attempt.commit());
    await drain();
    // "Second" goes on the coordinator's own timer, not as a save the lifecycle queued.
    expect(w.net.sent).toHaveLength(1);
    await advance(2_000);
    expect(savesOf(w, "Second")).toHaveLength(1);
  });

  it("sends nothing when hidden offline, and the words hold unsaved work", async () => {
    const w = world();
    const a = tab(w, "A");
    await drain();
    const editor = attach(a);
    w.link.set(false);
    type(a, editor, "Offline words");
    a.page.hide();
    await drain();
    expect(w.net.sent).toHaveLength(0);
    const autosave = a.session.getAutosave()!;
    const status = serverSaveStatus(
      autosave.controller.getState(),
      autosave.coordinator.getState(),
    );
    expect(status).toBe("offline");
    expect(holdsUnsavedWork(status)).toBe(true);
    expect((await listDrafts(owner, outlineId))[0]).toMatchObject({ status: "ok" });
  });

  it("ends on pagehide: last words kept before the lock is released, nothing sent after", async () => {
    const w = world();
    let finishWrite!: () => void;
    const writing = new Promise<void>((resolve) => (finishWrite = resolve));
    const storage: DraftStorage = {
      writeDraft: async (...args) => {
        await writing;
        return writeDraft(...args);
      },
      confirmDraft,
      refuseDraft,
    };
    const a = tab(w, "A", { autosave: { storage } });
    await drain();
    const editor = attach(a);
    const autosave = a.session.getAutosave()!;
    type(a, editor, "Last words");
    a.page.pagehide(true);
    expect(a.session.getState()).toEqual({ kind: "lost", reason: "suspended" });
    expect(a.session.canEdit()).toBe(false);
    // In order: no new request, the last snapshot taken, the lock still held until IndexedDB answers.
    expect(autosave.coordinator.getState().phase).toBe("disposed");
    expect(autosave.controller.getState().disposed).toBe(true);
    await drain();
    expect(w.locks.holder(`sermon-tracker-editor:${owner}:${outlineId}`)).toBe("A");
    finishWrite();
    await drain();
    expect(w.locks.holder(`sermon-tracker-editor:${owner}:${outlineId}`)).toBeNull();
    expect(await listDrafts(owner, outlineId)).toHaveLength(1);
    await advance(20_000, 2_000);
    expect(w.net.sent).toHaveLength(0);

    // Restored from the back-forward cache: still ended; a new session verifies again.
    a.page.pageshow(true);
    expect(a.kind()).toBe("lost");
    const again = tab(w, "A2");
    await drain();
    expect(again.kind()).toBe("recovery_required");
  });

  it("keeps the draft when the editor is left (navigation), then frees the lock", async () => {
    const w = world();
    const a = tab(w, "A");
    await drain();
    const editor = attach(a);
    type(a, editor, "Navigated away");
    await a.session.dispose();
    expect(await listDrafts(owner, outlineId)).toHaveLength(1);
    expect(w.locks.holder(`sermon-tracker-editor:${owner}:${outlineId}`)).toBeNull();
    // Idempotent.
    await a.session.dispose();
    expect(a.kind()).toBe("disposed");
  });

  it("ignores a read that answers after the session was disposed", async () => {
    const w = world();
    let answer!: () => void;
    const transport: DocumentTransport = {
      save: () => new Promise(() => {}),
      read: () =>
        new Promise((resolve) => {
          answer = () => resolve({ kind: "found", content: w.net.server.content, revision: R0 });
        }),
    };
    const a = tab(w, "A", { transport });
    await drain();
    expect(a.kind()).toBe("verifying");
    await a.session.dispose();
    answer();
    await drain();
    expect(a.kind()).toBe("disposed");
    expect(a.session.canEdit()).toBe(false);
    expect(w.locks.holder(`sermon-tracker-editor:${owner}:${outlineId}`)).toBeNull();
  });

  it("never takes a request in flight as cancelled: its late answer still settles its draft", async () => {
    const w = world();
    w.net.hold();
    const a = tab(w, "A");
    await drain();
    const editor = attach(a);
    type(a, editor, "In flight");
    await advance(2_000);
    expect(w.net.attempts).toHaveLength(1);
    await a.session.dispose();
    expect(await listDrafts(owner, outlineId)).toHaveLength(1);
    const attempt = w.net.attempts[0];
    attempt.respond(attempt.commit());
    await drain();
    expect(await listDrafts(owner, outlineId)).toHaveLength(0);
    await advance(30_000, 5_000);
    expect(w.net.sent).toHaveLength(1);
  });
});

describe("takeover (checkpoint D)", () => {
  it("hands over cleanly after a confirmed save", async () => {
    const w = world();
    const a = tab(w, "A");
    await drain();
    const editor = attach(a);
    type(a, editor, "Saved words");
    await advance(2_500);
    expect(w.net.server.revision).toBe(R0 + 1);
    const b = tab(w, "B");
    await drain();
    b.session.requestTakeover();
    expect(b.kind()).toBe("takeover_pending");
    await drain();
    expect(a.session.getState()).toEqual({ kind: "lost", reason: "handedOff" });
    const state = b.session.getState();
    if (state.kind !== "ready") throw new Error(state.kind);
    expect(state.base.revision).toBe(R0 + 1);
    expect(await listDrafts(owner, outlineId)).toHaveLength(0);
  });

  it("keeps and saves words not yet kept before handing over", async () => {
    const w = world();
    const a = tab(w, "A");
    await drain();
    const editor = attach(a);
    const b = tab(w, "B");
    await drain();
    type(a, editor, "Just typed");
    b.session.requestTakeover();
    await drain();
    expect(a.kind()).toBe("lost");
    expect(b.kind()).toBe("ready");
    expect(equal(w.net.server.content, canonical(doc("Just typed")))).toBe(true);
    expect(w.net.server.writes).toBe(1);
  });

  it("refuses edits from the moment it is asked", async () => {
    const w = world();
    w.net.hold();
    const a = tab(w, "A");
    await drain();
    const editor = attach(a);
    const b = tab(w, "B");
    await drain();
    type(a, editor, "Before");
    b.session.requestTakeover();
    await drain();
    expect(a.kind()).toBe("relinquishing");
    expect(type(a, editor, "After")).toBe(false);
  });

  it("waits for a save in flight to be answered, then hands over", async () => {
    const w = world();
    w.net.hold();
    const a = tab(w, "A");
    await drain();
    const editor = attach(a);
    type(a, editor, "In flight");
    await advance(2_000);
    const b = tab(w, "B");
    await drain();
    b.session.requestTakeover();
    await drain();
    expect(a.kind()).toBe("relinquishing");
    expect(b.kind()).toBe("takeover_pending");
    const attempt = w.net.attempts[0];
    attempt.respond(attempt.commit());
    await drain();
    expect(a.kind()).toBe("lost");
    expect(b.session.getState()).toMatchObject({ kind: "ready", base: { revision: R0 + 1 } });
  });

  it("hands over with a save that timed out unresolved, and the new tab waits for recovery", async () => {
    const w = world();
    w.net.hold();
    const a = tab(w, "A");
    await drain();
    const editor = attach(a);
    type(a, editor, "Unresolved");
    await advance(2_000);
    const b = tab(w, "B");
    await drain();
    b.session.requestTakeover();
    await advance(21_000, 1_000);
    expect(a.session.getState()).toEqual({ kind: "lost", reason: "handedOff" });
    expect(b.kind()).toBe("recovery_required");
    const sent = savesOf(w, "Unresolved").length;
    expect(sent).toBeLessThanOrEqual(2);

    // The original lands after all: the draft now says what the server says.
    w.net.attempts[0].commit();
    for (const attempt of w.net.attempts) attempt.respond(attempt.commit());
    await drain();
    expect(w.net.server.writes).toBe(1);
    b.session.recheck();
    await drain();
    expect(b.session.getState()).toMatchObject({ kind: "ready", base: { revision: R0 + 1 } });
    await advance(30_000, 5_000);
    expect(savesOf(w, "Unresolved")).toHaveLength(sent);
  });

  it("hands over after a conflict, and the new tab sees the refused draft", async () => {
    const w = world();
    const a = tab(w, "A");
    await drain();
    const editor = attach(a);
    w.net.external(doc("Another device"));
    type(a, editor, "Mine");
    await advance(2_500);
    expect(a.session.getAutosave()?.coordinator.getState().phase).toBe("blocked");
    const b = tab(w, "B");
    await drain();
    b.session.requestTakeover();
    await drain();
    const state = b.session.getState();
    if (state.kind !== "recovery_required" || state.reason !== "drafts")
      throw new Error(state.kind);
    expect(state.candidates[0]).toMatchObject({ status: "conflict" });
    expect(equal(w.net.server.content, canonical(doc("Another device")))).toBe(true);
  });

  it("hands over while offline: words kept here, nothing sent", async () => {
    const w = world();
    const a = tab(w, "A");
    await drain();
    const editor = attach(a);
    w.link.set(false);
    type(a, editor, "Offline");
    const b = tab(w, "B");
    await drain();
    b.session.requestTakeover();
    await advance(1_000);
    expect(a.kind()).toBe("lost");
    expect(b.kind()).toBe("recovery_required");
    expect(w.net.sent).toHaveLength(0);
  });

  it("declines when the words are not kept on this device", async () => {
    const w = world();
    const storage: DraftStorage = {
      writeDraft: () => Promise.reject(new DraftStorageError("quota")),
      confirmDraft,
      refuseDraft,
    };
    const a = tab(w, "A", { autosave: { storage } });
    await drain();
    const editor = attach(a);
    w.link.set(false);
    type(a, editor, "Only in this editor");
    const b = tab(w, "B");
    await drain();
    b.session.requestTakeover();
    await advance(1_000);
    expect(b.session.getState()).toEqual({
      kind: "read_only",
      takeover: "declined",
      reason: "unprotected",
    });
    expect(a.kind()).toBe("active");
    expect(a.session.canEdit()).toBe(true);
    expect(b.session.canEdit()).toBe(false);
  });

  it("takes over at once from a tab that closed unexpectedly, through verification", async () => {
    const w = world();
    const a = tab(w, "A");
    await drain();
    const editor = attach(a);
    type(a, editor, "Saved first");
    await advance(2_500);
    const b = tab(w, "B");
    await drain();
    a.kill();
    b.session.requestTakeover();
    await drain();
    expect(b.session.getState()).toMatchObject({ kind: "ready", base: { revision: R0 + 1 } });
  });

  it("gives up without forcing when the editing tab does not answer", async () => {
    const w = world();
    const a = tab(w, "A");
    await drain();
    attach(a);
    const b = tab(w, "B");
    await drain();
    w.bus.mode.drop = true;
    b.session.requestTakeover();
    await advance(26_000, 1_000);
    expect(b.session.getState()).toEqual({ kind: "read_only", takeover: "unanswered" });
    expect(a.kind()).toBe("active");
    // A late release does not make it an editor by itself.
    await a.session.dispose();
    await drain();
    expect(b.kind()).toBe("read_only");
  });

  it("never yields two editors when the handover outlasts the deadline", async () => {
    const w = world();
    w.net.hold();
    const timing = { takeoverAnswerMs: 1_000, relinquishSaveMs: 5_000 };
    const a = tab(w, "A", { timing });
    await drain();
    const editor = attach(a);
    type(a, editor, "Slow");
    await advance(2_000);
    const b = tab(w, "B", { timing });
    await drain();
    b.session.requestTakeover();
    await advance(1_500, 250);
    expect(b.session.getState()).toEqual({ kind: "read_only", takeover: "unanswered" });
    await advance(5_000, 500);
    expect(a.kind()).toBe("lost");
    expect(b.kind()).toBe("read_only");
    expect(b.session.canEdit()).toBe(false);
    expect(w.locks.holder(`sermon-tracker-editor:${owner}:${outlineId}`)).toBeNull();
  });

  it("treats messages as advice: duplicates, forgeries, and junk change nothing", async () => {
    const w = world();
    const a = tab(w, "A");
    await drain();
    attach(a);
    const b = tab(w, "B");
    await drain();
    w.bus.inject({
      v: 1,
      type: "takeover_answer",
      owner,
      outlineId,
      requestId: foreignDraft,
      answer: "declined",
    });
    w.bus.inject({ type: "takeover_request", owner, outlineId: "not-an-id", requestId: "x" });
    w.bus.inject("junk");
    w.bus.inject({
      v: 1,
      type: "takeover_request",
      owner: owner2,
      outlineId,
      requestId: foreignDraft,
    });
    await drain();
    expect(a.kind()).toBe("active");
    expect(b.kind()).toBe("read_only");
    w.bus.mode.duplicate = true;
    b.session.requestTakeover();
    await drain();
    expect(a.kind()).toBe("lost");
    expect(b.kind()).toBe("ready");
    // Identifiers only, never a document.
    for (const message of w.bus.posted) {
      expect(Object.keys(message as object).sort()).not.toContain("content");
      expect(JSON.stringify(message)).not.toContain("Grace");
    }
  });

  it("answers a takeover asked while still verifying with a refusal", async () => {
    const w = world();
    const transport: DocumentTransport = {
      save: () => new Promise(() => {}),
      read: () => new Promise(() => {}),
    };
    const a = tab(w, "A", { transport });
    const b = tab(w, "B");
    await drain();
    expect(a.kind()).toBe("verifying");
    b.session.requestTakeover();
    await drain();
    expect(b.session.getState()).toEqual({
      kind: "read_only",
      takeover: "declined",
      reason: "starting",
    });
  });
});

describe("unresolved claims (checkpoint E)", () => {
  it("a free lock never frees a crashed tab's save: no resend, no blind write, recovery first", async () => {
    const w = world();
    w.net.hold();
    const a = tab(w, "A");
    await drain();
    const editor = attach(a);
    type(a, editor, "Crashed tab");
    await advance(2_000);
    expect(w.net.attempts).toHaveLength(1);
    a.kill();
    const b = tab(w, "B");
    await drain();
    b.session.requestTakeover();
    await drain();
    // B read R0 while the original is still on its way.
    expect(b.kind()).toBe("recovery_required");
    expect(b.session.getAutosave()).toBeNull();

    // The original commits afterwards (its tab will never hear).
    w.net.attempts[0].commit();
    b.session.recheck();
    await drain();
    expect(b.session.getState()).toMatchObject({ kind: "ready", base: { revision: R0 + 1 } });
    const editorB = attach(b);
    type(b, editorB, "B's words");
    await advance(2_500);
    const last = w.net.attempts.at(-1)!;
    last.respond(last.commit());
    await drain();
    expect(last.request.expectedRevision).toBe(R0 + 1);
    expect(savesOf(w, "Crashed tab")).toHaveLength(1);
    expect(w.net.server.writes).toBe(2);
  });

  for (const order of ["original first", "new tab first"] as const) {
    it(`a late commit never overwrites blindly (${order})`, async () => {
      const w = world();
      w.net.hold();
      const a = tab(w, "A");
      await drain();
      const editor = attach(a);
      type(a, editor, "Original");
      await advance(2_000);
      const original = w.net.attempts[0];
      a.kill();
      const b = tab(w, "B");
      await drain();
      b.session.requestTakeover();
      await drain();
      expect(b.kind()).toBe("recovery_required");
      // The person discards the old words; B edits from R0.
      const [old] = await listDrafts(owner, outlineId);
      if (old.status !== "ok") throw new Error();
      await discardDraft(owner, { outlineId, draftId: old.draftId, sequence: old.draft.sequence });
      b.session.recheck();
      await drain();
      const editorB = attach(b);
      type(b, editorB, "New tab");
      await advance(2_500);
      const mine = w.net.attempts.at(-1)!;
      expect(mine.request.expectedRevision).toBe(R0);
      if (order === "original first") {
        original.commit();
        mine.respond(mine.commit());
        await drain();
        expect(equal(w.net.server.content, canonical(doc("Original")))).toBe(true);
        expect(b.session.getAutosave()?.coordinator.getState().phase).toBe("blocked");
        expect((await listDrafts(owner, outlineId))[0]).toMatchObject({ status: "ok" });
      } else {
        mine.respond(mine.commit());
        expect(original.commit()).toMatchObject({ kind: "conflict", code: "stale" });
        await drain();
        expect(equal(w.net.server.content, canonical(doc("New tab")))).toBe(true);
      }
      expect(w.net.server.writes).toBe(1);
    });
  }

  it("the conditional retry and the original write once between them", async () => {
    const w = world();
    w.net.hold();
    const a = tab(w, "A");
    await drain();
    const editor = attach(a);
    type(a, editor, "Twice sent");
    await advance(2_000);
    await advance(16_000, 1_000);
    expect(w.net.attempts).toHaveLength(2);
    w.net.attempts[0].commit();
    w.net.attempts[1].respond(w.net.attempts[1].commit());
    await drain();
    expect(w.net.server.writes).toBe(1);
    const b = tab(w, "B");
    await drain();
    b.session.requestTakeover();
    await advance(25_000, 1_000);
    expect(savesOf(w, "Twice sent")).toHaveLength(2);
  });

  it("another writer first: the original is stale, its draft refused, the new tab blocked", async () => {
    const w = world();
    w.net.hold();
    const a = tab(w, "A");
    await drain();
    const editor = attach(a);
    type(a, editor, "Too late");
    await advance(2_000);
    w.net.external(doc("Elsewhere"));
    const attempt = w.net.attempts[0];
    attempt.respond(attempt.commit());
    await drain();
    expect(a.session.getAutosave()?.coordinator.getState().block?.reason).toBe("conflict");
    await a.session.dispose();
    const b = tab(w, "B");
    await drain();
    expect(b.session.getState()).toMatchObject({ kind: "recovery_required" });
    expect(equal(w.net.server.content, canonical(doc("Elsewhere")))).toBe(true);
  });

  it("an interrupted cleanup leaves a draft equal to the server: kept, and not blocking", async () => {
    const w = world();
    const storage: DraftStorage = {
      writeDraft,
      confirmDraft: () => Promise.reject(new DraftStorageError("failed")),
      refuseDraft,
    };
    const a = tab(w, "A", { autosave: { storage } });
    await drain();
    const editor = attach(a);
    type(a, editor, "Confirmed");
    await advance(2_500);
    expect(w.net.server.writes).toBe(1);
    await a.session.dispose();
    expect(await listDrafts(owner, outlineId)).toHaveLength(1);
    const b = tab(w, "B");
    await drain();
    expect(b.kind()).toBe("ready");
    expect(await listDrafts(owner, outlineId)).toHaveLength(1);
  });

  it("after the automatic retries are spent: handed over, never resent, recovery first", async () => {
    const w = world();
    w.net.hold();
    const a = tab(w, "A");
    await drain();
    const editor = attach(a);
    type(a, editor, "Stalled");
    await advance(2_000);
    w.net.answerReads({ kind: "failed" });
    await advance(80_000, 1_000);
    const coordinator = a.session.getAutosave()!.coordinator;
    expect(coordinator.getState().recovery?.status).toBe("exhausted");
    const b = tab(w, "B");
    await drain();
    b.session.requestTakeover();
    await drain();
    expect(a.kind()).toBe("lost");
    expect(b.session.getState()).toEqual({ kind: "verification_failed", reason: "failed" });
    w.net.answerReads(null);
    b.session.recheck();
    await drain();
    expect(b.kind()).toBe("recovery_required");
    expect(savesOf(w, "Stalled")).toHaveLength(1);
  });
});

/*
 * The coordinator publishes `saving` synchronously just before it calls the
 * transport, and sends the conditional retry a microtask after publishing
 * `retrying`; it does not look at the session in between. The session's
 * transport is the check at the moment of sending.
 */
describe("save authority at the moment of sending (pre-commit review)", () => {
  it("sends nothing when the session ends just before a save goes out, and keeps the words", async () => {
    const w = world();
    const a = tab(w, "A");
    await drain();
    const editor = attach(a);
    const { controller, coordinator } = a.session.getAutosave()!;
    coordinator.subscribe((state) => {
      if (state.phase === "saving") void a.session.dispose();
    });
    type(a, editor, "Raced");
    await advance(2_500);
    expect(w.net.sent).toHaveLength(0);
    // Never sent, so its claim is released, and the words stay on the device.
    expect(controller.getState().saving).toBeNull();
    expect(await listDrafts(owner, outlineId)).toHaveLength(1);
    await advance(40_000, 5_000);
    expect(w.net.sent).toHaveLength(0);
  });

  it("sends nothing after the account changed unheard, however often the save is tried", async () => {
    const w = world();
    const a = tab(w, "A");
    await drain();
    const editor = attach(a);
    a.session.getAutosave()!.coordinator.subscribe((state) => {
      if (state.phase === "saving") w.identity.set("clerk-b", { silent: true });
    });
    type(a, editor, "Other account");
    await advance(2_500);
    await advance(40_000, 1_000);
    expect(w.net.sent).toHaveLength(0);
    expect(a.session.canEdit()).toBe(false);
    a.page.hide();
    expect(a.session.getState()).toEqual({ kind: "identity_invalidated" });
  });

  it("never sends the conditional retry once the session ended, and keeps the original's claim", async () => {
    const w = world();
    w.net.hold();
    const a = tab(w, "A");
    await drain();
    const editor = attach(a);
    const { controller, coordinator } = a.session.getAutosave()!;
    coordinator.subscribe((state) => {
      if (state.retrying) void a.session.dispose();
    });
    type(a, editor, "Held");
    await advance(2_000);
    expect(w.net.attempts).toHaveLength(1);
    const sequence = controller.getState().saving;
    expect(sequence).not.toBeNull();
    // The save times out, the read finds R0, and the retry is due: the session ends first.
    await advance(16_000, 1_000);
    expect(a.kind()).toBe("disposed");
    expect(w.net.attempts).toHaveLength(1);
    // The original may still be written: its claim and draft are kept.
    expect(controller.getState().saving).toBe(sequence);
    expect(await listDrafts(owner, outlineId)).toHaveLength(1);
    w.net.attempts[0].commit();
    await advance(30_000, 5_000);
    expect(w.net.attempts).toHaveLength(1);
    expect(w.net.server.writes).toBe(1);
  });

  it("sends nothing new once the browser takes the lock away", async () => {
    const w = world();
    let steal: () => void = () => {};
    const stealable = {
      request: (
        _name: string,
        options: { ifAvailable?: boolean },
        callback: (lock: unknown) => Promise<unknown>,
      ) =>
        new Promise((resolve, reject) => {
          steal = () => reject(Object.assign(new Error("stolen"), { name: "AbortError" }));
          void callback(options.ifAvailable ? {} : {}).then(resolve);
        }),
    };
    const a = tab(w, "A", { locks: stealable });
    await drain();
    const editor = attach(a);
    steal();
    await drain();
    expect(a.session.getState()).toEqual({ kind: "lost", reason: "lockLost" });
    expect(type(a, editor, "After the lock")).toBe(false);
    editor.edit(doc("Forced past the guard"));
    await advance(5_000);
    expect(w.net.sent).toHaveLength(0);
  });
});

describe("account boundaries (checkpoint F)", () => {
  it("ends on sign-out, keeping the words under the account that wrote them", async () => {
    const w = world();
    const a = tab(w, "A");
    await drain();
    const editor = attach(a);
    type(a, editor, "Before sign-out");
    w.identity.set(null);
    expect(a.session.getState()).toEqual({ kind: "identity_invalidated" });
    expect(a.session.canEdit()).toBe(false);
    await drain();
    const drafts = await listDrafts(owner, outlineId);
    expect(drafts).toHaveLength(1);
    await advance(10_000);
    expect(w.net.sent).toHaveLength(0);
  });

  it("lets a request already sent settle only its own session, and sends nothing new", async () => {
    const w = world();
    w.net.hold();
    const a = tab(w, "A");
    await drain();
    const editor = attach(a);
    type(a, editor, "Sent before");
    await advance(2_000);
    const autosave = a.session.getAutosave()!;
    w.identity.set("clerk-b");
    expect(a.kind()).toBe("identity_invalidated");
    const attempt = w.net.attempts[0];
    attempt.respond(attempt.commit());
    await drain();
    expect(autosave.controller.getState().confirmedSequence).toBe(1);
    expect(await listDrafts(owner, outlineId)).toHaveLength(0);
    await advance(30_000, 5_000);
    expect(w.net.sent).toHaveLength(1);
  });

  it("another account in the same browser sees none of the first account's drafts", async () => {
    const w = world();
    await aForeignDraft("First account's words");
    const second = fakeIdentity("clerk-b");
    const b = tab(w, "B", { owner: owner2, identity: second.signal });
    await drain();
    expect(b.kind()).toBe("ready");
    expect(await listDrafts(owner2, outlineId)).toHaveLength(0);
    const a = tab(w, "A");
    await drain();
    expect(a.kind()).toBe("recovery_required");
  });

  it("a tab that slept through an account switch ends as it wakes, before any save", async () => {
    const w = world();
    const a = tab(w, "A");
    await drain();
    const editor = attach(a);
    type(a, editor, "Slept");
    // The other tab switched accounts; this one has not heard yet.
    w.identity.set("clerk-b", { silent: true });
    expect(a.session.canEdit()).toBe(false);
    await advance(3_000);
    // A save that fell due is refused as not sent; nothing reaches the server.
    expect(w.net.sent).toHaveLength(0);
    // The page's own events check the account before anything else.
    a.page.hide();
    expect(a.session.getState()).toEqual({ kind: "identity_invalidated" });
    a.page.show();
    a.page.pageshow(true);
    a.page.hide();
    await advance(10_000);
    expect(w.net.sent).toHaveLength(0);
    expect(await listDrafts(owner, outlineId)).toHaveLength(1);
  });

  it("starts nothing for a session opened signed out", async () => {
    const w = world();
    w.identity.set(null);
    const a = tab(w, "A");
    await drain();
    expect(a.session.getState()).toEqual({ kind: "identity_invalidated" });
    expect(w.locks.holder(`sermon-tracker-editor:${owner}:${outlineId}`)).toBeNull();
  });

  it("states carry no draft content and no account's words", async () => {
    const w = world();
    await aForeignDraft("Private words");
    const a = tab(w, "A");
    const states: EditorSessionState[] = [];
    a.session.subscribe((state) => states.push(state));
    await drain();
    w.identity.set(null);
    expect(JSON.stringify(states)).not.toContain("Private words");
    expect(a.session.getState()).toEqual({ kind: "identity_invalidated" });
  });
});
