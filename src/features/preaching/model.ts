import { intendedFormats, type IntendedFormat } from "../ideas/model";

/**
 * The preaching vocabulary: what is recorded about one occasion a sermon was
 * preached on. Plain values with no database or server code, so the schema,
 * the server actions, and the browser all read the same lists.
 */

/**
 * The part of the day, when it was said: `am` is the morning, `pm` the
 * afternoon or evening. No clock time is kept, and it is never worked out
 * from the venue, the context, or the date.
 */
export const timesOfDay = ["am", "pm"] as const;
export type TimeOfDay = (typeof timesOfDay)[number];

/** What a history filter asks of the part of the day: either one, or occasions that did not say. */
export const timeOfDayFilters = [...timesOfDay, "unspecified"] as const;
export type TimeOfDayFilter = (typeof timeOfDayFilters)[number];

/**
 * The format a sermon was actually delivered in. The words are the intended
 * format's, but it is a fact about one occasion: it is never copied from the
 * sermon's intended format, and never worked out from the duration.
 */
export const actualFormats = intendedFormats;
export type ActualFormat = IntendedFormat;
export const defaultActualFormat: ActualFormat = "unspecified";

/**
 * The contexts offered to choose from: what kind of occasion it was, never
 * the weekday or the part of the day, which the date and `timesOfDay` already
 * say. These are keys; their names are in the `preaching` dictionary. None is
 * stored for an account until it is chosen, and an account may name its own.
 */
export const suggestedContexts = [
  "regular_service",
  "preaching_class",
  "conference",
  "special_service",
  "other",
] as const;
export type SuggestedContext = (typeof suggestedContexts)[number];

/** The database enforces the same limits with CHECK constraints. */
export const preachingLimits = {
  venueName: 80,
  venueLocality: 120,
  contextName: 80,
  notes: 5000,
  recordingUrl: 2048,
  /** A whole day, in minutes. */
  durationMinutes: 1440,
} as const;

/** The earliest date an occasion may be recorded on. */
export const earliestPreachedOn = "1900-01-01";

/** How many venues, contexts, formats, or parts of the day history can be filtered by at once. */
export const historyFilterLimit = 20;

/** History's orderings, by the date preached. The first is the default. */
export const historySorts = ["date-desc", "date-asc"] as const;
export type HistorySort = (typeof historySorts)[number];

/** Occasions on one page of history. */
export const historyPageSize = 24;
