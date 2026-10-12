// @vitest-environment node
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { appSettings, bibleFavorites, bibleHighlights, users, type AppUser } from "@/db/schema";
import { createTestDatabase } from "@/db/testing";
import type { Database } from "@/db/types";
import type { Authorization } from "@/features/auth/access";

// The session, the cookie jar, and Clerk are stood in for; the database is a real
// in-memory PostgreSQL with the committed migrations.
const state = vi.hoisted(() => ({
  db: undefined as unknown,
  access: { ok: false, message: "signed out" } as unknown,
  cookies: new Map<string, string>(),
}));

vi.mock("@/db", () => ({ getDb: () => state.db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ origin: "http://localhost" }),
  cookies: async () => ({
    get: (name: string) =>
      state.cookies.has(name) ? { name, value: state.cookies.get(name)! } : undefined,
    set: (name: string, value: string) => void state.cookies.set(name, value),
  }),
}));
vi.mock("@/features/admin/clerk", () => ({
  createInvitation: vi.fn(),
  revokeInvitation: vi.fn(),
  resendInvitation: vi.fn(),
  describeClerkError: (_error: unknown, fallback: string) => fallback,
}));
vi.mock("@/features/auth/access", () => ({
  // Mirrors the real helper's rule: admin actions need an active administrator.
  authorize: async (requirement: "active" | "admin"): Promise<Authorization> => {
    const access = state.access as Authorization;
    if (!access.ok) return access;
    if (requirement === "admin" && access.user.role !== "admin") {
      return { ok: false, message: "Only administrators can do that." };
    }
    return access;
  },
}));

import { setSpanishEnabled } from "@/features/admin/actions";
import { setBibleTranslation, setGuestLocale, setLocale } from "./actions";
import { storedPreferences } from "./preferences";
import { resolvePreferences } from "./resolve";
import { readAppSettings, writeSpanishEnabled } from "./settings";

let db: Database;
let admin: AppUser;
let reader: AppUser;

const row = async (id: string) => (await db.select().from(users).where(eq(users.id, id)))[0];
/** Signs in as an account as the database holds it now, as a new request would find it. */
const signInAs = async (user: AppUser) => {
  state.access = { ok: true, user: await row(user.id) };
};
/** What is in force for an account on its next request. */
const inForce = async (user: AppUser) =>
  resolvePreferences(
    storedPreferences(await row(user.id)),
    (await readAppSettings(db)).spanishEnabled,
  );

beforeEach(async () => {
  db = await createTestDatabase();
  state.db = db;
  state.cookies.clear();
  [admin, reader] = await db
    .insert(users)
    .values([{ clerkUserId: "user_admin", role: "admin" }, { clerkUserId: "user_reader" }])
    .returning();
  state.access = { ok: false, message: "Your session has ended. Sign in again." };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("a new account", () => {
  it("is in English, with no translation chosen, and Spanish available", async () => {
    expect(storedPreferences(reader)).toEqual({ locale: "en", bibleTranslation: null });
    expect(await readAppSettings(db)).toEqual({ spanishEnabled: true });
    expect(await inForce(reader)).toMatchObject({ locale: "en", translation: "kjv" });
  });

  it("can hold no language or translation the application does not have", async () => {
    const set = (values: Record<string, unknown>) =>
      db.update(users).set(values).where(eq(users.id, reader.id));
    await expect(set({ locale: "fr" })).rejects.toThrow();
    await expect(set({ bibleTranslation: "rv1960" })).rejects.toThrow();
    await set({ locale: "es", bibleTranslation: "rvg" });
  });
});

describe("setLocale", () => {
  it("refuses a caller who is not signed in, and saves nothing", async () => {
    expect(await setLocale("es")).toEqual({
      ok: false,
      message: "Your session has ended. Sign in again.",
    });
    expect((await row(reader.id)).locale).toBe("en");
  });

  it("saves the language on the account, and says so in the language chosen", async () => {
    await signInAs(reader);
    expect(await setLocale("es")).toEqual({ ok: true, message: "Idioma guardado." });
    expect((await row(reader.id)).locale).toBe("es");
    // And it persists: a later request finds it.
    expect(await inForce(reader)).toMatchObject({ locale: "es" });
    // The pages before sign-in follow it too.
    expect(state.cookies.get("st_locale")).toBe("es");

    await signInAs(reader);
    expect(await setLocale("en")).toEqual({ ok: true, message: "Language saved." });
    expect((await row(reader.id)).locale).toBe("en");
  });

  it("changes only the caller's own account", async () => {
    await signInAs(reader);
    await setLocale("es");
    expect((await row(admin.id)).locale).toBe("en");
  });

  it.each(["fr", "ES", "", null, 1, { locale: "es" }])("refuses %j", async (value) => {
    await signInAs(reader);
    expect((await setLocale(value)).ok).toBe(false);
    expect((await row(reader.id)).locale).toBe("en");
  });

  it("takes the translation with it, chosen or not", async () => {
    await signInAs(reader);
    // Nothing chosen: the Bible follows the interface.
    await setLocale("es");
    expect((await row(reader.id)).bibleTranslation).toBeNull();
    expect((await inForce(reader)).translation).toBe("rvg");

    // Chosen: a new language still brings its own translation.
    await signInAs(reader);
    expect(await setBibleTranslation("rvg")).toMatchObject({ ok: true });
    await signInAs(reader);
    await setLocale("en");
    expect(await row(reader.id)).toMatchObject({ locale: "en", bibleTranslation: null });
    expect(await inForce(reader)).toMatchObject({ locale: "en", translation: "kjv" });
  });

  it("leaves a chosen translation alone when the language is the one already saved", async () => {
    await signInAs(reader);
    await setBibleTranslation("rvg");
    await signInAs(reader);
    expect((await setLocale("en")).ok).toBe(true);
    expect(await row(reader.id)).toMatchObject({ locale: "en", bibleTranslation: "rvg" });
  });
});

describe("setBibleTranslation", () => {
  it("refuses a caller who is not signed in", async () => {
    expect((await setBibleTranslation("rvg")).ok).toBe(false);
    expect((await row(reader.id)).bibleTranslation).toBeNull();
  });

  it("saves the translation and never the language", async () => {
    await signInAs(reader);
    expect(await setBibleTranslation("rvg")).toEqual({
      ok: true,
      message: "Your Bible translation is now the RVG.",
    });
    expect(await row(reader.id)).toMatchObject({ locale: "en", bibleTranslation: "rvg" });
    // English interface, Spanish Bible.
    expect(await inForce(reader)).toMatchObject({ locale: "en", translation: "rvg" });

    await signInAs(reader);
    await setLocale("es");
    await signInAs(reader);
    await setBibleTranslation("kjv");
    // Spanish interface, English Bible.
    expect(await inForce(reader)).toMatchObject({ locale: "es", translation: "kjv" });
  });

  it("goes back to following the interface language with null", async () => {
    await signInAs(reader);
    await setBibleTranslation("rvg");
    await signInAs(reader);
    expect((await setBibleTranslation(null)).ok).toBe(true);
    expect((await row(reader.id)).bibleTranslation).toBeNull();
    expect((await inForce(reader)).translation).toBe("kjv");
  });

  it.each(["rv1960", "RVG", "", 1, {}])("refuses %j", async (value) => {
    await signInAs(reader);
    expect((await setBibleTranslation(value)).ok).toBe(false);
    expect((await row(reader.id)).bibleTranslation).toBeNull();
  });
});

describe("the administrator's switch for Spanish", () => {
  it("can be changed by an administrator only", async () => {
    // Signed out.
    expect((await setSpanishEnabled(false)).ok).toBe(false);
    // An ordinary account.
    await signInAs(reader);
    expect(await setSpanishEnabled(false)).toEqual({
      ok: false,
      message: "Only administrators can do that.",
    });
    expect(await readAppSettings(db)).toEqual({ spanishEnabled: true });

    await signInAs(admin);
    expect(await setSpanishEnabled(false)).toMatchObject({ ok: true });
    expect(await readAppSettings(db)).toEqual({ spanishEnabled: false });
    expect((await db.select().from(appSettings))[0].updatedBy).toBe(admin.id);
  });

  it.each(["false", 0, null, undefined, {}])("refuses %j as a setting", async (value) => {
    await signInAs(admin);
    expect((await setSpanishEnabled(value)).ok).toBe(false);
    expect(await readAppSettings(db)).toEqual({ spanishEnabled: true });
  });

  it("is one row however often it is changed", async () => {
    await writeSpanishEnabled(db, false, admin.id);
    await writeSpanishEnabled(db, true, admin.id);
    await writeSpanishEnabled(db, false, admin.id);
    expect(await db.select().from(appSettings)).toHaveLength(1);
    expect(await readAppSettings(db)).toEqual({ spanishEnabled: false });
  });

  it("puts everyone in English and the King James, deletes nothing, and gives it all back", async () => {
    // A reader who chose Spanish for both, and marked the Spanish text.
    await signInAs(reader);
    await setLocale("es");
    await signInAs(reader);
    await setBibleTranslation("rvg");
    expect(await row(reader.id)).toMatchObject({ locale: "es", bibleTranslation: "rvg" });
    await db.insert(bibleHighlights).values({
      ownerId: reader.id,
      translation: "rvg",
      book: 43,
      chapter: 3,
      verse: 16,
      color: "yellow",
    });
    await db.insert(bibleFavorites).values({
      ownerId: reader.id,
      translation: "rvg",
      selectionKey: "key",
      reference: "Juan 3:16",
      firstBook: 43,
      firstChapter: 3,
      firstVerse: 16,
    });
    expect(await inForce(reader)).toMatchObject({ locale: "es", translation: "rvg" });

    await signInAs(admin);
    await setSpanishEnabled(false);

    // In force at once, for the reader and for the administrator alike.
    expect(await inForce(reader)).toMatchObject({
      locale: "en",
      translation: "kjv",
      translations: ["kjv"],
    });
    await db.update(users).set({ locale: "es" }).where(eq(users.id, admin.id));
    expect(await inForce(admin)).toMatchObject({ locale: "en", translation: "kjv" });
    // What was saved is exactly as it was.
    expect(await row(reader.id)).toMatchObject({ locale: "es", bibleTranslation: "rvg" });
    expect(await db.select().from(bibleHighlights)).toHaveLength(1);
    expect(await db.select().from(bibleFavorites)).toHaveLength(1);

    await signInAs(admin);
    await setSpanishEnabled(true);
    expect(await inForce(reader)).toMatchObject({
      locale: "es",
      translation: "rvg",
      translations: ["kjv", "rvg"],
    });
  });

  it("refuses Spanish choices while it is off, and keeps what was saved before", async () => {
    await signInAs(reader);
    await setBibleTranslation("rvg");
    await writeSpanishEnabled(db, false, admin.id);

    await signInAs(reader);
    expect(await setLocale("es")).toEqual({
      ok: false,
      message: "Spanish is not available right now.",
    });
    expect(await setBibleTranslation("rvg")).toEqual({
      ok: false,
      message: "That translation is not available right now.",
    });
    // English and the King James still work, and nothing else was written.
    expect((await setLocale("en")).ok).toBe(true);
    expect(await row(reader.id)).toMatchObject({ locale: "en", bibleTranslation: "rvg" });
    await signInAs(reader);
    expect((await setBibleTranslation("kjv")).ok).toBe(true);
  });
});

describe("the language before signing in", () => {
  it("is a cookie holding a language and nothing else", async () => {
    await setGuestLocale("es");
    expect(state.cookies.get("st_locale")).toBe("es");
    await setGuestLocale("fr");
    await setGuestLocale({ role: "admin" });
    expect(state.cookies.get("st_locale")).toBe("es");
    // It is saved on no account.
    expect((await row(reader.id)).locale).toBe("en");
  });
});
