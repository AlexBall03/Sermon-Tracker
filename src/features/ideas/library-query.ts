import { z } from "zod";

import { routes } from "@/lib/site";
import {
  ideaKinds,
  ideaStatuses,
  librarySorts,
  searchLimits,
  sermonTypes,
  tagFilterLimit,
  type IdeaKind,
  type IdeaStatus,
  type LibrarySort,
  type SermonType,
} from "./model";

/**
 * What the library is asked for: a search, filters, an order, and a page. It
 * is carried in the URL, so it holds nothing about the account: the same link
 * opened by someone else shows their own ideas.
 *
 * Dates are calendar days written YYYY-MM-DD and read as UTC days, the zone
 * every date in the application is shown in. Both ends are inclusive.
 */
export type LibraryQuery = {
  q: string;
  kind: IdeaKind | null;
  status: IdeaStatus | null;
  /** Matches sermon ideas only, whatever `kind` says. */
  sermonType: SermonType | null;
  /** An idea matches when it has any one of these. */
  tagIds: string[];
  createdFrom: string | null;
  createdThrough: string | null;
  updatedFrom: string | null;
  updatedThrough: string | null;
  sort: LibrarySort;
  page: number;
};

export const defaultLibrarySort: LibrarySort = librarySorts[0];

export const defaultLibraryQuery: LibraryQuery = {
  q: "",
  kind: null,
  status: null,
  sermonType: null,
  tagIds: [],
  createdFrom: null,
  createdThrough: null,
  updatedFrom: null,
  updatedThrough: null,
  sort: defaultLibrarySort,
  page: 1,
};

/** The names used in the URL. */
export const libraryParams = {
  q: "q",
  kind: "kind",
  status: "status",
  sermonType: "type",
  tagIds: "tag",
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

function day(value: string | undefined) {
  return value !== undefined && startOfDay(value) ? value : null;
}

/**
 * Reads the library's query from URL parameters. It never throws: anything
 * missing, malformed, or out of range becomes its default, and parameters it
 * does not know are ignored. Where a single value is expected and several are
 * given, the first is used.
 */
export function parseLibraryQuery(params: LibrarySearchParams): LibraryQuery {
  const first = (key: string) => allValues(params, key)[0];

  const tagIds: string[] = [];
  for (const value of allValues(params, libraryParams.tagIds)) {
    const id = value.toLowerCase();
    if (!uuid.safeParse(id).success || tagIds.includes(id)) continue;
    tagIds.push(id);
    if (tagIds.length === tagFilterLimit) break;
  }

  const pageText = first(libraryParams.page) ?? "";
  const page = /^\d{1,7}$/.test(pageText) ? Math.min(Math.max(Number(pageText), 1), maxPage) : 1;

  return {
    q: normaliseSearch(first(libraryParams.q) ?? ""),
    kind: oneOf(ideaKinds, first(libraryParams.kind)),
    status: oneOf(ideaStatuses, first(libraryParams.status)),
    sermonType: oneOf(sermonTypes, first(libraryParams.sermonType)),
    tagIds,
    createdFrom: day(first(libraryParams.createdFrom)),
    createdThrough: day(first(libraryParams.createdThrough)),
    updatedFrom: day(first(libraryParams.updatedFrom)),
    updatedThrough: day(first(libraryParams.updatedThrough)),
    sort: oneOf(librarySorts, first(libraryParams.sort)) ?? defaultLibrarySort,
    page,
  };
}

/** The query as URL parameters, in a fixed order, with every default left out. */
export function serializeLibraryQuery(query: LibraryQuery): URLSearchParams {
  const params = new URLSearchParams();
  const set = (key: string, value: string | null) => {
    if (value) params.set(key, value);
  };
  set(libraryParams.q, normaliseSearch(query.q));
  set(libraryParams.kind, query.kind);
  set(libraryParams.status, query.status);
  set(libraryParams.sermonType, query.sermonType);
  for (const id of query.tagIds) params.append(libraryParams.tagIds, id);
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

/** True when the query narrows the library: a search or any filter. Order and page do not. */
export function isFiltered(query: LibraryQuery) {
  return Boolean(
    searchTerms(query.q).length ||
    query.kind ||
    query.status ||
    query.sermonType ||
    query.tagIds.length ||
    query.createdFrom ||
    query.createdThrough ||
    query.updatedFrom ||
    query.updatedThrough,
  );
}
