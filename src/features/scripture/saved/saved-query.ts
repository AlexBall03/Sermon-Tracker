import { normaliseSearch, searchTerms } from "@/features/ideas/library-query";
import { routes } from "@/lib/site";
import { chaptersIn } from "../books";
import { isTranslationId, type TranslationId } from "../translations";
import { highlightColors, savedSorts, type HighlightColor, type SavedSort } from "./model";

/**
 * What the library's Saved Scripture section is asked for: a search, a book,
 * a translation, highlight colors, an order, and a page. Like the ideas' query
 * (features/ideas/library-query.ts) it is carried in the URL, holds nothing
 * about the account, and is read leniently: a link opened by someone else
 * shows their own passages, and a bad value falls back instead of failing.
 *
 *   /library/scripture                          every saved passage, newest first
 *   /library/scripture?q=grace&book=45          "grace" in Romans
 *   /library/scripture?color=yellow&sort=bible  with a yellow verse, in the Bible's order
 *   /library/scripture?translation=rvg          saved from the Reina-Valera Gómez
 */
export type SavedQuery = {
  q: string;
  /** A book, 1 to 66: passages with a verse in it. Null is every book. */
  book: number | null;
  /** Passages saved from this translation. Null is every translation on offer. */
  translation: TranslationId | null;
  /** Passages with a verse highlighted in any of these. Empty asks nothing. */
  colors: HighlightColor[];
  sort: SavedSort;
  page: number;
};

export const defaultSavedSort: SavedSort = savedSorts[0];

export const defaultSavedQuery: SavedQuery = {
  q: "",
  book: null,
  translation: null,
  colors: [],
  sort: defaultSavedSort,
  page: 1,
};

/** The names used in the URL. `color` repeats for several. */
export const savedParams = {
  q: "q",
  book: "book",
  translation: "translation",
  colors: "color",
  sort: "sort",
  page: "page",
} as const;

export type SavedSearchParams =
  URLSearchParams | Record<string, string | string[] | undefined> | null | undefined;

const maxPage = 1_000_000;

function allValues(params: SavedSearchParams, key: string): string[] {
  if (!params) return [];
  if (params instanceof URLSearchParams) return params.getAll(key);
  // Only own keys: "constructor" in a URL must not find Object.prototype.
  if (!Object.hasOwn(params, key)) return [];
  const value = params[key];
  if (typeof value === "string") return [value];
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

/** The colors among those given: each once, in the order the model lists them. */
function colorList(values: readonly string[]): HighlightColor[] {
  return highlightColors.filter((color) => values.includes(color));
}

/**
 * Reads the query from URL parameters. It never throws: anything missing,
 * malformed, or out of range becomes its default, unknown parameters are
 * ignored, and where one value is expected the first is used.
 */
export function parseSavedQuery(params: SavedSearchParams): SavedQuery {
  const first = (key: string) => allValues(params, key)[0];

  const bookText = first(savedParams.book) ?? "";
  const book =
    /^[1-9]\d?$/.test(bookText) && chaptersIn(Number(bookText)) > 0 ? Number(bookText) : null;
  const pageText = first(savedParams.page) ?? "";
  const page = /^\d{1,7}$/.test(pageText) ? Math.min(Math.max(Number(pageText), 1), maxPage) : 1;
  const sort = first(savedParams.sort) as SavedSort;
  const translation = first(savedParams.translation);

  return {
    q: normaliseSearch(first(savedParams.q) ?? ""),
    book,
    translation: isTranslationId(translation) ? translation : null,
    colors: colorList(allValues(params, savedParams.colors)),
    sort: savedSorts.includes(sort) ? sort : defaultSavedSort,
    page,
  };
}

/** The query as URL parameters, in a fixed order, with every default left out. */
export function serializeSavedQuery(query: SavedQuery): URLSearchParams {
  const params = new URLSearchParams();
  const q = normaliseSearch(query.q);
  if (q) params.set(savedParams.q, q);
  if (query.book !== null && chaptersIn(query.book) > 0) {
    params.set(savedParams.book, String(query.book));
  }
  if (isTranslationId(query.translation)) params.set(savedParams.translation, query.translation);
  for (const color of colorList(query.colors)) params.append(savedParams.colors, color);
  if (query.sort !== defaultSavedSort && savedSorts.includes(query.sort)) {
    params.set(savedParams.sort, query.sort);
  }
  if (query.page > 1) params.set(savedParams.page, String(query.page));
  return params;
}

/** The section's address for a query. */
export function savedHref(query: SavedQuery = defaultSavedQuery): string {
  const search = serializeSavedQuery(query).toString();
  return search ? `${routes.savedScripture}?${search}` : routes.savedScripture;
}

/** How many filters are in force: the book, the translation, and each color. The search is not a filter. */
export function savedFilterCount(query: SavedQuery) {
  return Number(query.book !== null) + Number(query.translation !== null) + query.colors.length;
}

/** True when the query narrows what is shown: a search or any filter. Order and page do not. */
export function isSavedFiltered(query: SavedQuery) {
  return searchTerms(query.q).length > 0 || savedFilterCount(query) > 0;
}

/** The same query with every filter lifted. The search and the order are kept; the page is 1. */
export function clearSavedFilters(query: SavedQuery): SavedQuery {
  return { ...defaultSavedQuery, q: query.q, sort: query.sort };
}
