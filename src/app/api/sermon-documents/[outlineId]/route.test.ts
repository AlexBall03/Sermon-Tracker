// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ideas, sermonOutlineDocuments, users } from "@/db/schema";
import { createTestDatabase } from "@/db/testing";
import type { Database } from "@/db/types";
import type { Authorization } from "@/features/auth/access";
import { documentV4, pointV4, proseV4 } from "@/features/editor-lab/v4/fixtures";
import { createOutline } from "@/features/outlines/outlines";
import { convertOutline } from "@/features/sermon-editor/persistence/conversion";
import { updateDocument } from "@/features/sermon-editor/persistence/documents";

/*
 * The authoritative read over HTTP (A2.3B.2D). The access helper is mocked;
 * the database is a real in-memory PostgreSQL, so owner scoping is the
 * query's own, not a stand-in's.
 */
const state = vi.hoisted(() => ({
  access: { ok: false, message: "Your session has ended. Sign in again." } as unknown,
  db: undefined as unknown,
  throwOnAuthorize: null as Error | null,
}));

vi.mock("@/db", () => ({ getDb: () => state.db }));
vi.mock("@/i18n/server", () => ({ getLocale: async () => "en" }));
vi.mock("@/features/auth/access", () => ({
  authorize: async (): Promise<Authorization> => {
    if (state.throwOnAuthorize) throw state.throwOnAuthorize;
    return state.access as Authorization;
  },
}));

import { GET } from "./route";

const signedOut = "Your session has ended. Sign in again.";
const denied = "Your account does not have access.";
const secret = "A sentence only the document holds";
const sermon = (title: string) => documentV4([pointV4("p-1", title, 1), proseV4(`${secret}.`, 1)]);

let db: Database;
let me: string;
let other: string;
let outlineId: string;
let theirs: string;

function signInAs(id: string) {
  state.access = {
    ok: true,
    user: { id, clerkUserId: "user_x", role: "user", status: "active" },
  };
}

async function outlined(owner: string) {
  const [idea] = await db
    .insert(ideas)
    .values({ ownerId: owner, kind: "sermon", title: "Grace" })
    .returning();
  const outcome = await createOutline(db, owner, idea.id);
  if (outcome.status !== "created") throw new Error(outcome.status);
  return outcome.outline.id;
}

async function converted(owner: string, id: string) {
  const outcome = await convertOutline(db, owner, id);
  if (outcome.status !== "converted") throw new Error(outcome.status);
}

const ask = (id: string) =>
  GET(new Request(`https://sermontracker.test/api/sermon-documents/${id}`), {
    params: Promise.resolve({ outlineId: id }),
  });

async function answer(id: string) {
  const response = await ask(id);
  // Every answer, whatever it says, is kept by no cache.
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("content-type")).toMatch(/^application\/json/);
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

const rows = () => db.select().from(sermonOutlineDocuments);
const brokenDb = (error: Error) =>
  new Proxy(
    {},
    {
      get: () => () => {
        throw error;
      },
    },
  );

beforeEach(async () => {
  db = await createTestDatabase();
  state.db = db;
  state.access = { ok: false, message: signedOut };
  state.throwOnAuthorize = null;
  const inserted = await db
    .insert(users)
    .values([{ clerkUserId: "user_me" }, { clerkUserId: "user_other" }])
    .returning();
  [me, other] = inserted.map((row) => row.id);
  outlineId = await outlined(me);
  theirs = await outlined(other);
  await converted(me, outlineId);
  await converted(other, theirs);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/sermon-documents/[outlineId] (A2.3B.2D)", () => {
  it("gives the owner the canonical document and its revision, for an ID in any case", async () => {
    signInAs(me);
    await updateDocument(db, me, outlineId, sermon("Grace upon grace"), 0);
    const { status, body } = await answer(outlineId.toUpperCase());
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, revision: 1, message: "Sermon document loaded." });
    const [row] = (await rows()).filter((r) => r.outlineId === outlineId);
    expect(body.content).toEqual(row.content);
    expect(JSON.stringify(body.content)).toContain("Grace upon grace");
    expect(Object.keys(body).sort()).toEqual(["content", "message", "ok", "revision"]);
  });

  it("answers another account's document exactly as it answers none", async () => {
    signInAs(me);
    const nobody = "0b6a3c1e-9d54-4c7e-8a55-1f1f6d3b2a10";
    const theirsAnswer = await answer(theirs);
    const noneAnswer = await answer(nobody);
    expect(theirsAnswer).toEqual({
      status: 404,
      body: { ok: false, code: "missing", message: "That outline no longer exists." },
    });
    expect(noneAnswer).toEqual(theirsAnswer);
    expect(JSON.stringify(theirsAnswer)).not.toContain(secret);
  });

  it("refuses an ID that is not one, before the database is asked", async () => {
    signInAs(me);
    state.db = brokenDb(new Error("the database was asked"));
    for (const id of ["nope", "1", encodeURIComponent("../../etc"), "%00"]) {
      expect(await answer(id)).toEqual({
        status: 400,
        body: { ok: false, code: "invalid", message: "That request was not valid." },
      });
    }
  });

  it("says unreadable with the revision, and neither the content nor its problems", async () => {
    signInAs(me);
    const second = await outlined(me);
    await db.insert(sermonOutlineDocuments).values({
      outlineId: second,
      ownerId: me,
      content: { type: "doc", attrs: { schemaVersion: 99, secret } },
    });
    const { status, body } = await answer(second);
    expect(status).toBe(409);
    expect(body).toEqual({
      ok: false,
      code: "unreadable",
      revision: 0,
      message:
        "This outline's sermon document can't be read right now. It was left exactly as it was.",
    });
    expect(JSON.stringify(body)).not.toContain(secret);
  });

  it("refuses a signed-out or denied caller with 401 and no code, and reads nothing", async () => {
    state.db = brokenDb(new Error("the database was asked"));
    for (const message of [signedOut, denied, "Finish setting up your account first."]) {
      state.access = { ok: false, message };
      expect(await answer(outlineId)).toEqual({ status: 401, body: { ok: false, message } });
    }
  });

  it("answers a failing database 503 without logging the document", async () => {
    signInAs(me);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    state.db = brokenDb(
      Object.assign(new Error(`Failed query: select …\nparams: ${secret}`), {
        cause: Object.assign(new Error("connection terminated"), { code: "08006" }),
      }),
    );
    const { status, body } = await answer(outlineId);
    expect(status).toBe(503);
    expect(body).toEqual({
      ok: false,
      code: "failed",
      message: "This sermon document could not be loaded. Try again.",
    });
    expect(logged.mock.calls).toEqual([["Sermon document read failed:", "Error (08006)"]]);
    expect(JSON.stringify(logged.mock.calls)).not.toContain(secret);
  });

  it("answers an unexpected failure 503, with its kind logged and nothing of it sent", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    state.throwOnAuthorize = new TypeError(`Clerk is down: ${secret}`);
    const { status, body } = await answer(outlineId);
    expect(status).toBe(503);
    expect(body).toEqual({ ok: false, code: "failed", message: "Unavailable" });
    expect(logged.mock.calls).toEqual([["Sermon document read failed:", "TypeError"]]);
    expect(JSON.stringify([body, logged.mock.calls])).not.toContain(secret);
  });

  it("writes nothing: not the content, the revision, or the time, and makes no document", async () => {
    signInAs(me);
    await updateDocument(db, me, outlineId, sermon("Grace"), 0);
    const before = await rows();
    for (let i = 0; i < 3; i++) await answer(outlineId);
    await answer(theirs);
    expect(await rows()).toEqual(before);
    const second = await outlined(me);
    expect((await answer(second)).status).toBe(404);
    expect((await rows()).some((row) => row.outlineId === second)).toBe(false);
  });
});
