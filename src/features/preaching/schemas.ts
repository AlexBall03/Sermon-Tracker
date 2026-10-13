import { z } from "zod";

import { normaliseSearch, startOfDay } from "@/features/ideas/library-query";
import { dictionary, formatNumber } from "@/i18n";
import { defaultLocale, type Locale } from "@/i18n/locales";
import {
  actualFormats,
  defaultActualFormat,
  earliestPreachedOn,
  historyFilterLimit,
  historySorts,
  preachingLimits,
  timeOfDayFilters,
  timesOfDay,
} from "./model";

export const occurrenceIdSchema = z.uuid();
export const venueIdSchema = z.uuid();
export const contextIdSchema = z.uuid();

/** An ID as it is stored and compared: lower case. */
const id = z.uuid().transform((value) => value.toLowerCase());

/**
 * The latest calendar date it is anywhere on Earth at this moment (UTC+14),
 * as YYYY-MM-DD. A sermon cannot have been preached after it. There is no
 * time zone setting, and the server's own date would refuse someone east of
 * it who preached this morning; this refuses no date that has begun anywhere.
 */
export function latestDateOnEarth(now: Date = new Date()): string {
  return new Date(now.getTime() + 14 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** True for a real calendar date written YYYY-MM-DD. */
export function isCalendarDate(value: string) {
  return startOfDay(value) !== null;
}

/**
 * What history is asked for: a search, filters, an order, and a page. Within
 * a filter any chosen value will do, and an empty one asks nothing; different
 * filters must all hold. Dates are calendar days, both ends inclusive. It
 * says nothing in words, so it needs no language, and nothing about the
 * account: the owner is the caller's session.
 */
const day = z
  .string()
  .refine(isCalendarDate)
  .nullish()
  .transform((value) => value ?? null);

const idList = z
  .array(id)
  .max(historyFilterLimit)
  .default([])
  .transform((ids) => [...new Set(ids)]);

export const historyQuerySchema = z.object({
  /** Words looked for in the sermon's title and the names of the venue and the context. */
  q: z.string().default("").transform(normaliseSearch),
  /** One sermon's occasions only. */
  sermonId: id.nullish().transform((value) => value ?? null),
  from: day,
  through: day,
  venueIds: idList,
  contextIds: idList,
  formats: z
    .array(z.enum(actualFormats))
    .default([])
    .transform((values) => [...new Set(values)]),
  /** `unspecified` asks for the occasions that did not say. */
  timesOfDay: z
    .array(z.enum(timeOfDayFilters))
    .default([])
    .transform((values) => [...new Set(values)]),
  sort: z.enum(historySorts).default(historySorts[0]),
  page: z.number().int().min(1).max(1_000_000).default(1),
});
export type HistoryQuery = z.infer<typeof historyQuerySchema>;
export type HistoryQueryInput = z.input<typeof historyQuerySchema>;

export const defaultHistoryQuery: HistoryQuery = historyQuerySchema.parse({});

/**
 * The schemas of preaching history, saying what they refuse in one language.
 * The rules are the same whatever the language. They have no server code, so
 * a form checks with these before it asks, and the server checks again.
 *
 * `today` is the last date a sermon can have been preached on; it is a
 * parameter so a test can fix it.
 */
export function preachingSchemas(
  locale: Locale = defaultLocale,
  today: string = latestDateOnEarth(),
) {
  const t = dictionary(locale, "preaching").validation;

  /** The date it was preached: a real calendar date, kept as written, and not in the future. */
  const preachedOn = z
    .string(t.dateRequired)
    .trim()
    .min(1, t.dateRequired)
    .refine(isCalendarDate, t.dateInvalid)
    .refine((value) => value >= earliestPreachedOn, t.dateTooEarly)
    .refine((value) => value <= today, t.dateInFuture);

  /*
   * Each optional field below is its value or null, and null is what "nothing"
   * is stored as: an empty note, a cleared link, a part of the day not said.
   * A new occasion that leaves one out is given null. An update that leaves
   * one out leaves it as it was, which is why these have no default here.
   */
  const timeOfDay = z.enum(timesOfDay).nullable();
  const reference = id.nullable();

  /** Whole minutes. Nothing said is null, never zero. */
  const durationMinutes = z
    .number(t.durationInvalid)
    .int(t.durationInvalid)
    .min(0, t.durationInvalid)
    .max(preachingLimits.durationMinutes, t.durationTooLong)
    .nullable();

  const notes = z
    .string()
    .trim()
    .max(preachingLimits.notes, t.tooLong(formatNumber(locale, preachingLimits.notes)))
    .nullable()
    .transform((value) => value || null);

  /**
   * A link to a recording kept somewhere else: any https address, with no
   * list of sites it must be on, and no username or password in it. It is
   * stored as the browser would write it, so the scheme is always lower case.
   */
  const recordingUrl = z
    .string()
    .trim()
    .nullable()
    .transform((value, context) => {
      if (!value) return null;
      const refuse = (message: string) => {
        context.addIssue({ code: "custom", message });
        return z.NEVER;
      };
      const tooLong = t.urlTooLong(formatNumber(locale, preachingLimits.recordingUrl));
      if (value.length > preachingLimits.recordingUrl) return refuse(tooLong);
      if (!URL.canParse(value)) return refuse(t.urlInvalid);
      const url = new URL(value);
      if (url.protocol !== "https:") return refuse(t.urlNotHttps);
      if (url.username || url.password) return refuse(t.urlCredentials);
      if (!url.hostname) return refuse(t.urlInvalid);
      if (url.href.length > preachingLimits.recordingUrl) return refuse(tooLong);
      return url.href;
    });

  const blank = <T extends z.ZodType>(schema: T) =>
    schema.optional().transform((value) => value ?? null);

  /**
   * A new occasion. There is no owner here: the sermon is found among the
   * signed-in account's own, or not at all, and so are the venue and context.
   */
  const occurrenceInput = z.object({
    sermonId: z.uuid(t.chooseSermon).transform((value) => value.toLowerCase()),
    preachedOn,
    timeOfDay: blank(timeOfDay),
    venueId: blank(reference),
    contextId: blank(reference),
    // Never taken from the sermon's intended format: not said is `unspecified`.
    actualFormat: z.enum(actualFormats).default(defaultActualFormat),
    durationMinutes: blank(durationMinutes),
    notes: blank(notes),
    recordingUrl: blank(recordingUrl),
  });

  /**
   * A change to an occasion. A field left out is left alone; a field given
   * as null is cleared. The sermon is not among them: an occasion stays with
   * the sermon it was recorded for.
   */
  const occurrenceUpdate = z
    .object({
      preachedOn: preachedOn.optional(),
      timeOfDay: timeOfDay.optional(),
      venueId: reference.optional(),
      contextId: reference.optional(),
      actualFormat: z.enum(actualFormats).optional(),
      durationMinutes: durationMinutes.optional(),
      notes: notes.optional(),
      recordingUrl: recordingUrl.optional(),
    })
    .refine((change) => Object.values(change).some((value) => value !== undefined), {
      message: t.nothingToChange,
    });

  /** A name: trimmed, with runs of whitespace inside it reduced to one space. */
  const name = (required: string, limit: number, tooLong: string) =>
    z
      .string(required)
      .transform((value) => value.replace(/\s+/g, " ").trim())
      .pipe(z.string().min(1, required).max(limit, tooLong));

  const venueName = name(
    t.venueName,
    preachingLimits.venueName,
    t.venueTooLong(preachingLimits.venueName),
  );
  const locality = z
    .string()
    .transform((value) => value.replace(/\s+/g, " ").trim())
    .pipe(
      z
        .string()
        .max(
          preachingLimits.venueLocality,
          t.tooLong(formatNumber(locale, preachingLimits.venueLocality)),
        ),
    )
    .nullable()
    .transform((value) => value || null);

  const venueInput = z.object({ name: venueName, locality: blank(locality) });

  /** A change to a venue: its name, its locality, or both. Left out is left alone. */
  const venueUpdate = z
    .object({ name: venueName.optional(), locality: locality.optional() })
    .refine((change) => Object.values(change).some((value) => value !== undefined), {
      message: t.nothingToChange,
    });

  const contextName = name(
    t.contextName,
    preachingLimits.contextName,
    t.contextTooLong(preachingLimits.contextName),
  );

  return { occurrenceInput, occurrenceUpdate, venueInput, venueUpdate, contextName };
}

type Schemas = ReturnType<typeof preachingSchemas>;

// The types only. There are no ready-made schemas to import, as ideas have:
// what is "today" must be asked each time, so parse with `preachingSchemas`.
export type OccurrenceInput = z.infer<Schemas["occurrenceInput"]>;
export type OccurrenceUpdate = z.infer<Schemas["occurrenceUpdate"]>;
export type VenueInput = z.infer<Schemas["venueInput"]>;
export type VenueUpdate = z.infer<Schemas["venueUpdate"]>;
