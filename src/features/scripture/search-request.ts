"use client";

import type { SearchPage, SearchScope } from "./search";

/** Thrown with a message that is safe to show. */
export class SearchError extends Error {}

/** One page of verses matching a word search. */
export async function requestSearch(
  query: string,
  scope: SearchScope,
  offset = 0,
): Promise<SearchPage> {
  const params = new URLSearchParams({ q: query, in: String(scope), offset: String(offset) });
  const response = await fetch(`/api/bible/search?${params}`, {
    headers: { Accept: "application/json" },
  }).catch(() => null);
  const body = (await response?.json().catch(() => null)) as
    (SearchPage & { message?: string }) | null;
  if (!response?.ok || !body) {
    throw new SearchError(body?.message ?? "The search could not be run. Try again.");
  }
  return body;
}
