import { describe, expect, it } from "vitest";

import { suggestedContexts } from "./model";
import { historyQuerySchema, latestDateOnEarth, preachingSchemas } from "./schemas";
import { suggestedContextOptions } from "./suggestions";

const today = "2026-10-12";
const schemas = preachingSchemas("en", today);
const sermonId = "11111111-1111-4111-8111-111111111111";
const venueId = "22222222-2222-4222-8222-222222222222";

const input = (fields: Record<string, unknown> = {}) =>
  schemas.occurrenceInput.safeParse({ sermonId, preachedOn: "2026-10-11", ...fields });
const message = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.error?.issues[0]?.message;

describe("a new occasion", () => {
  it("needs only a sermon and a date, and says nothing it was not told", () => {
    expect(input().data).toEqual({
      sermonId,
      preachedOn: "2026-10-11",
      timeOfDay: null,
      venueId: null,
      contextId: null,
      actualFormat: "unspecified",
      durationMinutes: null,
      notes: null,
      recordingUrl: null,
    });
  });

  it("keeps the date exactly as it was written", () => {
    for (const day of ["2026-10-12", "2024-02-29", "1900-01-01", "2026-01-01"]) {
      expect(input({ preachedOn: day }).data?.preachedOn).toBe(day);
    }
  });

  it("refuses a date that is not one, is in the future, or is too long ago", () => {
    for (const day of ["2026-02-31", "2025-02-29", "11/10/2026", "2026-10-11T10:00:00Z", "soon"]) {
      expect(message(input({ preachedOn: day }))).toBe("That is not a date.");
    }
    expect(message(input({ preachedOn: "" }))).toBe("Give the date it was preached.");
    expect(message(input({ preachedOn: undefined }))).toBe("Give the date it was preached.");
    expect(message(input({ preachedOn: "2026-10-13" }))).toBe("The date cannot be in the future.");
    expect(message(input({ preachedOn: "1899-12-31" }))).toBe("That date is too long ago.");
  });

  it("takes today to be the latest date it is anywhere", () => {
    // 11:00 UTC on the 12th is already the 13th at UTC+14, and 09:00 is not.
    expect(latestDateOnEarth(new Date("2026-10-12T11:00:00Z"))).toBe("2026-10-13");
    expect(latestDateOnEarth(new Date("2026-10-12T09:59:59Z"))).toBe("2026-10-12");
    expect(latestDateOnEarth(new Date("2026-12-31T10:00:00Z"))).toBe("2027-01-01");
  });

  it("takes AM, PM, or nothing for the part of the day", () => {
    expect(input({ timeOfDay: "am" }).data?.timeOfDay).toBe("am");
    expect(input({ timeOfDay: "pm" }).data?.timeOfDay).toBe("pm");
    expect(input({ timeOfDay: null }).data?.timeOfDay).toBeNull();
    for (const value of ["AM", "morning", "10:30", ""]) {
      expect(input({ timeOfDay: value }).success).toBe(false);
    }
  });

  it("takes one of the four formats and no other", () => {
    for (const format of ["full_length", "mini", "flexible", "unspecified"]) {
      expect(input({ actualFormat: format }).data?.actualFormat).toBe(format);
    }
    for (const format of ["long", "Full-Length", "", null]) {
      expect(input({ actualFormat: format }).success).toBe(false);
    }
  });

  it("keeps a duration in whole minutes, and nothing is not zero", () => {
    expect(input({ durationMinutes: 0 }).data?.durationMinutes).toBe(0);
    expect(input({ durationMinutes: 45 }).data?.durationMinutes).toBe(45);
    expect(input({ durationMinutes: 1440 }).data?.durationMinutes).toBe(1440);
    expect(input({ durationMinutes: null }).data?.durationMinutes).toBeNull();
    expect(input().data?.durationMinutes).toBeNull();
    for (const value of [-1, 12.5, "45", Number.NaN]) {
      expect(message(input({ durationMinutes: value }))).toBe("Give the length in whole minutes.");
    }
    expect(message(input({ durationMinutes: 1441 }))).toBe("That is longer than a day.");
  });

  it("trims notes, stores none as null, and refuses more than 5,000 characters", () => {
    expect(input({ notes: "  Went long.  " }).data?.notes).toBe("Went long.");
    expect(input({ notes: "   " }).data?.notes).toBeNull();
    expect(input({ notes: "a".repeat(5000) }).success).toBe(true);
    expect(message(input({ notes: "a".repeat(5001) }))).toBe("Use 5,000 characters or fewer.");
  });

  it("takes any https link to a recording", () => {
    for (const url of [
      "https://www.youtube.com/watch?v=abc123&t=30s",
      "https://youtu.be/abc123",
      "https://www.sermonaudio.com/sermons/1011261234567",
      "https://example.church/media/2026/grace.mp3#t=90",
    ]) {
      expect(input({ recordingUrl: url }).data?.recordingUrl).toBe(url);
    }
    expect(input({ recordingUrl: "  HTTPS://Example.com/a  " }).data?.recordingUrl).toBe(
      "https://example.com/a",
    );
    expect(input({ recordingUrl: "" }).data?.recordingUrl).toBeNull();
    expect(input({ recordingUrl: null }).data?.recordingUrl).toBeNull();
  });

  it("refuses a link that is not https, carries credentials, is not a link, or is too long", () => {
    for (const url of ["http://example.com/a", "ftp://example.com/a", "javascript:alert(1)"]) {
      expect(message(input({ recordingUrl: url }))).toBe("Use a link that begins with https://.");
    }
    for (const url of ["https://me:secret@example.com/a", "https://me@example.com/a"]) {
      expect(message(input({ recordingUrl: url }))).toBe(
        "Use a link without a username or password in it.",
      );
    }
    for (const url of ["youtube.com/watch", "not a link", "https://"]) {
      expect(message(input({ recordingUrl: url }))).toBe("That is not a link.");
    }
    expect(message(input({ recordingUrl: `https://example.com/${"a".repeat(2048)}` }))).toBe(
      "Keep the link to 2,048 characters or fewer.",
    );
  });

  it("needs a sermon, and drops an owner or anything else it does not know", () => {
    expect(message(schemas.occurrenceInput.safeParse({ preachedOn: "2026-10-11" }))).toBe(
      "Choose the sermon that was preached.",
    );
    expect(input({ sermonId: "nope" }).success).toBe(false);
    expect(input({ venueId: "nope" }).success).toBe(false);
    const parsed = input({ ownerId: venueId, id: venueId, createdAt: "x" }).data;
    expect(parsed).not.toHaveProperty("ownerId");
    expect(parsed).not.toHaveProperty("id");
  });

  it("speaks Spanish when asked", () => {
    const spanish = preachingSchemas("es", today).occurrenceInput;
    expect(message(spanish.safeParse({ sermonId, preachedOn: "2026-10-13" }))).toBe(
      "La fecha no puede estar en el futuro.",
    );
  });
});

describe("a change to an occasion", () => {
  const change = (fields: Record<string, unknown>) => schemas.occurrenceUpdate.safeParse(fields);

  it("tells a field left out from one that was cleared", () => {
    expect(change({ notes: null }).data).toEqual({ notes: null });
    expect(change({ notes: "" }).data).toEqual({ notes: null });
    expect(change({ durationMinutes: 30 }).data).toEqual({ durationMinutes: 30 });
    expect(change({ venueId: null, timeOfDay: null, recordingUrl: null }).data).toEqual({
      venueId: null,
      timeOfDay: null,
      recordingUrl: null,
    });
    // Nothing is filled in for what was not named, the format least of all.
    expect(change({ timeOfDay: "pm" }).data).toEqual({ timeOfDay: "pm" });
  });

  it("holds every field to the same rules as a new occasion", () => {
    expect(message(change({ preachedOn: "2026-10-13" }))).toBe("The date cannot be in the future.");
    expect(change({ preachedOn: null }).success).toBe(false);
    expect(change({ actualFormat: null }).success).toBe(false);
    expect(change({ recordingUrl: "http://example.com" }).success).toBe(false);
    expect(change({ durationMinutes: -5 }).success).toBe(false);
  });

  it("must name something, and cannot move the occasion to another sermon", () => {
    expect(message(change({}))).toBe("There is nothing to change.");
    expect(message(change({ sermonId }))).toBe("There is nothing to change.");
    expect(change({ sermonId, notes: "x" }).data).toEqual({ notes: "x" });
  });
});

describe("venues and contexts", () => {
  it("trim a name and reduce the whitespace inside it", () => {
    expect(schemas.venueInput.parse({ name: "  Faithful   Word\tBaptist Church " })).toEqual({
      name: "Faithful Word Baptist Church",
      locality: null,
    });
    expect(schemas.venueInput.parse({ name: "Chapel", locality: " Tempe,  AZ " }).locality).toBe(
      "Tempe, AZ",
    );
    expect(schemas.venueInput.parse({ name: "Chapel", locality: "  " }).locality).toBeNull();
    expect(schemas.contextName.parse("  Preaching   Class ")).toBe("Preaching Class");
  });

  it("refuse an empty name and one that is too long", () => {
    expect(message(schemas.venueInput.safeParse({ name: "   " }))).toBe("Give the venue a name.");
    expect(message(schemas.venueInput.safeParse({}))).toBe("Give the venue a name.");
    expect(message(schemas.venueInput.safeParse({ name: "a".repeat(81) }))).toBe(
      "Keep a venue's name to 80 characters or fewer.",
    );
    expect(message(schemas.contextName.safeParse(""))).toBe("Give the context a name.");
    expect(message(schemas.contextName.safeParse("a".repeat(81)))).toBe(
      "Keep a context's name to 80 characters or fewer.",
    );
    expect(schemas.venueInput.safeParse({ name: "x", locality: "a".repeat(121) }).success).toBe(
      false,
    );
  });

  it("change a venue's name, its locality, or both, and leave the rest alone", () => {
    expect(schemas.venueUpdate.parse({ name: " New  name " })).toEqual({ name: "New name" });
    expect(schemas.venueUpdate.parse({ locality: null })).toEqual({ locality: null });
    expect(schemas.venueUpdate.safeParse({}).success).toBe(false);
  });

  it("let a context be named anything, a weekday included", () => {
    expect(schemas.contextName.parse("Sunday Morning")).toBe("Sunday Morning");
  });
});

describe("the suggested contexts", () => {
  it("leave Preaching Class out for an account that does not attend one", () => {
    for (const options of [
      suggestedContextOptions("en"),
      suggestedContextOptions("es", { attendsPreachingClass: false }),
    ]) {
      expect(options.map((option) => option.key)).toEqual([
        "regular_service",
        "conference",
        "special_service",
        "other",
      ]);
    }
  });

  it("are kinds of occasion, in both languages, and never a weekday or a part of the day", () => {
    const english = suggestedContextOptions("en", { attendsPreachingClass: true });
    expect(english.map((option) => option.key)).toEqual([...suggestedContexts]);
    expect(english.map((option) => option.name)).toEqual([
      "Regular Church Service",
      "Preaching Class",
      "Conference / Preaching Bootcamp",
      "Special Service",
      "Other",
    ]);
    const spanish = suggestedContextOptions("es", { attendsPreachingClass: true });
    expect(spanish).toHaveLength(english.length);
    expect(spanish[1].name).toBe("Clase de predicación");

    const forbidden =
      /sunday|monday|tuesday|wednesday|thursday|friday|saturday|morning|evening|night|domingo|lunes|martes|miércoles|jueves|viernes|sábado|mañana|tarde|noche|\b[ap]m\b/i;
    for (const { name } of [...english, ...spanish]) expect(name).not.toMatch(forbidden);
    // Every suggestion is a name an account could save.
    for (const { name } of [...english, ...spanish]) {
      expect(schemas.contextName.safeParse(name).success).toBe(true);
    }
  });
});

describe("a history query", () => {
  it("asks for everything, most recent first, when nothing is said", () => {
    expect(historyQuerySchema.parse({})).toEqual({
      q: "",
      sermonId: null,
      from: null,
      through: null,
      venueIds: [],
      contextIds: [],
      formats: [],
      timesOfDay: [],
      sort: "date-desc",
      page: 1,
    });
  });

  it("normalises what it is given and refuses what it does not know", () => {
    const query = historyQuerySchema.parse({
      q: "  grace   church ",
      sermonId: sermonId.toUpperCase(),
      from: "2026-01-01",
      through: "2026-12-31",
      venueIds: [venueId, venueId],
      formats: ["mini", "mini"],
      timesOfDay: ["am", "unspecified"],
      sort: "date-asc",
      page: 3,
    });
    expect(query).toMatchObject({
      q: "grace church",
      sermonId,
      venueIds: [venueId],
      formats: ["mini"],
      timesOfDay: ["am", "unspecified"],
      sort: "date-asc",
      page: 3,
    });
    for (const bad of [
      { from: "2026-02-31" },
      { sort: "title" },
      { page: 0 },
      { page: 1.5 },
      { formats: ["long"] },
      { timesOfDay: ["evening"] },
      { venueIds: ["nope"] },
      { venueIds: Array.from({ length: 21 }, () => venueId) },
    ]) {
      expect(historyQuerySchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });
});
