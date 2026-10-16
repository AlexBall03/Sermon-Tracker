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
  email: "unverified" as "verified" | "unverified",
  configured: true,
  /** What the browser sends: its language cookie, and the languages it asks for. */
  localeCookie: undefined as string | undefined,
  acceptLanguage: null as string | null,
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
    users: {
      getUser: async () => ({
        publicMetadata: state.metadata,
        primaryEmailAddressId: "email_1",
        emailAddresses: [{ id: "email_1", verification: { status: state.email } }],
      }),
    },
  }),
}));
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (state.localeCookie ? { value: state.localeCookie } : undefined),
  }),
  headers: async () =>
    new Headers(state.acceptLanguage ? { "accept-language": state.acceptLanguage } : {}),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));

import { authorize, getAccess, requireAccount, requireActiveUser, requireAdmin } from "./access";

/** Every account there is has finished first-time setup, or never owed it. */
const settle = (status: "completed" | "grandfathered" = "grandfathered") =>
  db.update(users).set({
    onboardingStatus: status,
    onboardingCompletedAt: status === "completed" ? new Date() : null,
  });

let db: Database;
beforeEach(async () => {
  db = await createTestDatabase();
  Object.assign(state, { db, userId: null, metadata: {}, email: "unverified", configured: true });
  Object.assign(state, { localeCookie: undefined, acceptLanguage: null });
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

  it("denies a new identity whose email is not verified", async () => {
    state.userId = "user_stranger";
    expect(await getAccess()).toEqual({ state: "denied", reason: "unverified" });
    expect(await db.select().from(users)).toHaveLength(0);
    await expect(requireActiveUser()).rejects.toThrow("redirect:/access-denied");
  });

  it("admits a public sign-up with a verified email as a standard user", async () => {
    Object.assign(state, { userId: "user_public", email: "verified" });
    expect(await getAccess()).toMatchObject({
      state: "active",
      user: { role: "user", status: "active", onboardingStatus: "pending" },
    });
    await settle();
    expect(await authorize("admin")).toMatchObject({ ok: false });
  });

  it("admits an invited identity as a standard user", async () => {
    Object.assign(state, { userId: "user_a", metadata: { appAccess: true } });
    expect(await getAccess()).toMatchObject({ state: "active", user: { role: "user" } });
    await settle();
    await expect(requireAdmin()).rejects.toThrow("redirect:/access-denied");
    expect(await authorize("active")).toMatchObject({ ok: true });
    expect(await authorize("admin")).toMatchObject({ ok: false });
  });

  it("starts a new account in the browser's language, the language cookie's first", async () => {
    Object.assign(state, { metadata: { appAccess: true }, acceptLanguage: "es-MX,es;q=0.9" });
    state.userId = "user_a";
    expect(await getAccess()).toMatchObject({ state: "active", user: { locale: "es" } });

    Object.assign(state, { userId: "user_b", localeCookie: "en" });
    expect(await getAccess()).toMatchObject({ state: "active", user: { locale: "en" } });

    // An account that exists keeps what it saved, whatever the browser asks for.
    Object.assign(state, { userId: "user_a", localeCookie: undefined, acceptLanguage: "en" });
    expect(await getAccess()).toMatchObject({ state: "active", user: { locale: "es" } });
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
    await getAccess();
    await settle();
    expect((await requireAdmin()).role).toBe("admin");
    expect(await authorize("admin")).toMatchObject({ ok: true });
  });
});

describe("first-time setup", () => {
  beforeEach(() => {
    Object.assign(state, { userId: "user_a", metadata: { appAccess: true } });
  });

  it("sends a new account to setup from every page, and refuses its actions", async () => {
    expect(await getAccess()).toMatchObject({
      state: "active",
      user: { onboardingStatus: "pending", onboardingStep: "welcome" },
    });
    await expect(requireActiveUser()).rejects.toThrow("redirect:/onboarding");
    await expect(requireAdmin()).rejects.toThrow("redirect:/onboarding");
    expect(await authorize("active")).toEqual({
      ok: false,
      message: "Finish setting up your account first.",
    });
    expect(await authorize("admin")).toMatchObject({ ok: false });
  });

  it("holds a new administrator to it as well", async () => {
    state.userId = "user_owner";
    expect(await getAccess()).toMatchObject({ user: { role: "admin" } });
    await expect(requireAdmin()).rejects.toThrow("redirect:/onboarding");
    expect(await authorize("admin")).toMatchObject({ ok: false });
  });

  it("lets a new account reach setup itself, and what setup saves through", async () => {
    expect((await requireAccount()).onboardingStatus).toBe("pending");
    expect(await authorize("account")).toMatchObject({ ok: true });
  });

  it.each(["completed", "grandfathered"] as const)(
    "lets an account that is %s through everywhere",
    async (status) => {
      await getAccess();
      await settle(status);
      expect((await requireActiveUser()).onboardingStatus).toBe(status);
      expect((await requireAccount()).onboardingStatus).toBe(status);
      expect(await authorize("active")).toMatchObject({ ok: true });
      expect(await authorize("account")).toMatchObject({ ok: true });
    },
  );

  it("denies a disabled account before setup is considered", async () => {
    await getAccess();
    await db.update(users).set({ status: "disabled" });
    await expect(requireAccount()).rejects.toThrow("redirect:/access-denied");
    await expect(requireActiveUser()).rejects.toThrow("redirect:/access-denied");
    expect(await authorize("account")).toEqual({
      ok: false,
      message: "Your account does not have access.",
    });
  });

  it("keeps a guest and a stranger out of setup", async () => {
    state.userId = null;
    await expect(requireAccount()).rejects.toThrow("redirect:/sign-in");
    expect(await authorize("account")).toMatchObject({ ok: false });
    Object.assign(state, { userId: "user_stranger", metadata: {} });
    await expect(requireAccount()).rejects.toThrow("redirect:/access-denied");
  });
});
