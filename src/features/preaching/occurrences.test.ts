// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";

import * as schema from "@/db/schema";
import { ideas, preachingOccurrences, users } from "@/db/schema";
import { createTestDatabase } from "@/db/testing";
import type { Database } from "@/db/types";
import {
  archiveIdea,
  createIdea,
  deleteIdea,
  getIdea,
  restoreIdea,
  searchIdeas,
  setIdeaKind,
} from "@/features/ideas/ideas";
import { defaultLibraryQuery } from "@/features/ideas/library-query";
import type { IdeaKind } from "@/features/ideas/model";
import { ideaInputSchema } from "@/features/ideas/schemas";
import { createContext } from "./contexts";
import {
  createOccurrence,
  deleteOccurrence,
  getOccurrence,
  listForSermon,
  occurrenceCounts,
  searchHistory,
  updateOccurrence,
} from "./occurrences";
import { historyQuerySchema, preachingSchemas, type HistoryQueryInput } from "./schemas";
import { createVenue } from "./venues";

const schemas = preachingSchemas("en", "2026-10-12");

let db: Database;
let me: string;
let other: string;

beforeEach(async () => {
  db = await createTestDatabase();
  const rows = await db
    .insert(users)
    .values([{ clerkUserId: "user_me" }, { clerkUserId: "user_other" }])
    .returning();
  [me, other] = rows.map((row) => row.id);
});

async function idea(ownerId: string, title: string, kind: IdeaKind = "sermon") {
  const created = await createIdea(db, ownerId, ideaInputSchema.parse({ kind, title }));
  return created!.id;
}

async function venue(ownerId: string, name: string) {
  const result = await createVenue(db, ownerId, schemas.venueInput.parse({ name }));
  if (!result.ok) throw new Error("venue not created");
  return result.venue.id;
}

async function context(ownerId: string, name: string) {
  const result = await createContext(db, ownerId, name);
  if (!result.ok) throw new Error("context not created");
  return result.context.id;
}

const input = (sermonId: string, fields: Record<string, unknown> = {}) =>
  schemas.occurrenceInput.parse({ sermonId, preachedOn: "2026-10-11", ...fields });

/** Records an occasion that must succeed, and returns its ID. */
async function preach(
  ownerId: string,
  sermonId: string,
  fields: Record<string, unknown> = {},
  id?: string,
) {
  const outcome = await createOccurrence(db, ownerId, input(sermonId, fields), id);
  if (outcome.status !== "created") throw new Error(`not created: ${outcome.status}`);
  return outcome.occurrence.id;
}

const history = (ownerId: string, query: HistoryQueryInput = {}, pageSize?: number) =>
  searchHistory(db, ownerId, historyQuerySchema.parse(query), pageSize);

const allRows = () => db.select().from(preachingOccurrences).orderBy(preachingOccurrences.id);

describe("createOccurrence", () => {
  it("records an occasion with everything said about it, and reads it back", async () => {
    const sermon = await idea(me, "His Grace is Sufficient");
    const church = await venue(me, "Faithful Word Baptist Church");
    const service = await context(me, "Regular Church Service");
    const id = await preach(me, sermon, {
      timeOfDay: "am",
      venueId: church,
      contextId: service,
      actualFormat: "full_length",
      durationMinutes: 52,
      notes: "Went well.",
      recordingUrl: "https://www.youtube.com/watch?v=abc123",
    });

    const saved = await getOccurrence(db, me, id);
    expect(saved).toMatchObject({
      id,
      ownerId: me,
      sermonId: sermon,
      preachedOn: "2026-10-11",
      timeOfDay: "am",
      actualFormat: "full_length",
      durationMinutes: 52,
      notes: "Went well.",
      recordingUrl: "https://www.youtube.com/watch?v=abc123",
      sermon: { id: sermon, title: "His Grace is Sufficient", kind: "sermon", archivedAt: null },
      venue: { id: church, name: "Faithful Word Baptist Church", locality: null },
      context: { id: service, name: "Regular Church Service" },
    });
    expect(saved?.createdAt).toBeInstanceOf(Date);
  });

  it("records one with only a date, and says nothing else", async () => {
    const sermon = await idea(me, "Grace");
    const saved = await getOccurrence(db, me, await preach(me, sermon));
    expect(saved).toMatchObject({
      timeOfDay: null,
      venueId: null,
      contextId: null,
      actualFormat: "unspecified",
      durationMinutes: null,
      notes: null,
      recordingUrl: null,
      venue: null,
      context: null,
    });
  });

  it("keeps the date as a calendar date, whatever the day", async () => {
    const sermon = await idea(me, "Grace");
    for (const day of ["2026-01-01", "2024-02-29", "2025-12-31", "2026-03-08", "2026-10-12"]) {
      const id = await preach(me, sermon, { preachedOn: day });
      expect((await getOccurrence(db, me, id))?.preachedOn).toBe(day);
    }
    // And as the database holds it, read as text so no driver stands between.
    const stored = await db
      .select({ day: sql<string>`${preachingOccurrences.preachedOn}::text` })
      .from(preachingOccurrences)
      .orderBy(preachingOccurrences.preachedOn);
    expect(stored.map((row) => row.day)).toEqual([
      "2024-02-29",
      "2025-12-31",
      "2026-01-01",
      "2026-03-08",
      "2026-10-12",
    ]);
  });

  it("lets one sermon be preached many times, twice on one date included, and stay one sermon", async () => {
    const sermon = await idea(me, "Grace");
    await preach(me, sermon, { preachedOn: "2026-09-06", timeOfDay: "am" });
    await preach(me, sermon, { preachedOn: "2026-10-11", timeOfDay: "am" });
    await preach(me, sermon, { preachedOn: "2026-10-11", timeOfDay: "pm" });
    await preach(me, sermon, { preachedOn: "2026-10-11", timeOfDay: "pm" });

    expect((await listForSermon(db, me, sermon)).total).toBe(4);
    expect(await db.select().from(ideas)).toHaveLength(1);

    // As the dashboard asks: the latest three, each its own row, and how many there are in all.
    const latest = await history(me, {}, 3);
    expect(latest.total).toBe(4);
    expect(latest.items.map((item) => [item.preachedOn, item.timeOfDay])).toEqual([
      ["2026-10-11", "pm"],
      ["2026-10-11", "pm"],
      ["2026-10-11", "am"],
    ]);
    expect(new Set(latest.items.map((item) => item.id)).size).toBe(3);
    expect(latest.items.every((item) => item.sermon.id === sermon)).toBe(true);
  });

  it("changes nothing about the sermon", async () => {
    const sermon = await idea(me, "Grace");
    const before = await getIdea(db, me, sermon);
    await preach(me, sermon, { actualFormat: "mini", durationMinutes: 12 });
    expect(await getIdea(db, me, sermon)).toEqual(before);
    expect(before).toMatchObject({ status: "idea", intendedFormat: "unspecified" });
  });

  it("answers a repeated submission with the first one's row, unchanged", async () => {
    const sermon = await idea(me, "Grace");
    const id = "99999999-9999-4999-8999-999999999999";
    const first = await createOccurrence(db, me, input(sermon, { notes: "First." }), id);
    expect(first.status).toBe("created");

    // The retry says something else; nothing of it is kept.
    const again = await createOccurrence(
      db,
      me,
      input(sermon, { notes: "Second.", preachedOn: "2026-01-01", durationMinutes: 5 }),
      id,
    );
    expect(again).toMatchObject({
      status: "existing",
      occurrence: { id, notes: "First.", preachedOn: "2026-10-11", durationMinutes: null },
    });
    expect(await allRows()).toHaveLength(1);

    // Even once the idea is no longer a sermon, a retry is still only a retry.
    await setIdeaKind(db, me, sermon, "point");
    expect((await createOccurrence(db, me, input(sermon), id)).status).toBe("existing");
  });

  it("neither shows nor touches another account's occasion with the same ID", async () => {
    const theirs = await idea(other, "Their sermon");
    const mine = await idea(me, "My sermon");
    const id = "99999999-9999-4999-8999-999999999999";
    await preach(other, theirs, { notes: "Theirs." }, id);
    const before = await allRows();

    const outcome = await createOccurrence(db, me, input(mine, { notes: "Mine." }), id);
    expect(outcome).toEqual({ status: "unavailable" });
    expect(await allRows()).toEqual(before);
    expect(await getOccurrence(db, me, id)).toBeNull();
  });

  it("refuses a sermon that is missing or someone else's, alike", async () => {
    const theirs = await idea(other, "Their sermon");
    const nowhere = "88888888-8888-4888-8888-888888888888";
    expect(await createOccurrence(db, me, input(theirs))).toEqual({ status: "missing" });
    expect(await createOccurrence(db, me, input(nowhere))).toEqual({ status: "missing" });
    expect(await allRows()).toHaveLength(0);
  });

  it("refuses a venue or a context that is missing or someone else's", async () => {
    const sermon = await idea(me, "Grace");
    const theirVenue = await venue(other, "Their church");
    const theirContext = await context(other, "Their class");
    const nowhere = "88888888-8888-4888-8888-888888888888";

    for (const venueId of [theirVenue, nowhere]) {
      expect(await createOccurrence(db, me, input(sermon, { venueId }))).toEqual({
        status: "unknown_venue",
      });
    }
    for (const contextId of [theirContext, nowhere]) {
      expect(await createOccurrence(db, me, input(sermon, { contextId }))).toEqual({
        status: "unknown_context",
      });
    }
    expect(await allRows()).toHaveLength(0);
  });

  it("refuses a point and an undecided idea", async () => {
    for (const kind of ["point", "undecided"] as const) {
      const id = await idea(me, `A ${kind}`, kind);
      expect(await createOccurrence(db, me, input(id))).toEqual({ status: "not_sermon" });
    }
    expect(await allRows()).toHaveLength(0);
  });

  it("locks the idea's row before it checks what kind it is", async () => {
    const statements: string[] = [];
    const logged = drizzle({
      client: new PGlite(),
      schema,
      logger: { logQuery: (query) => statements.push(query) },
    });
    await migrate(logged, { migrationsFolder: "./drizzle" });
    const [owner] = await logged.insert(users).values({ clerkUserId: "user_me" }).returning();
    const created = await createIdea(
      logged,
      owner.id,
      ideaInputSchema.parse({ kind: "sermon", title: "Grace" }),
    );

    statements.length = 0;
    await createOccurrence(logged, owner.id, input(created!.id));
    const lock = statements.findIndex(
      (query) => /from "ideas"/.test(query) && /for update/i.test(query),
    );
    const insert = statements.findIndex((query) =>
      /insert into "preaching_occurrences"/.test(query),
    );
    expect(lock).toBeGreaterThanOrEqual(0);
    expect(insert).toBeGreaterThan(lock);

    // Deleting the idea takes the same lock before it looks for history.
    statements.length = 0;
    await deleteIdea(logged, owner.id, created!.id);
    expect(statements.some((q) => /from "ideas"/.test(q) && /for update/i.test(q))).toBe(true);
  });
});

describe("the database itself", () => {
  const insert = (values: Record<string, string>) => {
    const columns = Object.keys(values).join(", ");
    const literals = Object.values(values)
      .map((value) => `'${value}'`)
      .join(", ");
    return db.execute(`insert into preaching_occurrences (${columns}) values (${literals})`);
  };

  it("refuses an occasion that joins one account to another's sermon, venue, or context", async () => {
    const mine = await idea(me, "My sermon");
    const theirs = await idea(other, "Their sermon");
    const theirVenue = await venue(other, "Their church");
    const theirContext = await context(other, "Their class");
    const base = { owner_id: me, sermon_id: mine, preached_on: "2026-10-11" };

    await expect(insert({ ...base, sermon_id: theirs })).rejects.toThrow();
    await expect(insert({ ...base, venue_id: theirVenue })).rejects.toThrow();
    await expect(insert({ ...base, context_id: theirContext })).rejects.toThrow();
    await expect(insert(base)).resolves.toBeDefined();
  });

  it("refuses values outside the lists and limits", async () => {
    const mine = await idea(me, "My sermon");
    const base = { owner_id: me, sermon_id: mine, preached_on: "2026-10-11" };
    await expect(insert({ ...base, time_of_day: "evening" })).rejects.toThrow();
    await expect(insert({ ...base, actual_format: "long" })).rejects.toThrow();
    await expect(insert({ ...base, duration_minutes: "-1" })).rejects.toThrow();
    await expect(insert({ ...base, duration_minutes: "1441" })).rejects.toThrow();
    await expect(insert({ ...base, recording_url: "http://example.com" })).rejects.toThrow();
    await expect(insert({ ...base, notes: "a".repeat(5001) })).rejects.toThrow();
    await expect(insert({ ...base, preached_on: "2026-02-31" })).rejects.toThrow();
    expect(await allRows()).toHaveLength(0);
  });

  it("will not delete a preached idea, a used venue, or a used context from under history", async () => {
    const sermon = await idea(me, "Grace");
    const church = await venue(me, "Church");
    const service = await context(me, "Service");
    await preach(me, sermon, { venueId: church, contextId: service });

    await expect(db.execute(`delete from ideas where id = '${sermon}'`)).rejects.toThrow();
    await expect(
      db.execute(`delete from preaching_venues where id = '${church}'`),
    ).rejects.toThrow();
    await expect(
      db.execute(`delete from preaching_contexts where id = '${service}'`),
    ).rejects.toThrow();
    expect(await allRows()).toHaveLength(1);
  });
});

describe("updateOccurrence", () => {
  const change = (fields: Record<string, unknown>) => schemas.occurrenceUpdate.parse(fields);

  it("changes what is named, clears what is given as null, and leaves the rest", async () => {
    const sermon = await idea(me, "Grace");
    const church = await venue(me, "Church");
    const id = await preach(me, sermon, {
      timeOfDay: "am",
      venueId: church,
      durationMinutes: 40,
      notes: "First draft.",
      actualFormat: "mini",
    });

    const outcome = await updateOccurrence(
      db,
      me,
      id,
      change({ preachedOn: "2026-10-04", timeOfDay: null, notes: null, durationMinutes: 45 }),
    );
    expect(outcome.status).toBe("updated");
    expect(await getOccurrence(db, me, id)).toMatchObject({
      preachedOn: "2026-10-04",
      timeOfDay: null,
      notes: null,
      durationMinutes: 45,
      // Not named, so kept.
      venueId: church,
      actualFormat: "mini",
      sermonId: sermon,
    });

    await updateOccurrence(db, me, id, change({ venueId: null }));
    expect((await getOccurrence(db, me, id))?.venue).toBeNull();
  });

  it("refuses another account's occasion, venue, or context, and changes nothing", async () => {
    const mine = await idea(me, "Mine");
    const theirs = await idea(other, "Theirs");
    const myOccasion = await preach(me, mine);
    const theirOccasion = await preach(other, theirs, { notes: "Theirs." });
    const theirVenue = await venue(other, "Their church");
    const theirContext = await context(other, "Their class");
    const before = await allRows();

    expect(await updateOccurrence(db, me, theirOccasion, change({ notes: "Mine now." }))).toEqual({
      status: "missing",
    });
    expect(await updateOccurrence(db, me, myOccasion, change({ venueId: theirVenue }))).toEqual({
      status: "unknown_venue",
    });
    expect(await updateOccurrence(db, me, myOccasion, change({ contextId: theirContext }))).toEqual(
      { status: "unknown_context" },
    );
    expect(await allRows()).toEqual(before);
  });

  it("still edits an occasion whose sermon has since been refiled or archived", async () => {
    const sermon = await idea(me, "Grace");
    const id = await preach(me, sermon);
    await setIdeaKind(db, me, sermon, "point");
    await archiveIdea(db, me, sermon);
    expect((await updateOccurrence(db, me, id, change({ notes: "Later." }))).status).toBe(
      "updated",
    );
  });
});

describe("deleteOccurrence", () => {
  it("removes one occasion and nothing else", async () => {
    const sermon = await idea(me, "Grace");
    const church = await venue(me, "Church");
    const service = await context(me, "Service");
    const first = await preach(me, sermon, { venueId: church, contextId: service });
    const second = await preach(me, sermon, { venueId: church, contextId: service });
    const ideaBefore = await getIdea(db, me, sermon);

    expect(await deleteOccurrence(db, me, first)).toBe(true);
    expect(await deleteOccurrence(db, me, first)).toBe(false);
    expect(await getOccurrence(db, me, first)).toBeNull();
    expect(await getOccurrence(db, me, second)).toMatchObject({
      venue: { id: church },
      context: { id: service },
    });
    expect(await getIdea(db, me, sermon)).toEqual(ideaBefore);
  });

  it("does not delete another account's occasion", async () => {
    const theirs = await idea(other, "Theirs");
    const id = await preach(other, theirs);
    expect(await deleteOccurrence(db, me, id)).toBe(false);
    expect(await getOccurrence(db, other, id)).not.toBeNull();
  });
});

describe("a sermon with history", () => {
  it("keeps its history when it is archived and restored, and history still shows it", async () => {
    const sermon = await idea(me, "Grace");
    const id = await preach(me, sermon, { notes: "Kept." });
    const before = await allRows();

    await archiveIdea(db, me, sermon);
    expect(await allRows()).toEqual(before);
    // The library leaves the archived sermon out; history does not.
    expect((await searchIdeas(db, me, defaultLibraryQuery)).total).toBe(0);
    const archived = await history(me);
    expect(archived.total).toBe(1);
    expect(archived.items[0].sermon.archivedAt).toBeInstanceOf(Date);
    expect((await getOccurrence(db, me, id))?.notes).toBe("Kept.");
    // And an archived sermon may still be recorded as preached.
    await preach(me, sermon, { preachedOn: "2026-10-04" });

    await restoreIdea(db, me, sermon);
    expect((await allRows()).filter((row) => row.id === id)).toEqual(before);
    expect((await history(me)).items.every((item) => item.sermon.archivedAt === null)).toBe(true);
  });

  it("keeps its history when it is refiled, takes no more until it is a sermon again", async () => {
    const sermon = await idea(me, "Grace");
    const id = await preach(me, sermon, { notes: "Kept." });
    const before = await allRows();

    for (const kind of ["point", "undecided"] as const) {
      await setIdeaKind(db, me, sermon, kind);
      expect(await allRows()).toEqual(before);
      expect((await getOccurrence(db, me, id))?.sermon.kind).toBe(kind);
      expect((await history(me)).total).toBe(1);
      expect(await createOccurrence(db, me, input(sermon))).toEqual({ status: "not_sermon" });
    }

    await setIdeaKind(db, me, sermon, "sermon");
    await preach(me, sermon, { preachedOn: "2026-10-04" });
    expect((await listForSermon(db, me, sermon)).total).toBe(2);
  });

  it("cannot be deleted, whatever it is filed as, until its history is gone", async () => {
    const sermon = await idea(me, "Grace");
    const id = await preach(me, sermon);

    expect(await deleteIdea(db, me, sermon)).toBe("preached");
    await archiveIdea(db, me, sermon);
    expect(await deleteIdea(db, me, sermon)).toBe("preached");
    await setIdeaKind(db, me, sermon, "point");
    expect(await deleteIdea(db, me, sermon)).toBe("preached");
    expect(await getIdea(db, me, sermon)).not.toBeNull();
    expect(await allRows()).toHaveLength(1);

    // Someone else is told only that there is no such idea.
    expect(await deleteIdea(db, other, sermon)).toBe("missing");

    await deleteOccurrence(db, me, id);
    expect(await deleteIdea(db, me, sermon)).toBe("deleted");
  });

  it("is deleted as before when it has none", async () => {
    const sermon = await idea(me, "Never preached");
    const preached = await idea(me, "Preached");
    await preach(me, preached);
    expect(await deleteIdea(db, me, sermon)).toBe("deleted");
    expect(await getIdea(db, me, sermon)).toBeNull();
    expect(await allRows()).toHaveLength(1);
  });
});

describe("searchHistory", () => {
  let grace: string;
  let faith: string;
  let church: string;
  let chapel: string;
  let service: string;
  let klass: string;

  beforeEach(async () => {
    grace = await idea(me, "His Grace is Sufficient");
    faith = await idea(me, "Faith Speaks First");
    church = await venue(me, "Faithful Word Baptist Church");
    chapel = await venue(me, "Campus Chapel");
    service = await context(me, "Regular Church Service");
    klass = await context(me, "Preaching Class");

    await preach(me, grace, {
      preachedOn: "2026-10-11",
      timeOfDay: "am",
      venueId: church,
      contextId: service,
      actualFormat: "full_length",
    });
    await preach(me, grace, {
      preachedOn: "2026-10-11",
      timeOfDay: "pm",
      venueId: church,
      contextId: service,
      actualFormat: "full_length",
    });
    await preach(me, grace, {
      preachedOn: "2026-06-02",
      venueId: chapel,
      contextId: klass,
      actualFormat: "mini",
    });
    await preach(me, faith, { preachedOn: "2026-08-19", timeOfDay: "pm", venueId: chapel });
    await preach(me, faith, { preachedOn: "2025-12-25" });

    // Another account's history, which no query below may ever return.
    const theirs = await idea(other, "His Grace is Sufficient");
    const theirVenue = await venue(other, "Faithful Word Baptist Church");
    await preach(other, theirs, { preachedOn: "2026-10-11", venueId: theirVenue });
  });

  const days = (page: { items: { preachedOn: string; timeOfDay: string | null }[] }) =>
    page.items.map((item) => `${item.preachedOn}${item.timeOfDay ? ` ${item.timeOfDay}` : ""}`);

  it("lists the owner's history only, most recently preached first", async () => {
    const page = await history(me);
    expect(page).toMatchObject({ total: 5, page: 1, totalPages: 1 });
    expect(days(page)).toEqual([
      "2026-10-11 pm",
      "2026-10-11 am",
      "2026-08-19 pm",
      "2026-06-02",
      "2025-12-25",
    ]);
    expect(page.items.every((item) => item.ownerId === me)).toBe(true);
    expect((await history(other)).total).toBe(1);
  });

  it("can be read oldest first", async () => {
    expect(days(await history(me, { sort: "date-asc" }))).toEqual([
      "2025-12-25",
      "2026-06-02",
      "2026-08-19 pm",
      "2026-10-11 am",
      "2026-10-11 pm",
    ]);
  });

  it("filters by sermon, date range, venue, context, format, and part of the day", async () => {
    expect((await history(me, { sermonId: grace })).total).toBe(3);
    expect(days(await history(me, { from: "2026-06-02", through: "2026-08-19" }))).toEqual([
      "2026-08-19 pm",
      "2026-06-02",
    ]);
    expect((await history(me, { from: "2026-10-11" })).total).toBe(2);
    expect((await history(me, { through: "2025-12-25" })).total).toBe(1);
    expect((await history(me, { venueIds: [chapel] })).total).toBe(2);
    expect((await history(me, { venueIds: [chapel, church] })).total).toBe(4);
    expect((await history(me, { contextIds: [klass] })).total).toBe(1);
    expect((await history(me, { formats: ["mini"] })).total).toBe(1);
    expect((await history(me, { formats: ["mini", "unspecified"] })).total).toBe(3);
    expect((await history(me, { timesOfDay: ["pm"] })).total).toBe(2);
    expect((await history(me, { timesOfDay: ["unspecified"] })).total).toBe(2);
    expect((await history(me, { timesOfDay: ["am", "unspecified"] })).total).toBe(3);
    // Different filters must all hold.
    expect(
      (await history(me, { sermonId: grace, venueIds: [church], timesOfDay: ["pm"] })).total,
    ).toBe(1);
    expect((await history(me, { sermonId: faith, contextIds: [service] })).total).toBe(0);
  });

  it("finds nothing through another account's sermon, venue, or context", async () => {
    const [theirs] = (await history(other)).items;
    expect((await history(me, { sermonId: theirs.sermonId })).total).toBe(0);
    expect((await history(me, { venueIds: [theirs.venueId!] })).total).toBe(0);
    expect(await getOccurrence(db, me, theirs.id)).toBeNull();
    expect((await listForSermon(db, me, theirs.sermonId)).total).toBe(0);
  });

  it("searches the sermon's title and the names of the venue and the context", async () => {
    expect((await history(me, { q: "grace" })).total).toBe(3);
    expect((await history(me, { q: "CHAPEL" })).total).toBe(2);
    expect((await history(me, { q: "preaching class" })).total).toBe(1);
    // Every word must be found, each anywhere: "faith" is a title and a venue.
    expect((await history(me, { q: "faith" })).total).toBe(4);
    expect((await history(me, { q: "faith chapel" })).total).toBe(1);
    expect((await history(me, { q: "nothing" })).total).toBe(0);
    // A pattern character is only itself.
    expect((await history(me, { q: "%" })).total).toBe(0);
  });

  it("pages in one order, without repeating or dropping an occasion", async () => {
    const seen: string[] = [];
    for (const page of [1, 2, 3]) {
      const result = await history(me, { page }, 2);
      expect(result).toMatchObject({ total: 5, page, pageSize: 2, totalPages: 3 });
      seen.push(...result.items.map((item) => item.id));
    }
    expect(new Set(seen).size).toBe(5);
    expect(seen).toEqual((await history(me)).items.map((item) => item.id));

    // A page past the end is the last page.
    const last = await history(me, { page: 99 }, 2);
    expect(last.page).toBe(3);
    expect(last.items).toHaveLength(1);
    expect(await history(me, { q: "nothing", page: 4 })).toMatchObject({
      items: [],
      total: 0,
      page: 1,
      totalPages: 0,
    });
  });

  it("keeps occasions that tie in every way in one order from page to page", async () => {
    const sermon = await idea(me, "Same day");
    for (let index = 0; index < 5; index += 1) await preach(me, sermon, { timeOfDay: "am" });
    await db
      .update(preachingOccurrences)
      .set({ createdAt: new Date("2026-10-11T12:00:00Z") })
      .where(eq(preachingOccurrences.sermonId, sermon));

    const whole = (await listForSermon(db, me, sermon)).items.map((item) => item.id);
    const paged: string[] = [];
    for (const page of [1, 2, 3]) {
      paged.push(...(await listForSermon(db, me, sermon, page, 2)).items.map((item) => item.id));
    }
    expect(paged).toEqual(whole);
    expect(whole).toEqual([...whole].sort().reverse());
  });
});

describe("occurrenceCounts", () => {
  it("counts each sermon's occasions and gives the last date, for the owner only", async () => {
    const grace = await idea(me, "Grace");
    const faith = await idea(me, "Faith");
    const never = await idea(me, "Never preached");
    const theirs = await idea(other, "Theirs");
    await preach(me, grace, { preachedOn: "2026-06-02" });
    await preach(me, grace, { preachedOn: "2026-10-11" });
    await preach(me, grace, { preachedOn: "2025-12-25" });
    await preach(me, faith, { preachedOn: "2026-08-19" });
    await preach(other, theirs);

    const counts = await occurrenceCounts(db, me, [grace, faith, never, theirs]);
    expect(counts.get(grace)).toEqual({ count: 3, lastPreachedOn: "2026-10-11" });
    expect(counts.get(faith)).toEqual({ count: 1, lastPreachedOn: "2026-08-19" });
    expect(counts.has(never)).toBe(false);
    expect(counts.has(theirs)).toBe(false);
    expect((await occurrenceCounts(db, me, [])).size).toBe(0);
  });
});
