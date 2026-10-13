/**
 * Finding one of the account's sermons by name, to record it as preached: the
 * request the picker makes and the answer it gets. There is no server code
 * here, so the route and the browser agree on both.
 *
 *   /api/preaching/sermons            the sermons changed most recently
 *   /api/preaching/sermons?q=grace    those with "grace" in them
 *
 * Unlike the idea picker (features/ideas/idea-search.ts), archived sermons are
 * offered: an archived sermon is still a sermon, and may have been preached.
 * Ideas that are not sermons are never offered.
 */
export const sermonSearchPath = "/api/preaching/sermons";

/** How many sermons one answer holds. The picker narrows by typing, not by paging. */
export const sermonSearchSize = 8;

/** A sermon as the picker shows it. */
export type SermonMatch = { id: string; title: string; archived: boolean };

export type SermonMatches = {
  items: SermonMatch[];
  /** Every sermon that matches, of which `items` is the first few. */
  total: number;
};

/** The address of one search. */
export function sermonSearchHref(q: string): string {
  const wanted = q.trim();
  return wanted ? `${sermonSearchPath}?${new URLSearchParams({ q: wanted })}` : sermonSearchPath;
}
