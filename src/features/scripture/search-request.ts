"use client";

import { translationParam } from "./reader-location";
import type { SearchPage, SearchScope } from "./search";
import type { TranslationId } from "./translations";

/** Thrown with a message that is safe to show. */
export class SearchError extends Error {}

/** One page of verses of one translation matching a word search. */
export async function requestSearch(
  query: string,
  scope: SearchScope,
  offset = 0,
  translation?: TranslationId,
  /** What to say when the server gives no reason, in the interface's language. */
  failed = "The search could not be run. Try again.",
): Promise<SearchPage> {
  const params = new URLSearchParams({ q: query, in: String(scope), offset: String(offset) });
  if (translation) params.set(translationParam, translation);
  const response = await fetch(`/api/bible/search?${params}`, {
    headers: { Accept: "application/json" },
  }).catch(() => null);
  const body = (await response?.json().catch(() => null)) as
    (SearchPage & { message?: string }) | null;
  if (!response?.ok || !body) {
    throw new SearchError(body?.message ?? failed);
  }
  return body;
}
