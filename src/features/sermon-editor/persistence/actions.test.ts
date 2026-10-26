// @vitest-environment node
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

import { convertOutlineDocument, saveOutlineDocument } from "./actions";

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
