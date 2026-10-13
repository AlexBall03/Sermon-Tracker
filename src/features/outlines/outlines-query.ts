import { normaliseSearch, searchTerms } from "@/features/ideas/library-query";
import { routes } from "@/lib/site";
import { outlineSorts, type OutlineSort } from "./model";

/**
 * What the overview of outlines is asked for, as its address carries it. Like
 * the library's queries (features/ideas/library-query.ts) it holds nothing
 * about the account and is read leniently: a link opened by someone else shows
 * their own outlines, and a bad value falls back instead of failing.
 *
 *   /outlines                          every outline, most recently worked on first
 *   /outlines?q=grace                  those whose sermon has "grace" in its title
 *   /outlines?sort=title-asc&page=2    by title, the second page
 *
 * There is no archive view and no status filter here: an outline has no status
 * of its own, and the overview lists the outlines of active sermons only.
 */
export type OutlinesQuery = {
  /** Search text, matched against the sermon's title. */
  q: string;
  sort: OutlineSort;
  page: number;
};

export const defaultOutlinesQuery: OutlinesQuery = { q: "", sort: outlineSorts[0], page: 1 };

/** The names used in the URL. */
export const outlinesParams = { q: "q", sort: "sort", page: "page" } as const;

export type OutlinesSearchParams =
  URLSearchParams | Record<string, string | string[] | undefined> | null | undefined;

const maxPage = 1_000_000;

function first(params: OutlinesSearchParams, key: string): string | undefined {
  if (!params) return undefined;
  if (params instanceof URLSearchParams) return params.get(key) ?? undefined;
  // Only own keys: "constructor" in a URL must not find Object.prototype.
  if (!Object.hasOwn(params, key)) return undefined;
  const value = params[key];
  if (typeof value === "string") return value;
  return Array.isArray(value) ? value.find((item) => typeof item === "string") : undefined;
}

/**
 * Reads the query from URL parameters. It never throws: anything missing,
 * malformed, or out of range becomes its default, unknown parameters are
 * ignored, and of a repeated parameter the first is used.
 */
export function parseOutlinesQuery(params: OutlinesSearchParams): OutlinesQuery {
  const sort = first(params, outlinesParams.sort) as OutlineSort;
  const page = first(params, outlinesParams.page) ?? "";
  return {
    q: normaliseSearch(first(params, outlinesParams.q) ?? ""),
    sort: outlineSorts.includes(sort) ? sort : defaultOutlinesQuery.sort,
    page: /^\d{1,7}$/.test(page) ? Math.min(Math.max(Number(page), 1), maxPage) : 1,
  };
}

/** The query as URL parameters, in a fixed order, with every default left out. */
export function serializeOutlinesQuery(query: OutlinesQuery): URLSearchParams {
  const params = new URLSearchParams();
  const q = normaliseSearch(query.q);
  if (q) params.set(outlinesParams.q, q);
  if (query.sort !== defaultOutlinesQuery.sort && outlineSorts.includes(query.sort)) {
    params.set(outlinesParams.sort, query.sort);
  }
  if (query.page > 1) params.set(outlinesParams.page, String(query.page));
  return params;
}

/** The overview's address for a query. */
export function outlinesHref(query: OutlinesQuery = defaultOutlinesQuery): string {
  const search = serializeOutlinesQuery(query).toString();
  return search ? `${routes.outlines}?${search}` : routes.outlines;
}

/** True when the query narrows what is shown. Order and page do not. */
export function isOutlinesSearch(query: OutlinesQuery) {
  return searchTerms(query.q).length > 0;
}

/** An outline's editor. */
export function outlineHref(id: string) {
  return `${routes.outlines}/${id}`;
}

/** Where a sermon is given an outline, or sent on to the one it has. Opening it makes nothing. */
export function newOutlineHref(sermonId: string) {
  return `${routes.outlines}/new?sermon=${sermonId}`;
}
