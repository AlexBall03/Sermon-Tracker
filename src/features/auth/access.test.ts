// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { users } from "@/db/schema";
import { createTestDatabase } from "@/db/testing";
import type { Database } from "@/db/types";

// Clerk is mocked: these tests cover the application's decisions, not Clerk's.
const state = vi.hoisted(() => ({
  db: undefined as unknown,
  userId: null as string | null,
  metadata: {} as Record<string, unknown>,
  configured: true,
}));

vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  cache: <T>(fn: T) => fn,
}));
vi.mock("@/db", () => ({ getDb: () => state.db }));
vi.mock("@/lib/env", () => ({
  env: { INITIAL_ADMIN_CLERK_USER_ID: "user_owner" },
  isAuthConfigured: () => state.configured,
}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: state.userId }),
  clerkClient: async () => ({
    users: { getUser: async () => ({ publicMetadata: state.metadata }) },
  }),
}));
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));

import { authorize, getAccess, requireActiveUser, requireAdmin } from "./access";

let db: Database;
beforeEach(async () => {
  db = await createTestDatabase();
  Object.assign(state, { db, userId: null, metadata: {}, configured: true });
});

describe("getAccess", () => {
  it("treats a missing session as signed out", async () => {
    expect(await getAccess()).toEqual({ state: "signed-out" });
    await expect(requireActiveUser()).rejects.toThrow("redirect:/sign-in");
  });

  it("is signed out when authentication is not configured", async () => {
    Object.assign(state, { configured: false, userId: "user_a" });
    expect(await getAccess()).toEqual({ state: "signed-out" });
  });

  it("denies a Clerk identity that was never invited", async () => {
    state.userId = "user_stranger";
    expect(await getAccess()).toEqual({ state: "denied", reason: "not-invited" });
    expect(await db.select().from(users)).toHaveLength(0);
    await expect(requireActiveUser()).rejects.toThrow("redirect:/access-denied");
  });

  it("admits an invited identity as a standard user", async () => {
    Object.assign(state, { userId: "user_a", metadata: { appAccess: true } });
    expect(await getAccess()).toMatchObject({ state: "active", user: { role: "user" } });
    await expect(requireAdmin()).rejects.toThrow("redirect:/access-denied");
    expect(await authorize("active")).toMatchObject({ ok: true });
    expect(await authorize("admin")).toMatchObject({ ok: false });
  });

  it("only accepts the exact metadata flag", async () => {
    Object.assign(state, { userId: "user_a", metadata: { appAccess: "true" } });
    expect(await getAccess()).toMatchObject({ state: "denied" });
  });

  it("keeps a disabled account out while its Clerk session is still valid", async () => {
    await db.insert(users).values({ clerkUserId: "user_a", role: "admin", status: "disabled" });
    Object.assign(state, { userId: "user_a", metadata: { appAccess: true } });
    expect(await getAccess()).toEqual({ state: "denied", reason: "disabled" });
    await expect(requireActiveUser()).rejects.toThrow("redirect:/access-denied");
    expect(await authorize("admin")).toMatchObject({ ok: false });
  });

  it("admits the configured initial administrator", async () => {
    state.userId = "user_owner";
    expect((await requireAdmin()).role).toBe("admin");
    expect(await authorize("admin")).toMatchObject({ ok: true });
  });
});
