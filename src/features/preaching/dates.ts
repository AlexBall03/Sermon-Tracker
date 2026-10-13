import { startOfDay } from "@/features/ideas/library-query";
import type { Locale } from "@/i18n/locales";
import { formatDate } from "@/lib/format";

/**
 * Calendar dates as preaching history shows and begins them. A date preached
 * is a `YYYY-MM-DD` string everywhere; these never turn one into a moment in
 * some zone and back, which is how a Sunday becomes a Saturday.
 */

/**
 * Today where the person is, as YYYY-MM-DD: the date their own clock shows,
 * read from its local fields. Never `toISOString`, which answers in UTC and is
 * tomorrow for an evening west of Greenwich.
 */
export function localDate(now: Date = new Date()): string {
  const two = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
}

/** A calendar date as the interface language writes it: "Oct 12, 2026". */
export function formatDay(value: string, locale: Locale): string {
  // Read as the start of that day in UTC and written in UTC: the same day on every clock.
  const date = startOfDay(value);
  return date ? formatDate(date, locale) : value;
}

/** Whole minutes as hours and minutes. */
export function splitDuration(minutes: number): { hours: number; minutes: number } {
  return { hours: Math.floor(minutes / 60), minutes: minutes % 60 };
}
