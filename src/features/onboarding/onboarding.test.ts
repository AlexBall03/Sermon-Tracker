// @vitest-environment node
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { appSettings, users } from "@/db/schema";
import { createTestDatabase } from "@/db/testing";
import type { Database } from "@/db/types";

/*
 * First-time setup from end to end on the server: the real access helpers,
 * the real actions (setup's own two, and the three of features/preferences it
 * saves through), and a real in-memory PostgreSQL with the committed
 * migrations. Only Clerk and Next's request are stood in for.
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

import { authorize, requireActiveUser } from "@/features/auth/access";
import { setBibleTranslation, setLocale, updateProfile } from "@/features/preferences/actions";
import { advanceOnboarding, finishOnboarding } from "./actions";
import { advanceStep, completeOnboarding } from "./onboarding";

let db: Database;

const account = async (clerkUserId: string) =>
  (await db.select().from(users).where(eq(users.clerkUserId, clerkUserId)))[0];
const me = () => account("user_me");
/** A first signed-in request: the account is made, owing setup. */
const signIn = async (clerkUserId = "user_me") => {
  state.userId = clerkUserId;
  expect(await authorize("account")).toMatchObject({ ok: true });
  return account(clerkUserId);
};
/** An account that was there before there was a setup. */
const grandfather = (clerkUserId: string) =>
  db
    .update(users)
    .set({ onboardingStatus: "grandfathered" })
    .where(eq(users.clerkUserId, clerkUserId));

beforeEach(async () => {
  db = await createTestDatabase();
  Object.assign(state, { db, userId: null });
  state.revalidatePath.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("a new account", () => {
  it("is kept out of the application until setup is finished, then let in", async () => {
    await signIn();
    await expect(requireActiveUser()).rejects.toThrow("redirect:/onboarding");
    expect(await authorize("active")).toMatchObject({ ok: false });

    expect(await advanceOnboarding("ministry")).toMatchObject({ ok: true, step: "ministry" });
    expect(await advanceOnboarding("preferences")).toMatchObject({ ok: true, step: "preferences" });
    expect(await advanceOnboarding("finish")).toMatchObject({ ok: true, step: "finish" });
    // Reaching the last step is not finishing it.
    await expect(requireActiveUser()).rejects.toThrow("redirect:/onboarding");

    expect(await finishOnboarding()).toMatchObject({ ok: true });
    expect(await me()).toMatchObject({ onboardingStatus: "completed", onboardingStep: "finish" });
    expect((await me()).onboardingCompletedAt).toBeInstanceOf(Date);
    expect((await requireActiveUser()).onboardingStatus).toBe("completed");
    expect(await authorize("active")).toMatchObject({ ok: true });
    // The tour is Phase 4B's: finishing setup neither offers nor starts it.
    expect((await me()).tourState).toBe("not_offered");
  });

  it("finishes with every optional detail left blank", async () => {
    await signIn();
    await advanceOnboarding("finish");
    expect(await finishOnboarding()).toMatchObject({ ok: true });
    expect(await me()).toMatchObject({
      onboardingStatus: "completed",
      churchName: null,
      ministryRole: null,
      attendsPreachingClass: false,
      bibleTranslation: null,
    });
  });

  it("saves its profile, language, and translation through the existing actions", async () => {
    await signIn();
    expect(
      await updateProfile({
        churchName: "  Grace   Baptist Church ",
        ministryRole: "",
        attendsPreachingClass: true,
      }),
    ).toMatchObject({ ok: true });
    expect(await setBibleTranslation("kjv")).toMatchObject({ ok: true });
    // A new language takes the translation with it, as it does in Settings.
    expect(await setLocale("es")).toMatchObject({ ok: true });
    expect(await me()).toMatchObject({
      churchName: "Grace Baptist Church",
      ministryRole: null,
      attendsPreachingClass: true,
      locale: "es",
      bibleTranslation: null,
      // None of it finishes setup or moves it on.
      onboardingStatus: "pending",
      onboardingStep: "welcome",
    });
    // And a translation chosen on its own leaves the language alone.
    expect(await setBibleTranslation("kjv")).toMatchObject({ ok: true });
    expect(await me()).toMatchObject({ locale: "es", bibleTranslation: "kjv" });
  });

  it("is refused Spanish and the Spanish Bible while an administrator has them off", async () => {
    await signIn();
    await db.insert(appSettings).values({ spanishEnabled: false });
    expect(await setLocale("es")).toMatchObject({ ok: false });
    expect(await setBibleTranslation("rvg")).toMatchObject({ ok: false });
    expect(await me()).toMatchObject({ locale: "en", bibleTranslation: null });
    // English and the King James still save, and setup still finishes.
    expect(await setBibleTranslation("kjv")).toMatchObject({ ok: true });
    await advanceOnboarding("finish");
    expect(await finishOnboarding()).toMatchObject({ ok: true });
  });

  it("keeps what it saved before, when the switch goes off during setup", async () => {
    await signIn();
    await setLocale("es");
    await setBibleTranslation("rvg");
    await db.insert(appSettings).values({ spanishEnabled: false });
    await advanceOnboarding("finish");
    // Said in English now, and nothing stored is rewritten.
    expect(await finishOnboarding()).toEqual({ ok: true, message: "Setup is complete." });
    expect(await me()).toMatchObject({ locale: "es", bibleTranslation: "rvg" });
  });
});

describe("progress", () => {
  it("is kept on the account, and found again on the next request", async () => {
    await signIn();
    await advanceOnboarding("preferences");
    // Another device: nothing but the session.
    state.userId = null;
    expect((await signIn()).onboardingStep).toBe("preferences");
  });

  it("never moves backward for a stale request", async () => {
    await signIn();
    await advanceOnboarding("preferences");
    // A second tab, still on the first step, presses Get Started.
    expect(await advanceOnboarding("ministry")).toMatchObject({ ok: true, step: "preferences" });
    expect(await advanceOnboarding("welcome")).toMatchObject({ ok: true, step: "preferences" });
    expect((await me()).onboardingStep).toBe("preferences");
  });

  it("is the same after a repeated request, and after several at once", async () => {
    const user = await signIn();
    const answers = await Promise.all([
      advanceOnboarding("ministry"),
      advanceOnboarding("ministry"),
      advanceOnboarding("preferences"),
      advanceOnboarding("ministry"),
    ]);
    expect(answers.every((answer) => answer.ok)).toBe(true);
    expect((await me()).onboardingStep).toBe("preferences");
    // The repeat wrote nothing: the row is as the first left it.
    const before = await me();
    expect(await advanceStep(db, user.id, "preferences")).toEqual({
      status: "pending",
      step: "preferences",
    });
    expect(await me()).toEqual(before);
  });

  it("refuses a step that is not one, and takes no account from its input", async () => {
    await signIn();
    const other = await signIn("user_other");
    state.userId = "user_me";
    expect(await advanceOnboarding("tour")).toMatchObject({ ok: false });
    expect(await advanceOnboarding({ step: "finish", userId: other.id })).toMatchObject({
      ok: false,
    });
    expect(await advanceOnboarding("finish")).toMatchObject({ ok: true });
    expect((await account("user_other")).onboardingStep).toBe("welcome");
  });
});

describe("finishing", () => {
  it("is refused before the last step is reached, and writes nothing", async () => {
    await signIn();
    expect(await finishOnboarding()).toMatchObject({ ok: false, step: "welcome" });
    await advanceOnboarding("preferences");
    expect(await finishOnboarding()).toMatchObject({ ok: false, step: "preferences" });
    expect(await me()).toMatchObject({ onboardingStatus: "pending", onboardingCompletedAt: null });
  });

  it("happens once however often it is asked", async () => {
    const user = await signIn();
    await advanceOnboarding("finish");
    expect(await completeOnboarding(db, user.id)).toEqual({ code: "completed" });
    const first = await me();
    expect(await completeOnboarding(db, user.id)).toEqual({ code: "already" });
    expect(await finishOnboarding()).toMatchObject({ ok: true });
    expect(await me()).toEqual(first);
  });

  it("is one finish for two requests at once", async () => {
    const user = await signIn();
    await advanceOnboarding("finish");
    const codes = (
      await Promise.all([completeOnboarding(db, user.id), completeOnboarding(db, user.id)])
    ).map((result) => result.code);
    expect(codes.sort()).toEqual(["already", "completed"]);
  });

  it("opens the application's pages only when it really finished", async () => {
    await signIn();
    await finishOnboarding();
    expect(state.revalidatePath).not.toHaveBeenCalled();
    await advanceOnboarding("finish");
    await finishOnboarding();
    expect(state.revalidatePath).toHaveBeenCalledTimes(1);
    await finishOnboarding();
    expect(state.revalidatePath).toHaveBeenCalledTimes(1);
  });

  it("touches no other account", async () => {
    await signIn();
    const other = await signIn("user_other");
    state.userId = "user_me";
    await advanceOnboarding("finish");
    await finishOnboarding();
    expect(await account("user_other")).toEqual(other);
  });

  it("answers an account that does not exist without writing", async () => {
    const nobody = "00000000-0000-4000-8000-000000000000";
    expect(await advanceStep(db, nobody, "finish")).toBeUndefined();
    expect(await completeOnboarding(db, nobody)).toEqual({ code: "not_found" });
  });
});

describe("an account that owes no setup", () => {
  it.each(["grandfathered", "completed"] as const)(
    "keeps its access and its record when it goes through the steps again (%s)",
    async (status) => {
      await signIn();
      if (status === "grandfathered") await grandfather("user_me");
      else {
        await advanceOnboarding("finish");
        await finishOnboarding();
      }
      const before = await me();

      expect(await advanceOnboarding("ministry")).toMatchObject({
        ok: true,
        step: before.onboardingStep,
      });
      expect(await advanceOnboarding("finish")).toMatchObject({ ok: true });
      expect(await finishOnboarding()).toMatchObject({ ok: true });
      expect(await me()).toEqual(before);
      expect((await requireActiveUser()).onboardingStatus).toBe(status);
      expect(await authorize("active")).toMatchObject({ ok: true });
    },
  );

  it("still saves what it deliberately changes there", async () => {
    await signIn();
    await grandfather("user_me");
    expect(await updateProfile({ ministryRole: "Evangelist" })).toMatchObject({ ok: true });
    expect(await me()).toMatchObject({
      ministryRole: "Evangelist",
      onboardingStatus: "grandfathered",
    });
  });
});

describe("who may not", () => {
  it("refuses a guest", async () => {
    expect(await advanceOnboarding("ministry")).toMatchObject({ ok: false });
    expect(await finishOnboarding()).toMatchObject({ ok: false });
  });

  it("refuses a disabled account, whose setup stays where it was", async () => {
    await signIn();
    await advanceOnboarding("finish");
    await db.update(users).set({ status: "disabled" });
    expect(await advanceOnboarding("finish")).toMatchObject({ ok: false });
    expect(await finishOnboarding()).toEqual({
      ok: false,
      message: "Your account does not have access.",
    });
    expect(await updateProfile({ churchName: "Grace" })).toMatchObject({ ok: false });
    expect(await me()).toMatchObject({ onboardingStatus: "pending", churchName: null });
  });
});
