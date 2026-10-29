// @vitest-environment node
import { encodeReply } from "next/dist/compiled/react-server-dom-webpack/client.edge";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { eq } from "drizzle-orm";

import { ideas, sermonOutlineDocuments, sermonOutlines, users } from "@/db/schema";
import { createTestDatabase } from "@/db/testing";
import type { Database } from "@/db/types";
import type { Authorization } from "@/features/auth/access";
import { documentV4, pointV4, proseV4 } from "@/features/editor-lab/v4/fixtures";
import { createOutline } from "@/features/outlines/outlines";
import { documentLimits } from "./model";

// The access helper is mocked; the database is a real in-memory PostgreSQL.
const state = vi.hoisted(() => ({
  access: { ok: false, message: "Your session has ended. Sign in again." } as unknown,
  db: undefined as unknown,
  locale: "en",
}));

vi.mock("@/db", () => ({ getDb: () => state.db }));
vi.mock("@/i18n/server", () => ({ getLocale: async () => state.locale }));
vi.mock("@/features/auth/access", () => ({
  authorize: async (): Promise<Authorization> => state.access as Authorization,
}));

import { convertOutlineDocument, readOutlineDocument, saveOutlineDocument } from "./actions";

let db: Database;
let me: string;
let other: string;
let outlineId: string;
let theirs: string;

const signedOut = "Your session has ended. Sign in again.";
const secret = "A sentence only the document holds";
const sermon = (title: string) => documentV4([pointV4("p-1", title, 1), proseV4(`${secret}.`, 1)]);

function signInAs(id: string) {
  state.access = {
    ok: true,
    user: {
      id,
      clerkUserId: "user_x",
      role: "user",
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
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

beforeEach(async () => {
  // The rollout switch is on for these tests; "while conversion is switched off" turns it off.
  vi.stubEnv("SERMON_DOCUMENT_CONVERSION", "on");
  db = await createTestDatabase();
  state.db = db;
  state.locale = "en";
  state.access = { ok: false, message: signedOut };
  const rows = await db
    .insert(users)
    .values([{ clerkUserId: "user_me" }, { clerkUserId: "user_other" }])
    .returning();
  [me, other] = rows.map((row) => row.id);
  outlineId = await outlined(me);
  theirs = await outlined(other);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("sermon document actions", () => {
  it("refuses a caller who is not signed in, and writes nothing", async () => {
    expect(await convertOutlineDocument(outlineId)).toEqual({
      ok: false,
      message: signedOut,
    });
    expect(await saveOutlineDocument(outlineId, sermon("Grace"), 0)).toEqual({
      ok: false,
      message: signedOut,
    });
    expect(await db.select().from(sermonOutlineDocuments)).toHaveLength(0);
  });

  it("converts and saves as the signed-in account, never as one the input names", async () => {
    signInAs(me);
    expect(await convertOutlineDocument(outlineId.toUpperCase())).toMatchObject({
      ok: true,
      revision: 0,
      message: "This outline is now a sermon document.",
    });
    expect(await saveOutlineDocument(outlineId, sermon("Grace, again"), 0)).toMatchObject({
      ok: true,
      revision: 1,
    });
    const [row] = await db.select().from(sermonOutlineDocuments);
    expect(row).toMatchObject({ outlineId, ownerId: me, revision: 1 });

    // Another account's outline is the same answer as one that does not exist.
    expect(await convertOutlineDocument(theirs)).toMatchObject({
      ok: false,
      code: "missing",
    });
    expect(await saveOutlineDocument(theirs, sermon("Mine now"), 0)).toMatchObject({
      ok: false,
      code: "missing",
    });
  });

  it("refuses a bad ID or revision before anything is read", async () => {
    signInAs(me);
    expect(await convertOutlineDocument("nope")).toMatchObject({ code: "invalid" });
    for (const revision of [undefined, -1, 1.5, "0", null]) {
      expect(await saveOutlineDocument(outlineId, sermon("Grace"), revision)).toMatchObject({
        code: "invalid",
      });
    }
  });

  it("answers each refusal with its code", async () => {
    signInAs(me);
    expect(await saveOutlineDocument(outlineId, { type: "nope" }, 0)).toMatchObject({
      ok: false,
      code: "invalid",
      problems: [{ code: "not_a_document" }],
    });
    await convertOutlineDocument(outlineId);
    expect(await convertOutlineDocument(outlineId)).toMatchObject({
      code: "exists",
      revision: 0,
    });
    await saveOutlineDocument(outlineId, sermon("Newer"), 0);
    expect(await saveOutlineDocument(outlineId, sermon("Older"), 0)).toMatchObject({
      code: "stale",
      revision: 1,
    });
    const huge = documentV4([pointV4("p-1", "x".repeat(documentLimits.bytes), 1)]);
    const tooLarge = await saveOutlineDocument(outlineId, huge, 1);
    expect(tooLarge).toMatchObject({ ok: false, code: "too_large", limit: documentLimits.bytes });
    expect(tooLarge.message).toContain("3,072 KB");
  });

  it("refuses an outline that could not be converted without loss, and one stored unreadable", async () => {
    signInAs(me);
    // A numbering that no longer parses: the outline shows the default, so converting would change it.
    await db
      .update(sermonOutlines)
      .set({ numberingConfig: { version: 99 } as never })
      .where(eq(sermonOutlines.id, outlineId));
    expect(await convertOutlineDocument(outlineId)).toMatchObject({
      ok: false,
      code: "unsafe",
      conversion: [{ code: "invalid_numbering" }],
    });
    expect(await db.select().from(sermonOutlineDocuments)).toHaveLength(0);

    // Another outline whose stored document the core no longer accepts.
    const second = await outlined(me);
    await db.insert(sermonOutlineDocuments).values({
      outlineId: second,
      ownerId: me,
      content: { type: "doc", attrs: { schemaVersion: 99 } },
    });
    expect(await convertOutlineDocument(second)).toMatchObject({
      ok: false,
      code: "unreadable",
      revision: 0,
    });
  });

  it("answers in the account's language", async () => {
    signInAs(me);
    state.locale = "es";
    expect(await saveOutlineDocument(outlineId, sermon("Grace"), 0)).toMatchObject({
      code: "missing",
      message: "Ese bosquejo ya no existe.",
    });
  });

  it("reports a failing database without logging the document", async () => {
    signInAs(me);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    // Drizzle's own error: its message holds every parameter of the query.
    const failure = Object.assign(new Error(`Failed query: insert …\nparams: ${secret}`), {
      cause: Object.assign(new Error("connection terminated"), { code: "08006" }),
    });
    state.db = new Proxy(
      {},
      {
        get: () => () => {
          throw failure;
        },
      },
    );
    expect(await convertOutlineDocument(outlineId)).toMatchObject({
      ok: false,
      code: "failed",
    });
    expect(await saveOutlineDocument(outlineId, sermon("Grace"), 0)).toMatchObject({
      ok: false,
      code: "failed",
    });
    expect(logged).toHaveBeenCalledTimes(2);
    const text = JSON.stringify(logged.mock.calls);
    expect(text).toContain("08006");
    expect(text).not.toContain(secret);
  });

  it("logs nothing of an error that is not a database error's code and name", async () => {
    signInAs(me);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const odd = Object.assign(new Error(secret), { name: secret, code: secret });
    state.db = new Proxy(
      {},
      {
        get: () => () => {
          throw odd;
        },
      },
    );
    expect(await saveOutlineDocument(outlineId, sermon("Grace"), 0)).toMatchObject({
      code: "failed",
    });
    expect(JSON.stringify(logged.mock.calls)).not.toContain(secret);
    expect(logged.mock.calls).toEqual([["Sermon document save failed:", "Error"]]);
  });
});

describe("strict document input (A2.3A.1)", () => {
  /** A database that fails the test if it is asked anything. */
  const untouchable = () =>
    new Proxy(
      {},
      {
        get: () => () => {
          throw new Error("the database was asked");
        },
      },
    );

  it("refuses unstorable text and non-JSON values as invalid, before the database is asked", async () => {
    signInAs(me);
    state.db = untouchable();
    const nul = documentV4([pointV4("p-1", "Grace", 1), proseV4("a\u0000b", 1)]);
    const unstorable = await saveOutlineDocument(outlineId, nul, 0);
    expect(unstorable).toMatchObject({
      ok: false,
      code: "invalid",
      problems: [{ code: "unstorable_text", path: "/content/1/content/0/text", detail: "nul" }],
    });
    expect(unstorable.message).toContain("can't be saved");

    const lone = documentV4([pointV4("p-1", "Grace\ud800", 1)]);
    expect(await saveOutlineDocument(outlineId, lone, 0)).toMatchObject({
      code: "invalid",
      problems: [{ code: "unstorable_text", detail: "unpaired_surrogate" }],
    });

    const notJson = { ...sermon("Grace"), attrs: { schemaVersion: 4, page: Number.NaN } };
    expect(await saveOutlineDocument(outlineId, notJson, 0)).toMatchObject({
      code: "invalid",
      message: "That request was not valid.",
      problems: [{ code: "not_json", path: "/attrs/page", detail: "NaN" }],
    });
  });

  it("keeps the stored document exactly when such a save is refused", async () => {
    signInAs(me);
    await convertOutlineDocument(outlineId);
    await saveOutlineDocument(outlineId, sermon("Kept"), 0);
    const [before] = await db.select().from(sermonOutlineDocuments);
    const nul = documentV4([pointV4("p-1", "Grace", 1), proseV4("a\u0000b", 1)]);
    expect(await saveOutlineDocument(outlineId, nul, 1)).toMatchObject({ code: "invalid" });
    const [after] = await db.select().from(sermonOutlineDocuments);
    expect(after).toEqual(before);
  });
});

describe("readOutlineDocument (A2.3A.1)", () => {
  const rowOf = async (id: string) =>
    (await db.select().from(sermonOutlineDocuments)).find((row) => row.outlineId === id);

  it("refuses a caller who is not signed in, and reads nothing", async () => {
    state.db = new Proxy(
      {},
      {
        get: () => () => {
          throw new Error("the database was asked");
        },
      },
    );
    expect(await readOutlineDocument(outlineId)).toEqual({ ok: false, message: signedOut });
  });

  it("gives the canonical document and its revision, as plain JSON a Client Component can take", async () => {
    signInAs(me);
    await convertOutlineDocument(outlineId);
    await saveOutlineDocument(outlineId, sermon("Grace upon grace"), 0);
    const read = await readOutlineDocument(outlineId.toUpperCase());
    expect(read).toMatchObject({ ok: true, revision: 1, message: "Sermon document loaded." });
    expect(read.content).toEqual((await rowOf(outlineId))!.content);
    expect(JSON.stringify(read.content)).toContain("Grace upon grace");
    // React refuses an object without a prototype in either direction.
    await expect(encodeReply([read.content] as never)).resolves.toBeTypeOf("string");
  });

  it("never gives another account's document: the same answer as none", async () => {
    signInAs(other);
    await convertOutlineDocument(theirs);
    signInAs(me);
    expect(await readOutlineDocument(theirs)).toEqual({
      ok: false,
      code: "missing",
      message: "That outline no longer exists.",
    });
    expect(await readOutlineDocument(outlineId)).toMatchObject({ ok: false, code: "missing" });
    expect(await readOutlineDocument("0b6a3c1e-9d54-4c7e-8a55-1f1f6d3b2a10")).toMatchObject({
      code: "missing",
    });
    expect(await readOutlineDocument("nope")).toMatchObject({ ok: false, code: "invalid" });
  });

  it("says unreadable with the revision, and neither the content nor its problems", async () => {
    signInAs(me);
    await db.insert(sermonOutlineDocuments).values({
      outlineId,
      ownerId: me,
      content: { type: "doc", attrs: { schemaVersion: 99, secret } },
    });
    const read = await readOutlineDocument(outlineId);
    expect(read).toEqual({
      ok: false,
      code: "unreadable",
      revision: 0,
      message:
        "This outline's sermon document can't be read right now. It was left exactly as it was.",
    });
    expect(JSON.stringify(read)).not.toContain(secret);
  });

  it("changes nothing: not the content, the revision, or the time it was saved", async () => {
    signInAs(me);
    await convertOutlineDocument(outlineId);
    await saveOutlineDocument(outlineId, sermon("Grace"), 0);
    const before = await rowOf(outlineId);
    for (let i = 0; i < 3; i++) await readOutlineDocument(outlineId);
    expect(await rowOf(outlineId)).toEqual(before);
    expect(await db.select().from(sermonOutlineDocuments)).toHaveLength(1);
    // Reading an outline with no document does not make one.
    const second = await outlined(me);
    await readOutlineDocument(second);
    expect(await rowOf(second)).toBeUndefined();
  });

  it("reports a failing database as failed, without logging the document", async () => {
    signInAs(me);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = Object.assign(new Error(`Failed query: select …\nparams: ${secret}`), {
      cause: Object.assign(new Error("connection terminated"), { code: "08006" }),
    });
    state.db = new Proxy(
      {},
      {
        get: () => () => {
          throw failure;
        },
      },
    );
    expect(await readOutlineDocument(outlineId)).toEqual({
      ok: false,
      code: "failed",
      message: "This sermon document could not be loaded. Try again.",
    });
    expect(logged.mock.calls).toEqual([["Sermon document read failed:", "Error (08006)"]]);
    expect(JSON.stringify(logged.mock.calls)).not.toContain(secret);
  });
});

describe("while conversion is switched off (A3)", () => {
  it("refuses to convert before reading anything, and still saves a converted outline", async () => {
    signInAs(me);
    expect(await convertOutlineDocument(outlineId)).toMatchObject({ ok: true });
    vi.stubEnv("SERMON_DOCUMENT_CONVERSION", "off");
    expect(await convertOutlineDocument(theirs)).toEqual({
      ok: false,
      code: "disabled",
      message: "This outline opens in the outline editor for now.",
    });
    const rows = await db.select().from(sermonOutlineDocuments);
    expect(rows.map((row) => row.outlineId)).toEqual([outlineId]);
    // A document that exists stays the outline's: saving it is not conversion.
    expect(await saveOutlineDocument(outlineId, sermon("Grace, again"), 0)).toMatchObject({
      ok: true,
      revision: 1,
    });
  });

  it("is off for anything but exactly 'on'", async () => {
    signInAs(me);
    vi.stubEnv("SERMON_DOCUMENT_CONVERSION", "true");
    expect(await convertOutlineDocument(outlineId)).toMatchObject({ code: "disabled" });
    expect(await db.select().from(sermonOutlineDocuments)).toHaveLength(0);
  });
});
