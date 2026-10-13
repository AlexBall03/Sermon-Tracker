// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";

import { preachingOccurrences, users } from "@/db/schema";
import { createTestDatabase } from "@/db/testing";
import type { Database } from "@/db/types";
import { createIdea } from "@/features/ideas/ideas";
import { ideaInputSchema } from "@/features/ideas/schemas";
import {
  createContext,
  deleteContext,
  listContexts,
  renameContext,
  type ContextResult,
} from "./contexts";
import { createOccurrence, deleteOccurrence, getOccurrence } from "./occurrences";
import { preachingSchemas } from "./schemas";
import { createVenue, deleteVenue, listVenues, updateVenue, type VenueResult } from "./venues";

const schemas = preachingSchemas("en", "2026-10-12");
const nowhere = "88888888-8888-4888-8888-888888888888";

let db: Database;
let me: string;
let other: string;
let sermon: string;

beforeEach(async () => {
  db = await createTestDatabase();
  const rows = await db
    .insert(users)
    .values([{ clerkUserId: "user_me" }, { clerkUserId: "user_other" }])
    .returning();
  [me, other] = rows.map((row) => row.id);
  const idea = await createIdea(db, me, ideaInputSchema.parse({ kind: "sermon", title: "Grace" }));
  sermon = idea!.id;
});

const venueId = (result: VenueResult) => {
  if (!result.ok) throw new Error(`venue: ${result.reason}`);
  return result.venue.id;
};
const contextId = (result: ContextResult) => {
  if (!result.ok) throw new Error(`context: ${result.reason}`);
  return result.context.id;
};
const newVenue = (ownerId: string, name: string, locality?: string) =>
  createVenue(db, ownerId, schemas.venueInput.parse({ name, locality }));

async function preach(fields: Record<string, unknown>) {
  const outcome = await createOccurrence(
    db,
    me,
    schemas.occurrenceInput.parse({ sermonId: sermon, preachedOn: "2026-10-11", ...fields }),
  );
  if (outcome.status !== "created") throw new Error(outcome.status);
  return outcome.occurrence.id;
}

describe("venues", () => {
  it("are created, listed alphabetically, and counted by the occasions that name them", async () => {
    const word = venueId(await newVenue(me, "Faithful Word Baptist Church", "Tempe, AZ"));
    venueId(await newVenue(me, "campus chapel"));
    await newVenue(other, "Their church");
    await preach({ venueId: word });
    await preach({ venueId: word, preachedOn: "2026-10-04" });

    expect(await listVenues(db, me)).toMatchObject([
      { name: "campus chapel", locality: null, occurrenceCount: 0 },
      { name: "Faithful Word Baptist Church", locality: "Tempe, AZ", occurrenceCount: 2 },
    ]);
    expect(await listVenues(db, other)).toMatchObject([{ name: "Their church" }]);
  });

  it("have one name per account whatever its case, and say which venue has it", async () => {
    const first = venueId(await newVenue(me, "Campus Chapel"));
    expect(await newVenue(me, "CAMPUS chapel")).toEqual({
      ok: false,
      reason: "duplicate",
      existingId: first,
    });
    // Another account may use the same name, and is not told of mine.
    const theirs = await newVenue(other, "Campus Chapel");
    expect(theirs.ok).toBe(true);
    expect(venueId(theirs)).not.toBe(first);
    expect(await listVenues(db, me)).toHaveLength(1);
  });

  it("keep every occasion when renamed", async () => {
    const id = venueId(await newVenue(me, "Old name"));
    const occasion = await preach({ venueId: id });

    const renamed = await updateVenue(db, me, id, schemas.venueUpdate.parse({ name: "New name" }));
    expect(renamed).toMatchObject({ ok: true, venue: { id, name: "New name", locality: null } });
    expect((await getOccurrence(db, me, occasion))?.venue).toEqual({
      id,
      name: "New name",
      locality: null,
    });

    // The locality alone, the name left as it is; and its own name in another case.
    await updateVenue(db, me, id, schemas.venueUpdate.parse({ locality: "Phoenix" }));
    await updateVenue(db, me, id, schemas.venueUpdate.parse({ name: "NEW NAME" }));
    expect(await listVenues(db, me)).toMatchObject([
      { id, name: "NEW NAME", locality: "Phoenix", occurrenceCount: 1 },
    ]);
  });

  it("cannot take another venue's name, or be changed by another account", async () => {
    const first = venueId(await newVenue(me, "First"));
    const second = venueId(await newVenue(me, "Second"));
    const change = schemas.venueUpdate.parse({ name: "first" });
    expect(await updateVenue(db, me, second, change)).toEqual({
      ok: false,
      reason: "duplicate",
      existingId: first,
    });
    expect(await updateVenue(db, other, first, schemas.venueUpdate.parse({ name: "X" }))).toEqual({
      ok: false,
      reason: "missing",
    });
    expect(await updateVenue(db, me, nowhere, change)).toMatchObject({ ok: false });
    expect((await listVenues(db, me)).map((venue) => venue.name)).toEqual(["First", "Second"]);
  });

  it("are deleted only when no occasion names them, and history is never detached", async () => {
    const used = venueId(await newVenue(me, "Used"));
    const free = venueId(await newVenue(me, "Free"));
    const first = await preach({ venueId: used });
    const second = await preach({ venueId: used, preachedOn: "2026-10-04" });
    const before = await db.select().from(preachingOccurrences);

    expect(await deleteVenue(db, me, used)).toEqual({ ok: false, reason: "in_use", count: 2 });
    expect(await db.select().from(preachingOccurrences)).toEqual(before);
    expect(await deleteVenue(db, me, free)).toEqual({ ok: true });
    expect(await deleteVenue(db, me, free)).toEqual({ ok: false, reason: "missing" });
    // Another account cannot delete mine, nor learn that it is used.
    expect(await deleteVenue(db, other, used)).toEqual({ ok: false, reason: "missing" });

    // Once nothing names it, it can go.
    await deleteOccurrence(db, me, first);
    await deleteOccurrence(db, me, second);
    expect(await deleteVenue(db, me, used)).toEqual({ ok: true });
    expect(await listVenues(db, me)).toEqual([]);
  });
});

describe("contexts", () => {
  it("are not given to an account until it makes one", async () => {
    expect(await listContexts(db, me)).toEqual([]);
    expect(await listContexts(db, other)).toEqual([]);
  });

  it("are created, reused across occasions, and counted", async () => {
    const service = contextId(await createContext(db, me, "Regular Church Service"));
    contextId(await createContext(db, me, "Preaching Class"));
    for (const preachedOn of ["2026-09-06", "2026-09-13", "2026-09-20"]) {
      await preach({ contextId: service, preachedOn });
    }
    expect(await listContexts(db, me)).toMatchObject([
      { name: "Preaching Class", occurrenceCount: 0 },
      { id: service, name: "Regular Church Service", occurrenceCount: 3 },
    ]);
    expect(await listContexts(db, other)).toEqual([]);
  });

  it("have one name per account whatever its case, so a suggestion picked twice is found", async () => {
    const first = contextId(await createContext(db, me, "Special Service"));
    expect(await createContext(db, me, "special service")).toEqual({
      ok: false,
      reason: "duplicate",
      existingId: first,
    });
    expect((await createContext(db, other, "Special Service")).ok).toBe(true);
  });

  it("keep every occasion when renamed, and cannot take another's name", async () => {
    const id = contextId(await createContext(db, me, "Class"));
    const taken = contextId(await createContext(db, me, "Conference"));
    const occasion = await preach({ contextId: id });

    expect(await renameContext(db, me, id, "Preaching Class")).toMatchObject({
      ok: true,
      context: { id, name: "Preaching Class" },
    });
    expect((await getOccurrence(db, me, occasion))?.context).toEqual({
      id,
      name: "Preaching Class",
    });
    expect(await renameContext(db, me, id, "CONFERENCE")).toEqual({
      ok: false,
      reason: "duplicate",
      existingId: taken,
    });
    expect(await renameContext(db, other, id, "Theirs")).toEqual({ ok: false, reason: "missing" });
  });

  it("are deleted only when no occasion names them", async () => {
    const used = contextId(await createContext(db, me, "Used"));
    const free = contextId(await createContext(db, me, "Free"));
    const occasion = await preach({ contextId: used });

    expect(await deleteContext(db, me, used)).toEqual({ ok: false, reason: "in_use", count: 1 });
    expect((await getOccurrence(db, me, occasion))?.context?.id).toBe(used);
    expect(await deleteContext(db, other, used)).toEqual({ ok: false, reason: "missing" });
    expect(await deleteContext(db, me, free)).toEqual({ ok: true });
    expect(await deleteContext(db, me, nowhere)).toEqual({ ok: false, reason: "missing" });

    await deleteOccurrence(db, me, occasion);
    expect(await deleteContext(db, me, used)).toEqual({ ok: true });
  });
});
