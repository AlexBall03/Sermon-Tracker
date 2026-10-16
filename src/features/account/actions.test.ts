// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { users, type AppUser } from "@/db/schema";
import { createTestDatabase } from "@/db/testing";
import type { Database } from "@/db/types";

const state = vi.hoisted(() => ({
  db: undefined as unknown,
  access: { ok: false, message: "Your session has ended." } as unknown,
  verified: true,
  deleteIdentity: vi.fn(async () => {}),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ getDb: () => state.db }));
vi.mock("@/i18n/server", async () => {
  const { dictionary } = await import("@/i18n");
  return { getT: async (feature: "settings") => dictionary("en", feature) };
});
vi.mock("@/features/auth/access", () => ({ authorize: async () => state.access }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ has: () => state.verified }),
  reverificationError: (level: string) => ({
    clerk_error: { reason: "reverification-error", level },
  }),
}));
vi.mock("./live", () => ({
  liveDeletionDeps: { deleteBlobs: async () => true, deleteIdentity: state.deleteIdentity },
}));

import { deleteMyAccount } from "./actions";
import { isCronRequest } from "./cron";

let db: Database;
let me: AppUser;

beforeEach(async () => {
  db = await createTestDatabase();
  state.db = db;
  state.verified = true;
  vi.clearAllMocks();
  [me] = await db.insert(users).values({ clerkUserId: "user_me" }).returning();
  state.access = { ok: true, user: me };
});

describe("deleteMyAccount", () => {
  it("is refused without a session", async () => {
    state.access = { ok: false, message: "Your session has ended." };
    expect(await deleteMyAccount()).toMatchObject({ ok: false });
    expect(await db.select().from(users)).toHaveLength(1);
  });

  it("asks Clerk to confirm it is them before anything is locked", async () => {
    state.verified = false;
    expect(await deleteMyAccount()).toMatchObject({ clerk_error: { level: "strict" } });
    const [row] = await db.select().from(users);
    expect(row.status).toBe("active");
  });

  it("deletes the caller's own account", async () => {
    expect(await deleteMyAccount()).toMatchObject({ ok: true, completed: true });
    expect(state.deleteIdentity).toHaveBeenCalledWith("user_me");
    expect(await db.select().from(users)).toHaveLength(0);
  });

  it("says the deletion is pending when a step has not finished", async () => {
    state.deleteIdentity.mockRejectedValueOnce(new Error("Clerk is down"));
    expect(await deleteMyAccount()).toMatchObject({ ok: true, completed: false });
    const [row] = await db.select().from(users);
    expect(row.status).toBe("deleting");
  });
});

describe("isCronRequest", () => {
  const secret = "s".repeat(32);
  const request = (authorization?: string) =>
    new Request("http://localhost/api/cron/account-deletions", {
      headers: authorization ? { authorization } : {},
    });

  it("accepts only the configured bearer secret", () => {
    expect(isCronRequest(request(`Bearer ${secret}`), secret)).toBe(true);
    expect(isCronRequest(request("Bearer wrong"), secret)).toBe(false);
    expect(isCronRequest(request(), secret)).toBe(false);
    expect(isCronRequest(request(`Bearer ${secret}`), undefined)).toBe(false);
  });
});
