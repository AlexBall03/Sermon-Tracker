// @vitest-environment node
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ideas, preachingContexts, preachingOccurrences, users, type AppUser } from "@/db/schema";
import { createTestDatabase } from "@/db/testing";
import type { Database } from "@/db/types";
import type { Authorization } from "@/features/auth/access";
import { createIdea } from "@/features/ideas/ideas";
import { ideaInputSchema } from "@/features/ideas/schemas";
import { createContext } from "@/features/preaching/contexts";
import { createOccurrence } from "@/features/preaching/occurrences";
import { preachingSchemas } from "@/features/preaching/schemas";

// The session is stood in for; the database is a real in-memory PostgreSQL with the
// committed migrations.
const state = vi.hoisted(() => ({
  db: undefined as unknown,
  access: { ok: false, message: "signed out" } as unknown,
}));

vi.mock("@/db", () => ({ getDb: () => state.db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {} }),
}));
vi.mock("@/features/auth/access", () => ({
  authorize: async (): Promise<Authorization> => state.access as Authorization,
}));

import { updateProfile } from "./actions";
import { storedPreferences, storedProfile } from "./preferences";
import { resolvePreferences } from "./resolve";
import { profileSchemas } from "./schemas";

let db: Database;
let me: AppUser;
let other: AppUser;

const row = async (id: string) => (await db.select().from(users).where(eq(users.id, id)))[0];
/** Signs in as an account as the database holds it now, as a new request would find it. */
const signInAs = async (user: AppUser) => {
  state.access = { ok: true, user: await row(user.id) };
};
const profile = async (user: AppUser) => storedProfile(await row(user.id));

beforeEach(async () => {
  db = await createTestDatabase();
  state.db = db;
  [me, other] = await db
    .insert(users)
    .values([{ clerkUserId: "user_me" }, { clerkUserId: "user_other" }])
    .returning();
  state.access = { ok: false, message: "Your session has ended. Sign in again." };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("a new account", () => {
  it("has no church, no ministry role, and does not attend preaching class", async () => {
    expect(storedProfile(me)).toEqual({
      churchName: null,
      ministryRole: null,
      attendsPreachingClass: false,
    });
    expect(resolvePreferences(storedPreferences(me), true).attendsPreachingClass).toBe(false);
  });
});

describe("church name and ministry role", () => {
  it("are saved, tidied, and found again on a later request", async () => {
    await signInAs(me);
    expect(
      await updateProfile({ churchName: "  Grace   Baptist Church ", ministryRole: "Pastor" }),
    ).toEqual({ ok: true, message: "Your church and ministry details have been saved." });
    expect(await profile(me)).toMatchObject({
      churchName: "Grace Baptist Church",
      ministryRole: "Pastor",
    });
  });

  it("are changed one at a time, and a field left out is left alone", async () => {
    await signInAs(me);
    await updateProfile({ churchName: "Grace Baptist Church", ministryRole: "Pastor" });
    await updateProfile({ ministryRole: "Evangelist" });
    expect(await profile(me)).toMatchObject({
      churchName: "Grace Baptist Church",
      ministryRole: "Evangelist",
    });
    await updateProfile({ churchName: "Faith Baptist Church" });
    expect(await profile(me)).toMatchObject({
      churchName: "Faith Baptist Church",
      ministryRole: "Evangelist",
    });
  });

  it.each([null, "", "   "])("are cleared with %j", async (empty) => {
    await signInAs(me);
    await updateProfile({ churchName: "Grace Baptist Church", ministryRole: "Pastor" });
    expect((await updateProfile({ churchName: empty, ministryRole: empty })).ok).toBe(true);
    expect(await profile(me)).toMatchObject({ churchName: null, ministryRole: null });
  });

  it("take any words for a role: it is not a list", async () => {
    await signInAs(me);
    for (const role of ["Music Director", "Preaching Student", "Church Member", "admin"]) {
      expect((await updateProfile({ ministryRole: role })).ok).toBe(true);
      expect((await profile(me)).ministryRole).toBe(role);
    }
    // The words grant nothing: the account's role is as it was.
    expect((await row(me.id)).role).toBe("user");
  });

  it("refuse what is too long or is not text, and save nothing", async () => {
    await signInAs(me);
    expect(await updateProfile({ churchName: "c".repeat(121) })).toEqual({
      ok: false,
      message: "Use 120 characters or fewer for the church name.",
    });
    expect(await updateProfile({ ministryRole: "r".repeat(81) })).toEqual({
      ok: false,
      message: "Use 80 characters or fewer for the ministry role.",
    });
    for (const input of [
      { churchName: 7 },
      { ministryRole: ["Pastor"] },
      { churchName: { name: "Grace" } },
      {},
      null,
      "Grace",
      undefined,
    ]) {
      expect((await updateProfile(input)).ok).toBe(false);
    }
    expect(await profile(me)).toMatchObject({ churchName: null, ministryRole: null });
    // The longest that fits is taken.
    expect((await updateProfile({ churchName: "c".repeat(120) })).ok).toBe(true);
  });

  it("say what is wrong in the account's language", async () => {
    await db.update(users).set({ locale: "es" }).where(eq(users.id, me.id));
    await signInAs(me);
    expect((await updateProfile({ churchName: "c".repeat(121) })).message).toBe(
      "Usa 120 caracteres o menos para el nombre de la iglesia.",
    );
    expect((await updateProfile({ ministryRole: "Pastor" })).message).toBe(
      "Se guardaron los datos de tu iglesia y ministerio.",
    );
  });

  it("cannot be stored blank or too long by any other route", async () => {
    const set = (values: Record<string, unknown>) =>
      db.update(users).set(values).where(eq(users.id, me.id));
    await expect(set({ churchName: "  " })).rejects.toThrow();
    await expect(set({ churchName: "c".repeat(121) })).rejects.toThrow();
    await expect(set({ ministryRole: "" })).rejects.toThrow();
    await expect(set({ ministryRole: "r".repeat(81) })).rejects.toThrow();
  });
});

describe("attending preaching class", () => {
  it("is switched on and off, and found again on a later request", async () => {
    await signInAs(me);
    expect(await updateProfile({ attendsPreachingClass: true })).toEqual({
      ok: true,
      message: "Saved. Preaching class is on.",
    });
    expect((await row(me.id)).attendsPreachingClass).toBe(true);
    expect(resolvePreferences(storedPreferences(await row(me.id)), true)).toMatchObject({
      attendsPreachingClass: true,
    });
    // The administrator's Spanish switch has nothing to say about it.
    expect(
      resolvePreferences(storedPreferences(await row(me.id)), false).attendsPreachingClass,
    ).toBe(true);

    expect(await updateProfile({ attendsPreachingClass: false })).toEqual({
      ok: true,
      message: "Saved. Preaching class is off.",
    });
    expect((await row(me.id)).attendsPreachingClass).toBe(false);
  });

  it.each(["true", 1, 0, null, "on", {}])("refuses %j", async (value) => {
    await signInAs(me);
    expect((await updateProfile({ attendsPreachingClass: value })).ok).toBe(false);
    expect((await row(me.id)).attendsPreachingClass).toBe(false);
  });

  it("has nothing to do with the ministry role", async () => {
    await signInAs(me);
    await updateProfile({ ministryRole: "Pastor", attendsPreachingClass: true });
    expect(await profile(me)).toMatchObject({
      ministryRole: "Pastor",
      attendsPreachingClass: true,
    });
    await updateProfile({ ministryRole: "Preaching Student" });
    expect((await profile(me)).attendsPreachingClass).toBe(true);
    await updateProfile({ attendsPreachingClass: false });
    expect((await profile(me)).ministryRole).toBe("Preaching Student");
  });

  it("creates, changes, and removes nothing in the preaching record or the library", async () => {
    const schemas = preachingSchemas("en", "2026-10-12");
    const sermon = (await createIdea(
      db,
      me.id,
      ideaInputSchema.parse({ kind: "sermon", title: "It is Well" }),
    ))!;
    const klass = await createContext(db, me.id, "Preaching Class");
    if (!klass.ok) throw new Error("context not created");
    const recorded = await createOccurrence(
      db,
      me.id,
      schemas.occurrenceInput.parse({
        sermonId: sermon.id,
        preachedOn: "2026-10-11",
        contextId: klass.context.id,
      }),
    );
    expect(recorded.status).toBe("created");

    const everything = async () => ({
      contexts: await db.select().from(preachingContexts),
      occurrences: await db.select().from(preachingOccurrences),
      ideas: await db.select().from(ideas),
    });
    const before = await everything();
    expect(before.contexts).toHaveLength(1);
    expect(before.occurrences).toHaveLength(1);

    await signInAs(me);
    await updateProfile({ attendsPreachingClass: true });
    // On: no context is made for the account, and nothing it has is touched.
    expect(await everything()).toEqual(before);
    await updateProfile({ attendsPreachingClass: false });
    // Off: the class context and what was preached in it are still there.
    expect(await everything()).toEqual(before);

    // An account with no contexts gets none by switching it on.
    await signInAs(other);
    await updateProfile({ attendsPreachingClass: true });
    expect(await db.select().from(preachingContexts)).toHaveLength(1);
  });
});

describe("whose profile it is", () => {
  it("refuses a caller who is not signed in, or who has no access, and saves nothing", async () => {
    expect(await updateProfile({ churchName: "Grace", attendsPreachingClass: true })).toEqual({
      ok: false,
      message: "Your session has ended. Sign in again.",
    });
    state.access = { ok: false, message: "Your account does not have access." };
    expect((await updateProfile({ churchName: "Grace" })).ok).toBe(false);
    for (const user of [me, other]) {
      expect(await profile(user)).toEqual({
        churchName: null,
        ministryRole: null,
        attendsPreachingClass: false,
      });
    }
  });

  it("changes only the caller's own account, whatever account the input names", async () => {
    await signInAs(me);
    expect(
      (
        await updateProfile({
          churchName: "Grace Baptist Church",
          attendsPreachingClass: true,
          id: other.id,
          userId: other.id,
          clerkUserId: other.clerkUserId,
          role: "admin",
          status: "disabled",
          locale: "es",
          bibleTranslation: "rvg",
        })
      ).ok,
    ).toBe(true);
    expect(await profile(me)).toMatchObject({
      churchName: "Grace Baptist Church",
      attendsPreachingClass: true,
    });
    // Nothing else on the caller's row moved, and the other account is as it was.
    expect(await row(me.id)).toMatchObject({
      role: "user",
      status: "active",
      locale: "en",
      bibleTranslation: null,
    });
    const untouched = await row(other.id);
    expect(untouched).toEqual(other);
  });

  it("leaves the language and the translation an account chose alone", async () => {
    await db
      .update(users)
      .set({ locale: "es", bibleTranslation: "kjv" })
      .where(eq(users.id, me.id));
    await signInAs(me);
    await updateProfile({ churchName: "Iglesia Bautista Gracia", attendsPreachingClass: true });
    expect(await row(me.id)).toMatchObject({ locale: "es", bibleTranslation: "kjv" });
  });
});

describe("profileUpdate", () => {
  const { profileUpdate } = profileSchemas("en");

  it("keeps only what it knows, and tells left out from cleared", () => {
    expect(profileUpdate.parse({ churchName: " Grace ", userId: "x", role: "admin" })).toEqual({
      churchName: "Grace",
    });
    expect(profileUpdate.parse({ ministryRole: "" })).toEqual({ ministryRole: null });
    expect(profileUpdate.parse({ attendsPreachingClass: false })).toEqual({
      attendsPreachingClass: false,
    });
    expect(profileUpdate.safeParse({}).success).toBe(false);
    expect(profileUpdate.safeParse({ userId: "x" }).success).toBe(false);
  });
});
