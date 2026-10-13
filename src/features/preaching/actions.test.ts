// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { preachingOccurrences, users } from "@/db/schema";
import { createTestDatabase } from "@/db/testing";
import type { Database } from "@/db/types";
import type { Authorization } from "@/features/auth/access";

// The access helper is mocked; the database is a real in-memory PostgreSQL.
const state = vi.hoisted(() => ({
  access: { ok: false, message: "Your session has ended. Sign in again." } as unknown,
  db: undefined as unknown,
  locale: "en",
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/db", () => ({ getDb: () => state.db }));
vi.mock("@/i18n/server", () => ({ getLocale: async () => state.locale }));
vi.mock("@/features/auth/access", () => ({
  authorize: async (): Promise<Authorization> => state.access as Authorization,
}));

import { changeIdeaKind, createIdea, deleteIdea } from "@/features/ideas/actions";
import { getIdea } from "@/features/ideas/ideas";
import {
  createContext,
  createVenue,
  deleteContext,
  deleteOccurrence,
  deleteVenue,
  recordOccurrence,
  renameContext,
  updateOccurrence,
  updateVenue,
} from "./actions";
import { getOccurrence } from "./occurrences";

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

beforeEach(async () => {
  db = await createTestDatabase();
  state.db = db;
  state.locale = "en";
  const rows = await db
    .insert(users)
    .values([{ clerkUserId: "user_me" }, { clerkUserId: "user_other" }])
    .returning();
  [me, other] = rows.map((row) => row.id);
  state.access = { ok: false, message: "Your session has ended. Sign in again." };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const nowhere = "55555555-5555-4555-8555-555555555555";
const yesterday = () => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

async function sermon(title = "His Grace is Sufficient") {
  const result = await createIdea({ kind: "sermon", title });
  return result.id!;
}

describe("preaching actions", () => {
  it("reject a signed-out, disabled, or uninvited caller before touching the database", async () => {
    for (const message of [
      "Your session has ended. Sign in again.",
      "Your account does not have access.",
    ]) {
      state.access = { ok: false, message };
      for (const result of [
        await recordOccurrence({ sermonId: nowhere, preachedOn: yesterday() }),
        await updateOccurrence(nowhere, { notes: "x" }),
        await deleteOccurrence(nowhere),
        await createVenue({ name: "Church" }),
        await updateVenue(nowhere, { name: "Church" }),
        await deleteVenue(nowhere),
        await createContext("Class"),
        await renameContext(nowhere, "Class"),
        await deleteContext(nowhere),
      ]) {
        expect(result).toEqual({ ok: false, message });
      }
    }
  });

  it("record, change, and remove an occasion for the signed-in account", async () => {
    signInAs(me);
    const sermonId = await sermon();
    const venue = await createVenue({ name: " Faithful  Word Baptist Church " });
    const context = await createContext("Regular Church Service");
    expect(venue).toMatchObject({ ok: true, venue: { name: "Faithful Word Baptist Church" } });

    const recorded = await recordOccurrence({
      sermonId,
      preachedOn: yesterday(),
      timeOfDay: "am",
      venueId: venue.venue!.id,
      contextId: context.context!.id,
      durationMinutes: 50,
    });
    expect(recorded).toMatchObject({ ok: true, message: "Added to your preaching history." });
    expect(await getOccurrence(db, me, recorded.id!)).toMatchObject({
      ownerId: me,
      preachedOn: yesterday(),
      timeOfDay: "am",
      durationMinutes: 50,
      actualFormat: "unspecified",
    });
    // The sermon is as it was: recording moved no status and no classification.
    expect(await getIdea(db, me, sermonId)).toMatchObject({ status: "idea", kind: "sermon" });

    expect(await updateOccurrence(recorded.id, { durationMinutes: null, notes: "Good." })).toEqual({
      ok: true,
      message: "Changes saved.",
    });
    expect(await getOccurrence(db, me, recorded.id!)).toMatchObject({
      durationMinutes: null,
      notes: "Good.",
      timeOfDay: "am",
    });

    expect(await deleteOccurrence(recorded.id)).toEqual({
      ok: true,
      message: "Removed from your preaching history.",
    });
    expect(await deleteOccurrence(recorded.id)).toEqual({
      ok: false,
      message: "That record no longer exists.",
    });
  });

  it("record a retried submission once", async () => {
    signInAs(me);
    const sermonId = await sermon();
    const id = "99999999-9999-4999-8999-999999999999";
    const first = await recordOccurrence({ sermonId, preachedOn: yesterday(), notes: "One." }, id);
    const again = await recordOccurrence({ sermonId, preachedOn: yesterday(), notes: "Two." }, id);
    expect(first).toEqual({ ok: true, message: "Added to your preaching history.", id });
    expect(again).toEqual(first);
    expect(await db.select().from(preachingOccurrences)).toHaveLength(1);
    expect((await getOccurrence(db, me, id))?.notes).toBe("One.");

    // The same ID from another account is refused, and is told nothing.
    signInAs(other);
    const theirs = await sermon("Theirs");
    expect(await recordOccurrence({ sermonId: theirs, preachedOn: yesterday() }, id)).toEqual({
      ok: false,
      message: "That could not be recorded. Try again.",
    });
    expect((await getOccurrence(db, me, id))?.notes).toBe("One.");
  });

  it("say what was wrong with the input, in the account's language", async () => {
    signInAs(me);
    const sermonId = await sermon();
    const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    expect(await recordOccurrence({ sermonId, preachedOn: future })).toEqual({
      ok: false,
      message: "The date cannot be in the future.",
    });
    expect(
      await recordOccurrence({ sermonId, preachedOn: yesterday(), recordingUrl: "http://x.com" }),
    ).toEqual({ ok: false, message: "Use a link that begins with https://." });
    expect(await recordOccurrence({ sermonId, preachedOn: yesterday() }, "not-an-id")).toEqual({
      ok: false,
      message: "That request was not valid.",
    });
    expect(await updateOccurrence("not-an-id", { notes: "x" })).toEqual({
      ok: false,
      message: "That request was not valid.",
    });
    expect(await updateOccurrence(nowhere, {})).toEqual({
      ok: false,
      message: "There is nothing to change.",
    });
    expect(await createVenue({ name: " " })).toEqual({
      ok: false,
      message: "Give the venue a name.",
    });

    state.locale = "es";
    expect(await recordOccurrence({ sermonId, preachedOn: future })).toEqual({
      ok: false,
      message: "La fecha no puede estar en el futuro.",
    });
    expect(await db.select().from(preachingOccurrences)).toHaveLength(0);
  });

  it("give one answer for what is missing and what is someone else's", async () => {
    signInAs(other);
    const theirSermon = await sermon("Theirs");
    const theirVenue = (await createVenue({ name: "Their church" })).venue!.id;
    const theirContext = (await createContext("Their class")).context!.id;
    const theirs = (await recordOccurrence({ sermonId: theirSermon, preachedOn: yesterday() })).id!;

    signInAs(me);
    const sermonId = await sermon();
    const mine = (await recordOccurrence({ sermonId, preachedOn: yesterday() })).id!;

    for (const id of [theirSermon, nowhere]) {
      expect(await recordOccurrence({ sermonId: id, preachedOn: yesterday() })).toEqual({
        ok: false,
        message: "That sermon no longer exists.",
      });
    }
    for (const venueId of [theirVenue, nowhere]) {
      const message = "That venue no longer exists.";
      expect(await recordOccurrence({ sermonId, preachedOn: yesterday(), venueId })).toEqual({
        ok: false,
        message,
      });
      expect(await updateOccurrence(mine, { venueId })).toEqual({ ok: false, message });
      expect(await updateVenue(venueId, { name: "Mine" })).toEqual({ ok: false, message });
      expect(await deleteVenue(venueId)).toEqual({ ok: false, message });
    }
    for (const contextId of [theirContext, nowhere]) {
      const message = "That context no longer exists.";
      expect(await updateOccurrence(mine, { contextId })).toEqual({ ok: false, message });
      expect(await renameContext(contextId, "Mine")).toEqual({ ok: false, message });
      expect(await deleteContext(contextId)).toEqual({ ok: false, message });
    }
    for (const id of [theirs, nowhere]) {
      const message = "That record no longer exists.";
      expect(await updateOccurrence(id, { notes: "Mine." })).toEqual({ ok: false, message });
      expect(await deleteOccurrence(id)).toEqual({ ok: false, message });
    }
    expect((await getOccurrence(db, other, theirs))?.notes).toBeNull();
  });

  it("refuse an idea that is not a sermon, until it is one", async () => {
    signInAs(me);
    const id = (await createIdea({ kind: "point", title: "Faith speaks first" })).id!;
    expect(await recordOccurrence({ sermonId: id, preachedOn: yesterday() })).toEqual({
      ok: false,
      message: "Only a sermon can be recorded as preached. File this idea as a sermon first.",
    });
    await changeIdeaKind(id, "sermon");
    expect((await recordOccurrence({ sermonId: id, preachedOn: yesterday() })).ok).toBe(true);
  });

  it("keep a venue or a context that history names, and say a name is taken", async () => {
    signInAs(me);
    const sermonId = await sermon();
    const venue = (await createVenue({ name: "Church" })).venue!;
    const context = (await createContext("Service")).context!;
    await recordOccurrence({
      sermonId,
      preachedOn: yesterday(),
      venueId: venue.id,
      contextId: context.id,
    });

    expect(await deleteVenue(venue.id)).toEqual({
      ok: false,
      message: "That venue is on 1 record in your history and cannot be deleted.",
    });
    expect(await deleteContext(context.id)).toEqual({
      ok: false,
      message: "That context is on 1 record in your history and cannot be deleted.",
    });
    expect(await createVenue({ name: "CHURCH" })).toEqual({
      ok: false,
      message: "You already have a venue with that name.",
      existingId: venue.id,
    });
    expect(await createContext("service")).toEqual({
      ok: false,
      message: "You already have a context with that name.",
      existingId: context.id,
    });
    expect(await updateVenue(venue.id, { locality: "Tempe" })).toMatchObject({
      ok: true,
      venue: { id: venue.id, name: "Church", locality: "Tempe" },
    });
    expect(await renameContext(context.id, "Regular Service")).toMatchObject({
      ok: true,
      context: { id: context.id, name: "Regular Service" },
    });
  });

  it("stop a preached sermon being deleted, and say why", async () => {
    signInAs(me);
    const sermonId = await sermon();
    const occasion = (await recordOccurrence({ sermonId, preachedOn: yesterday() })).id!;

    expect(await deleteIdea(sermonId)).toEqual({
      ok: false,
      message: "This sermon has been preached, so it cannot be deleted. Archive it instead.",
      reason: "preached",
    });
    expect(await getIdea(db, me, sermonId)).not.toBeNull();
    expect(await getOccurrence(db, me, occasion)).not.toBeNull();

    await deleteOccurrence(occasion);
    expect(await deleteIdea(sermonId)).toEqual({ ok: true, message: "Idea deleted." });
  });
});
