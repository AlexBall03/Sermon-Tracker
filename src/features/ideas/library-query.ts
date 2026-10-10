import { z } from "zod";

import { routes } from "@/lib/site";
import {
  ideaKinds,
  ideaStatuses,
  librarySorts,
  searchLimits,
  sermonTypes,
  tagFilterLimit,
  tagModes,
  type IdeaKind,
  type IdeaStatus,
  type LibrarySort,
  type SermonType,
  type TagMode,
} from "./model";

/**
 * What the library is asked for: a search, filters, an order, and a page. It
 * is carried in the URL, so it holds nothing about the account: the same link
 * opened by someone else shows their own ideas.
 *
 * A filter with several values matches an idea with any one of them, and an
 * empty one does not restrict at all. Different filters must all hold. Tags
 * are the exception: `tagMode` says whether one of them is enough or every
 * one is needed.
 *
 * Dates are calendar days written YYYY-MM-DD and read as UTC days, the zone
 * every date in the application is shown in. Both ends are inclusive.
 */
export type LibraryQuery = {
  q: string;
  kinds: IdeaKind[];
  statuses: IdeaStatus[];
  /** Matches sermon ideas only, whatever `kinds` says. */
  sermonTypes: SermonType[];
  tagIds: string[];
  /** `any`: an idea with one of the tags matches. `all`: it must have every one. */
  tagMode: TagMode;
  createdFrom: string | null;
  createdThrough: string | null;
  updatedFrom: string | null;
  updatedThrough: string | null;
  sort: LibrarySort;
  page: number;
};

export const defaultLibrarySort: LibrarySort = librarySorts[0];
export const defaultTagMode: TagMode = tagModes[0];

export const defaultLibraryQuery: LibraryQuery = {
  q: "",
  kinds: [],
  statuses: [],
  sermonTypes: [],
  tagIds: [],
  tagMode: defaultTagMode,
  createdFrom: null,
  createdThrough: null,
  updatedFrom: null,
  updatedThrough: null,
  sort: defaultLibrarySort,
  page: 1,
};

/** The names used in the URL. A filter with several values repeats its name. */
export const libraryParams = {
  q: "q",
  kinds: "kind",
  statuses: "status",
  sermonTypes: "type",
  tagIds: "tag",
  tagMode: "tag_mode",
  createdFrom: "created_from",
  createdThrough: "created_to",
  updatedFrom: "updated_from",
  updatedThrough: "updated_to",
  sort: "sort",
  page: "page",
} as const;

/** Next's `searchParams` object, or a `URLSearchParams`. */
export type LibrarySearchParams =
  URLSearchParams | Record<string, string | string[] | undefined> | null | undefined;

const uuid = z.uuid();
const maxPage = 1_000_000;

function allValues(params: LibrarySearchParams, key: string): string[] {
  if (!params) return [];
  if (params instanceof URLSearchParams) return params.getAll(key);
  // Only own keys: "constructor" in a URL must not find Object.prototype.
  if (!Object.hasOwn(params, key)) return [];
  const value = params[key];
  if (typeof value === "string") return [value];
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

/** Whitespace collapsed and the length capped. Still one string, for the URL and the search box. */
export function normaliseSearch(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, searchLimits.query).trim();
}

/** The words a search looks for: each one once, whatever its case, and only the first few. */
export function searchTerms(q: string): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const term of normaliseSearch(q).split(" ")) {
    const key = term.toLowerCase();
    if (!term || seen.has(key)) continue;
    seen.add(key);
    terms.push(term);
    if (terms.length === searchLimits.terms) break;
  }
  return terms;
}

/** The first instant of a YYYY-MM-DD day in UTC, or null if it is not a real date. */
export function startOfDay(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  // Date.UTC rolls 31 February into March; a date that moved was never real.
  const real =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return real && year >= 1 ? date : null;
}

/** The first instant of the day after, so "through" a day includes all of it. */
export function startOfNextDay(value: string): Date | null {
  const start = startOfDay(value);
  if (!start) return null;
  start.setUTCDate(start.getUTCDate() + 1);
  return start;
}

function oneOf<T extends string>(allowed: readonly T[], value: string | undefined): T | null {
  return allowed.includes(value as T) ? (value as T) : null;
}

/** The allowed values among those given: each once, in the order `allowed` lists them. */
function manyOf<T extends string>(allowed: readonly T[], values: readonly string[]): T[] {
  return allowed.filter((value) => values.includes(value));
}

function day(value: string | undefined) {
  return value !== undefined && startOfDay(value) ? value : null;
}

/** Tag IDs as the query holds them: valid, lower case, each once, sorted, and no more than the limit. */
function tagList(values: readonly string[]) {
  const ids: string[] = [];
  for (const value of values) {
    const id = value.toLowerCase();
    if (!uuid.safeParse(id).success || ids.includes(id)) continue;
    ids.push(id);
    if (ids.length === tagFilterLimit) break;
  }
  return ids.sort();
}

/**
 * Reads the library's query from URL parameters. It never throws: anything
 * missing, malformed, or out of range becomes its default, and parameters it
 * does not know are ignored. A filter may repeat its parameter; values that
 * are not recognised are dropped and the rest kept. Where a single value is
 * expected and several are given, the first is used.
 */
export function parseLibraryQuery(params: LibrarySearchParams): LibraryQuery {
  const first = (key: string) => allValues(params, key)[0];

  const pageText = first(libraryParams.page) ?? "";
  const page = /^\d{1,7}$/.test(pageText) ? Math.min(Math.max(Number(pageText), 1), maxPage) : 1;

  return {
    q: normaliseSearch(first(libraryParams.q) ?? ""),
    kinds: manyOf(ideaKinds, allValues(params, libraryParams.kinds)),
    statuses: manyOf(ideaStatuses, allValues(params, libraryParams.statuses)),
    sermonTypes: manyOf(sermonTypes, allValues(params, libraryParams.sermonTypes)),
    tagIds: tagList(allValues(params, libraryParams.tagIds)),
    tagMode: oneOf(tagModes, first(libraryParams.tagMode)) ?? defaultTagMode,
    createdFrom: day(first(libraryParams.createdFrom)),
    createdThrough: day(first(libraryParams.createdThrough)),
    updatedFrom: day(first(libraryParams.updatedFrom)),
    updatedThrough: day(first(libraryParams.updatedThrough)),
    sort: oneOf(librarySorts, first(libraryParams.sort)) ?? defaultLibrarySort,
    page,
  };
}

/**
 * The query as URL parameters, in a fixed order, with every default left out.
 * Values within a filter are written in one order whatever order they were
 * chosen in, so one query has one address.
 */
export function serializeLibraryQuery(query: LibraryQuery): URLSearchParams {
  const params = new URLSearchParams();
  const set = (key: string, value: string | null) => {
    if (value) params.set(key, value);
  };
  const each = (key: string, values: readonly string[]) => {
    for (const value of values) params.append(key, value);
  };
  const tagIds = tagList(query.tagIds);

  set(libraryParams.q, normaliseSearch(query.q));
  each(libraryParams.kinds, manyOf(ideaKinds, query.kinds));
  each(libraryParams.statuses, manyOf(ideaStatuses, query.statuses));
  each(libraryParams.sermonTypes, manyOf(sermonTypes, query.sermonTypes));
  each(libraryParams.tagIds, tagIds);
  // The mode means nothing without a tag to apply it to.
  if (query.tagMode !== defaultTagMode && tagIds.length > 0) {
    params.set(libraryParams.tagMode, query.tagMode);
  }
  set(libraryParams.createdFrom, query.createdFrom);
  set(libraryParams.createdThrough, query.createdThrough);
  set(libraryParams.updatedFrom, query.updatedFrom);
  set(libraryParams.updatedThrough, query.updatedThrough);
  if (query.sort !== defaultLibrarySort) params.set(libraryParams.sort, query.sort);
  if (query.page > 1) params.set(libraryParams.page, String(query.page));
  return params;
}

/** The library's address for a query. Changing a filter should also reset `page` to 1. */
export function libraryHref(query: LibraryQuery): string {
  const search = serializeLibraryQuery(query).toString();
  return search ? `${routes.library}?${search}` : routes.library;
}

/**
 * How many filters are in force, counting each chosen value once and each
 * date range once. The search is not a filter: it has its own box.
 */
export function activeFilterCount(query: LibraryQuery) {
  return (
    query.kinds.length +
    query.statuses.length +
    query.sermonTypes.length +
    query.tagIds.length +
    Number(Boolean(query.createdFrom || query.createdThrough)) +
    Number(Boolean(query.updatedFrom || query.updatedThrough))
  );
}

/** True when the query narrows the library: a search or any filter. Order and page do not. */
export function isFiltered(query: LibraryQuery) {
  return searchTerms(query.q).length > 0 || activeFilterCount(query) > 0;
}

/** The same query with every filter lifted. The search and the order are kept; the page is 1. */
export function clearFilters(query: LibraryQuery): LibraryQuery {
  return { ...defaultLibraryQuery, q: query.q, sort: query.sort };
}

/** The list with the value taken out if it was there, and put in if it was not. */
export function toggled<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

/** True for a range that ends before it starts, which no idea can fall in. */
export function invertedRange(from: string | null, through: string | null) {
  return Boolean(from && through && from > through);
}

/**
 * The address of one idea, remembering the library it was opened from so the
 * way back returns to the same search, filters, order, and page.
 */
export function ideaHref(id: string, from?: LibraryQuery): string {
  const search = from ? serializeLibraryQuery(from).toString() : "";
  const path = `${routes.library}/${id}`;
  return search ? `${path}?${new URLSearchParams({ from: search })}` : path;
}

/**
 * The library address an idea page should lead back to. Whatever `from`
 * holds, it is read as a library query and written out again, so the result
 * is always a library address and can never lead anywhere else.
 */
export function libraryReturnHref(from: string | string[] | undefined): string {
  const text = typeof from === "string" ? from.slice(0, 4000) : "";
  return libraryHref(parseLibraryQuery(new URLSearchParams(text)));
}
