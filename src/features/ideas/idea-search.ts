import { libraryParams } from "./library-query";
import type { ArchiveView, IdeaKind, IdeaStatus } from "./model";
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
 *   /api/ideas/search?kind=sermon&archived=all   the sermon ideas, archived ones too
 *   /api/ideas/search?kind=sermon&outline=1      the sermon ideas, each with its outline's ID
 *
 * `q`, `kind`, and `archived` mean what they mean in the library's address and
 * are read by the same parser. Nothing else in the address is used, so without
 * `archived` the answer is the library's default: archived ideas are not
 * offered. Only the related-ideas picker asks for them. `outline=1` is asked
 * by the picker that gives a sermon its outline, and by nothing else.
 */
export const ideaSearchPath = "/api/ideas/search";

/** The parameter that asks for each sermon's outline. */
export const ideaSearchOutlineParam = "outline";

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
  /** True for an archived idea, which is only ever among the matches when they were asked for. */
  archived: boolean;
  /**
   * The sermon's outline, or null when it has none. Only present when the
   * search asked for it.
   */
  outlineId?: string | null;
};

export type IdeaMatches = {
  items: IdeaMatch[];
  /** Every idea that matches, of which `items` is the first few. */
  total: number;
};

/**
 * The address of one search. `archive` is given only by the related-ideas
 * picker, which offers archived ideas too; left out, they are never offered.
 */
export function ideaSearchHref(
  q: string,
  kind: IdeaKind | null,
  archive?: ArchiveView,
  /** Also say which of the ideas has an outline. */
  outlines = false,
): string {
  const params = new URLSearchParams();
  if (q.trim()) params.set(libraryParams.q, q.trim());
  if (kind) params.set(libraryParams.kinds, kind);
  if (archive) params.set(libraryParams.archive, archive);
  if (outlines) params.set(ideaSearchOutlineParam, "1");
  const query = params.toString();
  return query ? `${ideaSearchPath}?${query}` : ideaSearchPath;
}
