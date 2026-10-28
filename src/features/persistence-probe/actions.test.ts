// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ideas, sermonOutlineDocuments, sermonOutlines, users } from "@/db/schema";
import { createTestDatabase } from "@/db/testing";
import type { Database } from "@/db/types";
import type { Authorization } from "@/features/auth/access";

/* The persistence probe's fixtures (A2.3B.2D): development only, and only its own. */

const state = vi.hoisted(() => ({
  access: { ok: false, message: "Your session has ended. Sign in again." } as unknown,
  db: undefined as unknown,
}));
vi.mock("@/db", () => ({ getDb: () => state.db }));
vi.mock("@/features/auth/access", () => ({
  authorize: async (): Promise<Authorization> => state.access as Authorization,
}));

import { createProbeFixture, removeProbeFixture } from "./actions";

let db: Database;
let me: string;
let other: string;

const signInAs = (id: string) => {
  state.access = { ok: true, user: { id, role: "user", status: "active" } };
};
const counts = async () => ({
  ideas: (await db.select().from(ideas)).length,
  outlines: (await db.select().from(sermonOutlines)).length,
  documents: (await db.select().from(sermonOutlineDocuments)).length,
});

beforeEach(async () => {
  vi.stubEnv("NODE_ENV", "development");
  db = await createTestDatabase();
  state.db = db;
  const rows = await db
    .insert(users)
    .values([{ clerkUserId: "user_me" }, { clerkUserId: "user_other" }])
    .returning();
  [me, other] = rows.map((row) => row.id);
  signInAs(me);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("persistence probe fixtures", () => {
  it("does nothing outside development", async () => {
    for (const environment of ["production", "test"]) {
      vi.stubEnv("NODE_ENV", environment);
      expect(await createProbeFixture()).toEqual({ ok: false });
      expect(await removeProbeFixture("0b6a3c1e-9d54-4c7e-8a55-1f1f6d3b2a10")).toEqual({
        ok: false,
      });
    }
    expect(await counts()).toEqual({ ideas: 0, outlines: 0, documents: 0 });
  });

  it("does nothing for a caller who is not signed in", async () => {
    state.access = { ok: false, message: "Your session has ended. Sign in again." };
    expect(await createProbeFixture()).toEqual({ ok: false });
    expect(await counts()).toEqual({ ideas: 0, outlines: 0, documents: 0 });
  });

  it("makes a disposable sermon, outline, and document, and removes exactly that", async () => {
    const made = await createProbeFixture();
    expect(made).toMatchObject({ ok: true, revision: 0 });
    expect(await counts()).toEqual({ ideas: 1, outlines: 1, documents: 1 });
    if (!made.ok) return;
    expect(await removeProbeFixture(made.sermonId)).toEqual({ ok: true });
    expect(await counts()).toEqual({ ideas: 0, outlines: 0, documents: 0 });
  });

  it("never removes a sermon that is not a probe fixture, or another account's fixture", async () => {
    const [mine] = await db
      .insert(ideas)
      .values({ ownerId: me, kind: "sermon", title: "Grace abounding" })
      .returning();
    const [lookalike] = await db
      .insert(ideas)
      .values({ ownerId: me, kind: "point", title: "[Persistence probe fixture] 2026" })
      .returning();
    signInAs(other);
    const theirs = await createProbeFixture();
    signInAs(me);
    for (const id of [mine.id, lookalike.id, theirs.ok ? theirs.sermonId : "", "nope"]) {
      expect(await removeProbeFixture(id)).toEqual({ ok: false });
    }
    expect(await counts()).toEqual({ ideas: 3, outlines: 1, documents: 1 });
  });
});
