// @vitest-environment node
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { users } from "@/db/schema";
import { createTestDatabase } from "@/db/testing";
import type { Database } from "@/db/types";

/*
 * Where the tour stands, from end to end on the server: the real access
 * helpers, the real actions, and a real in-memory PostgreSQL with the
 * committed migrations. Only Clerk and Next's request are stood in for.
 */
const state = vi.hoisted(() => ({
  db: undefined as unknown,
  userId: null as string | null,
  revalidatePath: vi.fn(),
}));

vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  cache: <T>(fn: T) => fn,
}));
vi.mock("@/db", () => ({ getDb: () => state.db }));
vi.mock("@/lib/env", () => ({
  env: { INITIAL_ADMIN_CLERK_USER_ID: undefined },
  isAuthConfigured: () => true,
}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: state.userId }),
  clerkClient: async () => ({
    users: { getUser: async () => ({ publicMetadata: { appAccess: true } }) },
  }),
}));
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {} }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: state.revalidatePath }));

import { authorize } from "@/features/auth/access";
import type { OnboardingStatus, TourState } from "@/features/onboarding/model";
import { completeProductTour, dismissProductTour, markTourOffered } from "./actions";
import { shouldOfferTour } from "./model";
import { completeTour, dismissTour, offerTour } from "./tour";

let db: Database;

const account = async (clerkUserId: string) =>
  (await db.select().from(users).where(eq(users.clerkUserId, clerkUserId)))[0];
const me = () => account("user_me");

/** A signed-in account, made on its first request, then put where the test needs it. */
async function signIn(
  clerkUserId = "user_me",
  set: { onboardingStatus?: OnboardingStatus; tourState?: TourState } = {},
) {
  state.userId = clerkUserId;
  expect(await authorize("account")).toMatchObject({ ok: true });
  const status = set.onboardingStatus ?? "completed";
  await db
    .update(users)
    .set({
      onboardingStatus: status,
      onboardingStep: "finish",
      onboardingCompletedAt: status === "completed" ? new Date() : null,
      ...(set.tourState ? { tourState: set.tourState } : {}),
    })
    .where(eq(users.clerkUserId, clerkUserId));
  return account(clerkUserId);
}

beforeEach(async () => {
  db = await createTestDatabase();
  Object.assign(state, { db, userId: null });
  state.revalidatePath.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("who is offered the tour", () => {
  it("an account that has just been through setup, until it answers", () => {
    const offer = (onboardingStatus: OnboardingStatus, tourState: TourState) =>
      shouldOfferTour({ onboardingStatus, tourState });
    expect(offer("completed", "not_offered")).toBe(true);
    expect(offer("completed", "offered")).toBe(true);
    expect(offer("completed", "dismissed")).toBe(false);
    expect(offer("completed", "completed")).toBe(false);
    // An account from before setup existed is not interrupted; one still in setup is not here yet.
    expect(offer("grandfathered", "not_offered")).toBe(false);
    expect(offer("pending", "not_offered")).toBe(false);
  });
});

describe("the tour's state", () => {
  it("is offered, then completed, once each, however often asked", async () => {
    await signIn();
    expect(await markTourOffered()).toMatchObject({ ok: true });
    expect((await me()).tourState).toBe("offered");
    expect(state.revalidatePath).toHaveBeenCalledWith("/dashboard");

    state.revalidatePath.mockClear();
    expect(await markTourOffered()).toMatchObject({ ok: true });
    expect(state.revalidatePath).not.toHaveBeenCalled();

    expect(await completeProductTour()).toMatchObject({ ok: true });
    expect((await me()).tourState).toBe("completed");
    state.revalidatePath.mockClear();
    expect(await completeProductTour()).toMatchObject({ ok: true });
    expect(state.revalidatePath).not.toHaveBeenCalled();
  });

  it("keeps Maybe Later, and is not offered again after it", async () => {
    await signIn();
    await markTourOffered();
    expect(await dismissProductTour()).toMatchObject({ ok: true });
    const after = await me();
    expect(after.tourState).toBe("dismissed");
    expect(shouldOfferTour(after)).toBe(false);
    // A stale tab showing the invitation cannot bring it back.
    await markTourOffered();
    expect((await me()).tourState).toBe("dismissed");
  });

  it("only moves on: a dismissed tour can be completed, a completed one stays so", async () => {
    await signIn("user_me", { tourState: "dismissed" });
    await completeProductTour();
    expect((await me()).tourState).toBe("completed");
    // Running it again from Settings and skipping it takes nothing back.
    await dismissProductTour();
    await markTourOffered();
    expect((await me()).tourState).toBe("completed");
  });

  it("is never offered to an account that did not go through setup", async () => {
    await signIn("user_me", { onboardingStatus: "grandfathered" });
    await markTourOffered();
    expect((await me()).tourState).toBe("not_offered");
    // It can still run the tour from Settings, and finishing it is kept.
    await completeProductTour();
    expect((await me()).tourState).toBe("completed");
  });

  it("refuses an account still in setup, and a signed-out caller, writing nothing", async () => {
    await signIn("user_me", { onboardingStatus: "pending" });
    expect(await markTourOffered()).toMatchObject({ ok: false });
    expect(await dismissProductTour()).toMatchObject({ ok: false });
    expect(await completeProductTour()).toMatchObject({ ok: false });
    expect((await me()).tourState).toBe("not_offered");

    state.userId = null;
    expect(await completeProductTour()).toMatchObject({ ok: false });
  });

  it("writes the caller's own row and only its tour column", async () => {
    const other = await signIn("user_other");
    const before = await signIn("user_me");
    await markTourOffered();
    await completeProductTour();

    expect(await account("user_other")).toEqual(other);
    const after = await me();
    expect({ ...after, tourState: before.tourState, updatedAt: before.updatedAt }).toEqual(before);
    expect(after.tourState).toBe("completed");
  });

  it("two answers at once settle on one", async () => {
    const user = await signIn();
    await offerTour(db, user.id);
    const [dismissed, completed] = await Promise.all([
      dismissTour(db, user.id),
      completeTour(db, user.id),
    ]);
    expect(dismissed || completed).toBe(true);
    expect(["dismissed", "completed"]).toContain((await me()).tourState);
  });

  it("says so when the answer could not be saved", async () => {
    await signIn();
    // The account is read as usual; the write fails.
    state.db = new Proxy(db, {
      get: (target, key, receiver) =>
        key === "update"
          ? () => {
              throw new Error("connection lost");
            }
          : Reflect.get(target, key, receiver),
    });
    expect(await dismissProductTour()).toMatchObject({ ok: false });
    expect(state.revalidatePath).not.toHaveBeenCalled();
  });
});
