import { libraryParams } from "./library-query";
import type { IdeaKind, IdeaStatus } from "./model";
import type { IdeaReference } from "./schemas";

/**
 * Finding one of the account's ideas by name, to put something on it: the
 * request the picker makes and the answer it gets. There is no server code
 * here, so the route and the browser agree on both.
 *
 *   /api/ideas/search                      the ideas changed most recently
 *   /api/ideas/search?q=grace              those with "grace" in them
 *   /api/ideas/search?q=grace&kind=point   the point ideas among them
 *
 * `q` and `kind` mean what they mean in the library's address and are read by
 * the same parser. Nothing else in the address is used, so the answer is the
 * library's default: archived ideas are never offered.
 */
export const ideaSearchPath = "/api/ideas/search";

/** How many ideas one answer holds. The picker narrows by typing, not by paging. */
export const ideaSearchSize = 8;

/** An idea as the picker shows it: enough to tell it from its neighbours, and no more. */
export type IdeaMatch = {
  id: string;
  title: string;
  kind: IdeaKind;
  status: IdeaStatus;
  /** A sermon's subject; null on anything else, even where the record kept one. */
  subject: string | null;
  /** The passages it has, so one it already holds can be said to be there. */
  references: IdeaReference[];
};

export type IdeaMatches = {
  items: IdeaMatch[];
  /** Every idea that matches, of which `items` is the first few. */
  total: number;
};

/** The address of one search. */
export function ideaSearchHref(q: string, kind: IdeaKind | null): string {
  const params = new URLSearchParams();
  if (q.trim()) params.set(libraryParams.q, q.trim());
  if (kind) params.set(libraryParams.kinds, kind);
  const query = params.toString();
  return query ? `${ideaSearchPath}?${query}` : ideaSearchPath;
}
