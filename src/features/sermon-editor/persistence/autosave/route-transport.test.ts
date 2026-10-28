// @vitest-environment node
import "fake-indexeddb/auto";

import type { JSONContent } from "@tiptap/core";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ideas, sermonOutlineDocuments, users } from "@/db/schema";
import { createTestDatabase } from "@/db/testing";
import type { Database } from "@/db/types";
import type { Authorization } from "@/features/auth/access";
import { documentV4, pointV4, proseV4 } from "@/features/editor-lab/v4/fixtures";
import { resetAccountMemory } from "@/features/offline/account";
import { closeOfflineDb } from "@/features/offline/db";
import { createOutline } from "@/features/outlines/outlines";
import { canonicalDocument } from "../canonical";
import { convertOutline } from "../conversion";
import { updateDocument } from "../documents";
import type { JsonValue } from "../json";
import { readDraft } from "../recovery/store";
import type { Connectivity } from "./connectivity";
import { createAutosaveController } from "./controller";
import { createSaveCoordinator } from "./coordinator";
import { jsonEqual, serverSaveStatus, type DocumentSource } from "./model";

/*
 * The authoritative read over HTTP inside the whole loop (A2.3B.2D): the real
 * controller and coordinator, `documentTransport` reading through the real
 * GET Route Handler and saving through the real `saveOutlineDocument`, both
 * on a real (in-memory) PostgreSQL. Each save is held at a gate the test
 * opens: run on the server now or later, answered or never. This shows the
 * reads are not made to wait for a pending save and that every revision
 * safeguard still holds; that the browser does not queue them is shown in a
 * real browser (tests/lab/persistence-probe.spec.ts).
 */

const state = vi.hoisted(() => ({
  access: { ok: false, message: "Your session has ended. Sign in again." } as unknown,
  db: undefined as unknown,
}));
vi.mock("@/db", () => ({ getDb: () => state.db }));
vi.mock("@/i18n/server", () => ({ getLocale: async () => "en" }));
vi.mock("@/features/auth/access", () => ({
  authorize: async (): Promise<Authorization> => state.access as Authorization,
}));

import { GET } from "@/app/api/sermon-documents/[outlineId]/route";
import { saveOutlineDocument } from "../actions";
import { documentTransport } from "./transport";

const doc = (words: string) => documentV4([pointV4("p-1", "Grace", 1), proseV4(words, 1)]);
const canonical = (json: unknown) => {
  const result = canonicalDocument(json);
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result.content;
};
const equal = (a: unknown, b: unknown) => jsonEqual(a as JsonValue, b as JsonValue);

let db: Database;
let owner: string;
let outlineId: string;
/** The revision the session opens at. */
let R0: number;

async function drain(rounds = 30) {
  for (let i = 0; i < rounds; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
    await vi.advanceTimersByTimeAsync(0);
  }
}

async function stored() {
  const [row] = await db.select().from(sermonOutlineDocuments);
  return row;
}

const signIn = () => {
  state.access = { ok: true, user: { id: owner, role: "user", status: "active" } };
};

/** The network between the browser and the real server, with each save held at a gate. */
function network() {
  type Held = {
    args: [string, JSONContent, number];
    /** Runs the save Server Action on the server now; its answer is kept until `respond`. */
    commit(): Promise<unknown>;
    /** The kept answer reaches the browser. */
    respond(): void;
    /** No answer ever reaches the browser. */
    lose(): void;
    settled: boolean;
  };
  const saves: Held[] = [];
  let reads = 0;
  let failingReads = 0;
  const readStatuses: number[] = [];

  const transport = documentTransport({
    save: ((id: string, content: JSONContent, revision: number) =>
      new Promise((resolve, reject) => {
        let answer: unknown;
        const held: Held = {
          args: [id, content, revision],
          settled: false,
          async commit() {
            answer = await saveOutlineDocument(id, content, revision);
            return answer;
          },
          respond() {
            held.settled = true;
            resolve(answer);
          },
          lose() {
            held.settled = true;
            reject(new TypeError("Failed to fetch"));
          },
        };
        saves.push(held);
      })) as never,
    // The browser's fetch, delivered to the real Route Handler.
    fetch: (async (url: string, init: RequestInit) => {
      reads += 1;
      expect(init).toMatchObject({ method: "GET", cache: "no-store", credentials: "same-origin" });
      if (failingReads > 0) {
        failingReads -= 1;
        throw new TypeError("Failed to fetch");
      }
      const id = decodeURIComponent(url.split("/").pop() ?? "");
      const response = await GET(new Request(`https://sermontracker.test${url}`), {
        params: Promise.resolve({ outlineId: id }),
      });
      readStatuses.push(response.status);
      return response;
    }) as unknown as typeof fetch,
  });
  return {
    transport,
    saves,
    readStatuses,
    get reads() {
      return reads;
    },
    pending: () => saves.filter((save) => !save.settled).length,
    failReads(count: number) {
      failingReads = count;
    },
  };
}

const online: Connectivity = { online: () => true, subscribe: () => () => {} };

async function session() {
  const opened = (await stored()).content as JSONContent;
  let current = opened;
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
  const net = network();
  const controller = createAutosaveController({ owner, outlineId, revision: R0, source });
  const coordinator = createSaveCoordinator({
    controller,
    transport: net.transport,
    base: { content: canonical(opened), revision: R0 },
    connectivity: online,
  });
  async function type(next: JSONContent) {
    current = next;
    change?.();
    await vi.advanceTimersByTimeAsync(400);
    await controller.flush();
    await vi.advanceTimersByTimeAsync(1500);
    await drain();
  }
  const draft = () => readDraft(owner, { outlineId, draftId: controller.draftId });
  const status = () => serverSaveStatus(controller.getState(), coordinator.getState());
  /** The save's 15 s timeout passes with no answer; the coordinator reads through the route. */
  async function timeOut() {
    await vi.advanceTimersByTimeAsync(15_000);
    await drain();
  }
  return { net, controller, coordinator, type, draft, status, timeOut };
}

beforeEach(async () => {
  db = await createTestDatabase();
  state.db = db;
  const [user] = await db.insert(users).values({ clerkUserId: "user_me" }).returning();
  owner = user.id;
  const [idea] = await db
    .insert(ideas)
    .values({ ownerId: owner, kind: "sermon", title: "Grace" })
    .returning();
  const outline = await createOutline(db, owner, idea.id);
  if (outline.status !== "created") throw new Error(outline.status);
  outlineId = outline.outline.id;
  if ((await convertOutline(db, owner, outlineId)).status !== "converted") throw new Error();
  const opened = await updateDocument(db, owner, outlineId, doc("Opened"), 0);
  if (opened.status !== "updated") throw new Error(opened.status);
  R0 = opened.revision;
  signIn();

  await closeOfflineDb();
  globalThis.indexedDB = new IDBFactory();
  resetAccountMemory();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(async () => {
  vi.useRealTimers();
  await closeOfflineDb();
});

describe("reads through the GET route while a save is pending (A2.3B.2D)", () => {
  it("reads R0 while the save is still pending, resends once, and the late original lands stale", async () => {
    const s = await session();
    await s.type(doc("Sent"));
    expect(s.net.saves).toHaveLength(1);
    await s.timeOut();
    // The read went through the route and answered while the original is still unanswered.
    expect(s.net.readStatuses[0]).toBe(200);
    expect(s.net.saves[0].settled).toBe(false);
    expect(s.coordinator.getState().reconciliation).toMatchObject({ result: "unchanged" });
    // The one conditional resend: the same request, under the same claim.
    expect(s.net.saves).toHaveLength(2);
    expect(s.net.saves[1].args).toEqual(s.net.saves[0].args);
    const [original, retry] = s.net.saves;
    expect(await retry.commit()).toMatchObject({ ok: true, revision: R0 + 1 });
    retry.respond();
    await drain();
    expect(s.coordinator.getState()).toMatchObject({ phase: "idle", confirmedSequence: 1 });
    expect(s.status()).toBe("saved");
    // The original reaches the server late: the server's condition refuses it.
    expect(await original.commit()).toMatchObject({ ok: false, code: "stale", revision: R0 + 1 });
    original.respond();
    await drain();
    const row = await stored();
    expect(row.revision).toBe(R0 + 1);
    expect(equal(row.content, canonical(doc("Sent")))).toBe(true);
    expect(s.net.saves).toHaveLength(2);
    expect(await s.draft()).toBeNull();
    await s.controller.dispose();
  });

  it("the original commits first while still unanswered: the resend meets stale and is read back as saved", async () => {
    const s = await session();
    await s.type(doc("Sent"));
    await s.timeOut();
    const [original, retry] = s.net.saves;
    expect(await original.commit()).toMatchObject({ ok: true, revision: R0 + 1 });
    expect(await retry.commit()).toMatchObject({ ok: false, code: "stale" });
    retry.respond();
    await drain();
    expect(s.coordinator.getState()).toMatchObject({
      phase: "idle",
      confirmedSequence: 1,
      reconciliation: { result: "saved", revision: R0 + 1 },
    });
    // The original's answer, late, changes nothing.
    original.respond();
    await drain();
    expect((await stored()).revision).toBe(R0 + 1);
    expect(s.net.saves).toHaveLength(2);
    expect(s.status()).toBe("saved");
    await s.controller.dispose();
  });

  it("reads R0 + 1 once the pending save has committed on the server: saved, no resend", async () => {
    const s = await session();
    await s.type(doc("Sent"));
    // On the server, but its answer never comes.
    await s.net.saves[0].commit();
    await s.timeOut();
    expect(s.net.saves[0].settled).toBe(false);
    expect(s.coordinator.getState()).toMatchObject({
      phase: "idle",
      confirmedSequence: 1,
      reconciliation: { result: "saved", revision: R0 + 1 },
    });
    expect(s.net.saves).toHaveLength(1);
    s.net.saves[0].lose();
    await drain();
    expect(s.status()).toBe("saved");
    await s.controller.dispose();
  });

  it("another writer moves the revision while the save is pending: blocked, nothing overwritten, the draft kept", async () => {
    const s = await session();
    await s.type(doc("Sent"));
    await updateDocument(db, owner, outlineId, doc("Someone else"), R0);
    await s.timeOut();
    expect(s.coordinator.getState()).toMatchObject({
      phase: "blocked",
      block: { reason: "conflict" },
      reconciliation: { result: "conflict", revision: R0 + 1 },
    });
    expect(s.net.saves).toHaveLength(1);
    expect(await s.net.saves[0].commit()).toMatchObject({ ok: false, code: "stale" });
    s.net.saves[0].respond();
    await drain();
    const row = await stored();
    expect(row.revision).toBe(R0 + 1);
    expect(equal(row.content, canonical(doc("Someone else")))).toBe(true);
    const kept = await s.draft();
    expect(kept?.status === "ok" && kept.draft.content).toEqual(doc("Sent"));
    expect(s.status()).not.toBe("saved");
    await s.controller.dispose();
  });

  it("a session that ends during recovery is blocked holding the claim; nothing is sent again", async () => {
    const s = await session();
    await s.type(doc("Sent"));
    state.access = { ok: false, message: "Your session has ended. Sign in again." };
    await s.timeOut();
    expect(s.net.readStatuses).toEqual([401]);
    expect(s.coordinator.getState()).toMatchObject({
      phase: "blocked",
      block: { reason: "unauthorized" },
    });
    expect(s.controller.getState().saving).toBe(1);
    await vi.advanceTimersByTimeAsync(120_000);
    await drain();
    expect(s.net.saves).toHaveLength(1);
    expect(s.net.reads).toBe(1);
    expect((await stored()).revision).toBe(R0);
    expect((await s.draft())?.status).toBe("ok");
    s.net.saves[0].lose();
    await s.controller.dispose();
  });

  it("reads that fail exhaust the budget with the save still pending; recovery then reads it as saved", async () => {
    const s = await session();
    await s.type(doc("Sent"));
    s.net.failReads(6);
    await s.timeOut();
    for (const delay of [1, 2, 4, 8, 16]) {
      await vi.advanceTimersByTimeAsync(delay * 1000);
      await drain();
    }
    expect(s.net.reads).toBe(6);
    expect(s.coordinator.getState().recovery).toMatchObject({ status: "exhausted", retries: 5 });
    expect(s.status()).toBe("stalled");
    expect(s.controller.getState().saving).toBe(1);
    expect(s.net.saves).toHaveLength(1);
    // The pending save lands on the server at last; its answer is lost.
    await s.net.saves[0].commit();
    s.net.saves[0].lose();
    await drain();
    await s.coordinator.recover();
    await drain();
    expect(s.net.readStatuses.at(-1)).toBe(200);
    expect(s.coordinator.getState()).toMatchObject({ phase: "idle", confirmedSequence: 1 });
    expect(s.net.saves).toHaveLength(1);
    expect((await stored()).revision).toBe(R0 + 1);
    await s.controller.dispose();
  });
});
