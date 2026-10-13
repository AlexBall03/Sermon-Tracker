import { normaliseSearch, searchTerms } from "@/features/ideas/library-query";
import { routes } from "@/lib/site";
import {
  actualFormats,
  historyFilterLimit,
  historySorts,
  timeOfDayFilters,
  type HistorySort,
} from "./model";
import {
  defaultHistoryQuery,
  historyQuerySchema,
  isCalendarDate,
  type HistoryQuery,
} from "./schemas";

/**
 * What the library's Preaching History section is asked for, as its address
 * carries it. Like the other sections' queries (features/ideas/library-query.ts,
 * features/scripture/saved/saved-query.ts) it holds nothing about the account
 * and is read leniently: a link opened by someone else shows their own
 * history, and a bad value falls back instead of failing. What comes out is a
 * `HistoryQuery`, checked by `historyQuerySchema`, and nothing else reaches
 * `searchHistory`.
 *
 *   /library/preaching-record                              everything, newest first
 *   /library/preaching-record?q=grace&time=pm              "grace", preached in the evening
 *   /library/preaching-record?sermon=<id>                  one sermon's occasions
 *   /library/preaching-record?from=2026-01-01&venue=<id>   this year, at one venue
 */

/** The names used in the URL. `venue`, `context`, `format`, and `time` repeat for several. */
export const historyParams = {
  q: "q",
  sermonId: "sermon",
  from: "from",
  through: "to",
  venueIds: "venue",
  contextIds: "context",
  formats: "format",
  timesOfDay: "time",
  sort: "sort",
  page: "page",
} as const;

export type HistorySearchParams =
  URLSearchParams | Record<string, string | string[] | undefined> | null | undefined;

const maxPage = 1_000_000;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function allValues(params: HistorySearchParams, key: string): string[] {
  if (!params) return [];
  if (params instanceof URLSearchParams) return params.getAll(key);
  // Only own keys: "constructor" in a URL must not find Object.prototype.
  if (!Object.hasOwn(params, key)) return [];
  const value = params[key];
  if (typeof value === "string") return [value];
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

/** The IDs among those given: each once, lower case, and no more than can be filtered by. */
function idList(values: readonly string[]): string[] {
  const ids = values.filter((value) => uuid.test(value)).map((value) => value.toLowerCase());
  return [...new Set(ids)].slice(0, historyFilterLimit);
}

/** The values of a list among those given: each once, in the order the model lists them. */
function among<T extends string>(list: readonly T[], values: readonly string[]): T[] {
  return list.filter((value) => values.includes(value));
}

/**
 * Reads the query from URL parameters. It never throws: anything missing,
 * malformed, or out of range becomes its default, unknown parameters are
 * ignored, and where one value is expected the first is used.
 */
export function parseHistoryQuery(params: HistorySearchParams): HistoryQuery {
  const first = (key: string) => allValues(params, key)[0];
  const day = (key: string) => {
    const value = first(key) ?? "";
    return isCalendarDate(value) ? value : null;
  };

  const sermon = first(historyParams.sermonId) ?? "";
  const pageText = first(historyParams.page) ?? "";
  const sort = first(historyParams.sort) as HistorySort;

  const read = historyQuerySchema.safeParse({
    q: first(historyParams.q) ?? "",
    sermonId: uuid.test(sermon) ? sermon : null,
    from: day(historyParams.from),
    through: day(historyParams.through),
    venueIds: idList(allValues(params, historyParams.venueIds)),
    contextIds: idList(allValues(params, historyParams.contextIds)),
    formats: among(actualFormats, allValues(params, historyParams.formats)),
    timesOfDay: among(timeOfDayFilters, allValues(params, historyParams.timesOfDay)),
    sort: historySorts.includes(sort) ? sort : undefined,
    page: /^\d{1,7}$/.test(pageText) ? Math.min(Math.max(Number(pageText), 1), maxPage) : 1,
  });
  return read.success ? read.data : defaultHistoryQuery;
}

/** The query as URL parameters, in a fixed order, with every default left out. */
export function serializeHistoryQuery(query: HistoryQuery): URLSearchParams {
  const params = new URLSearchParams();
  const q = normaliseSearch(query.q);
  if (q) params.set(historyParams.q, q);
  if (query.sermonId) params.set(historyParams.sermonId, query.sermonId);
  if (query.from) params.set(historyParams.from, query.from);
  if (query.through) params.set(historyParams.through, query.through);
  for (const id of idList(query.venueIds)) params.append(historyParams.venueIds, id);
  for (const id of idList(query.contextIds)) params.append(historyParams.contextIds, id);
  for (const format of among(actualFormats, query.formats)) {
    params.append(historyParams.formats, format);
  }
  for (const time of among(timeOfDayFilters, query.timesOfDay)) {
    params.append(historyParams.timesOfDay, time);
  }
  if (query.sort !== defaultHistoryQuery.sort && historySorts.includes(query.sort)) {
    params.set(historyParams.sort, query.sort);
  }
  if (query.page > 1) params.set(historyParams.page, String(query.page));
  return params;
}

/** The section's address for a query. */
export function historyHref(query: HistoryQuery = defaultHistoryQuery): string {
  const search = serializeHistoryQuery(query).toString();
  return search ? `${routes.preachingRecord}?${search}` : routes.preachingRecord;
}

/** The address of one sermon's occasions, for the way there from the sermon. */
export function sermonHistoryHref(sermonId: string): string {
  return historyHref({ ...defaultHistoryQuery, sermonId });
}

/**
 * How many filters are in force: the sermon, the dates as one, and each venue,
 * context, format, and part of the day. The search is not a filter.
 */
export function historyFilterCount(query: HistoryQuery) {
  return (
    Number(query.sermonId !== null) +
    Number(query.from !== null || query.through !== null) +
    query.venueIds.length +
    query.contextIds.length +
    query.formats.length +
    query.timesOfDay.length
  );
}

/** True when the query narrows what is shown: a search or any filter. Order and page do not. */
export function isHistoryFiltered(query: HistoryQuery) {
  return searchTerms(query.q).length > 0 || historyFilterCount(query) > 0;
}

/** The same query with every filter lifted. The search and the order are kept; the page is 1. */
export function clearHistoryFilters(query: HistoryQuery): HistoryQuery {
  return { ...defaultHistoryQuery, q: query.q, sort: query.sort };
}
