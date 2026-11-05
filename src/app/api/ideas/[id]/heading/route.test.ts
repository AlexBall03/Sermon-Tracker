// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { users } from "@/db/schema";
import { createTestDatabase } from "@/db/testing";
import type { Database } from "@/db/types";
import type { Authorization } from "@/features/auth/access";
import { createIdea, renameIdeaAt } from "@/features/ideas/ideas";
import { ideaInputSchema } from "@/features/ideas/schemas";

// The access helper is mocked; the database is a real in-memory PostgreSQL.
const state = vi.hoisted(() => ({
  access: { ok: false, message: "Your session has ended. Sign in again." } as unknown,
  db: undefined as unknown,
}));

vi.mock("@/db", () => ({ getDb: () => state.db }));
vi.mock("@/features/auth/access", () => ({
  authorize: async (): Promise<Authorization> => state.access as Authorization,
}));

import { GET } from "./route";

let db: Database;
let me: string;
let other: string;

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

const ask = (id: string) =>
  GET(new Request(`https://sermontracker.test/api/ideas/${id}/heading`), {
    params: Promise.resolve({ id }),
  });

beforeEach(async () => {
  db = await createTestDatabase();
  state.db = db;
  const rows = await db
    .insert(users)
    .values([{ clerkUserId: "user_me" }, { clerkUserId: "user_other" }])
    .returning();
  [me, other] = rows.map((row) => row.id);
  state.access = { ok: false, message: "Your session has ended. Sign in again." };
});

describe("GET /api/ideas/[id]/heading (A4.3)", () => {
  it("answers the caller's own idea with its title and revision, never cached", async () => {
    signInAs(me);
    const idea = await createIdea(db, me, ideaInputSchema.parse({ title: "Old" }));
    await renameIdeaAt(db, me, idea!.id, "New", 0);
    const response = await ask(idea!.id);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ title: "New", revision: 1 });
  });

  it("answers another account's idea as it answers none", async () => {
    const theirs = await createIdea(db, other, ideaInputSchema.parse({ title: "Theirs" }));
    signInAs(me);
    const response = await ask(theirs!.id);
    expect(response.status).toBe(404);
    expect(JSON.stringify(await response.json())).not.toContain("Theirs");
    expect((await ask("77777777-7777-4777-8777-777777777777")).status).toBe(404);
  });

  it("refuses a signed-out caller and a malformed ID", async () => {
    expect((await ask("77777777-7777-4777-8777-777777777777")).status).toBe(401);
    signInAs(me);
    expect((await ask("not-an-id")).status).toBe(400);
  });
});
