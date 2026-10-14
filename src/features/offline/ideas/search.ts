import type { IdeaWithReferences, LibraryPage } from "@/features/ideas/ideas";
import {
  searchTerms,
  startOfDay,
  startOfNextDay,
  type LibraryQuery,
} from "@/features/ideas/library-query";
import { libraryPageSize, needsAttentionAt, type LibrarySort } from "@/features/ideas/model";
import type { IdeaTag } from "@/features/ideas/tags";
import type { OfflineIdea } from "@/features/sync/ideas";

/*
 * The library's search, filters, order, and pages over the ideas kept on this
 * device (Phase 5D.1). It answers the same query (`LibraryQuery`, read from
 * the address by library-query.ts) with the same page shape as `searchIdeas`
 * (features/ideas/ideas.ts), and follows it condition by condition: change one
 * and change the other. Plain functions, no storage: the caller passes the
 * ideas.
 */

const date = (value: string | null) => (value ? new Date(value) : null);

/** A kept idea as the library's components take one; tags the account no longer has are left off. */
export function asLibraryIdea(
  idea: OfflineIdea,
  owner: string,
  tags: ReadonlyMap<string, IdeaTag>,
): IdeaWithReferences {
  return {
    id: idea.id,
    ownerId: owner,
    kind: idea.kind,
    title: idea.title,
    notes: idea.notes,
    status: idea.status,
    intendedFormat: idea.intendedFormat,
    sermonType: idea.sermonType,
    subject: idea.subject,
    revision: idea.revision,
    archivedAt: date(idea.archivedAt),
    lastDevelopedAt: date(idea.lastDevelopedAt),
    createdAt: new Date(idea.createdAt),
    updatedAt: new Date(idea.updatedAt),
    references: idea.references,
    tags: idea.tagIds.flatMap((id) => {
      const tag = tags.get(id);
      return tag ? [{ id: tag.id, name: tag.name }] : [];
    }),
  };
}

const contains = (text: string | null, term: string) =>
  text !== null && text.toLowerCase().includes(term.toLowerCase());

function matches(idea: IdeaWithReferences, query: LibraryQuery, now: Date) {
  // Every word, each in any field; a subject only on a sermon.
  for (const term of searchTerms(query.q)) {
    const found =
      contains(idea.title, term) ||
      contains(idea.notes, term) ||
      (idea.kind === "sermon" && contains(idea.subject, term));
    if (!found) return false;
  }
  if (query.kinds.length > 0 && !query.kinds.includes(idea.kind)) return false;
  if (query.statuses.length > 0 && !query.statuses.includes(idea.status)) return false;
  if (
    query.sermonTypes.length > 0 &&
    (idea.kind !== "sermon" || !query.sermonTypes.includes(idea.sermonType))
  ) {
    return false;
  }
  if (
    query.formats.length > 0 &&
    (idea.kind !== "sermon" || !query.formats.includes(idea.intendedFormat))
  ) {
    return false;
  }
  if (query.revisit === "never" && !(idea.kind === "sermon" && idea.lastDevelopedAt === null)) {
    return false;
  }
  if (query.revisit === "attention" && !needsAttentionAt(idea, now)) return false;
  if (query.archive === "active" && idea.archivedAt) return false;
  if (query.archive === "archived" && !idea.archivedAt) return false;

  const tagIds = [...new Set(query.tagIds)];
  if (tagIds.length > 0) {
    const held = new Set(idea.tags.map((tag) => tag.id));
    const carried = tagIds.filter((id) => held.has(id)).length;
    if (query.tagMode === "all" ? carried !== tagIds.length : carried === 0) return false;
  }

  const within = (value: Date, from: string | null, through: string | null) => {
    const start = from ? startOfDay(from) : null;
    const end = through ? startOfNextDay(through) : null;
    return (!start || value >= start) && (!end || value < end);
  };
  return (
    within(idea.createdAt, query.createdFrom, query.createdThrough) &&
    within(idea.updatedAt, query.updatedFrom, query.updatedThrough)
  );
}

const byId = (a: IdeaWithReferences, b: IdeaWithReferences) =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

const sortOrders: Record<LibrarySort, (a: IdeaWithReferences, b: IdeaWithReferences) => number> = {
  "updated-desc": (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime() || byId(b, a),
  "updated-asc": (a, b) => a.updatedAt.getTime() - b.updatedAt.getTime() || byId(a, b),
  "created-desc": (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || byId(b, a),
  "created-asc": (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || byId(a, b),
  "title-asc": (a, b) => byText(a.title.toLowerCase(), b.title.toLowerCase()) || byId(a, b),
  "title-desc": (a, b) => byText(b.title.toLowerCase(), a.title.toLowerCase()) || byId(b, a),
};

/** One page of the kept library, as `searchIdeas` would answer the same query. */
export function searchLocalIdeas(
  ideas: IdeaWithReferences[],
  query: LibraryQuery,
  now: Date = new Date(),
  pageSize: number = libraryPageSize,
): LibraryPage {
  const found = ideas
    .filter((idea) => matches(idea, query, now))
    .sort(sortOrders[query.sort] ?? sortOrders["updated-desc"]);
  const total = found.length;
  const totalPages = Math.ceil(total / pageSize);
  const page = Math.min(Math.max(Math.trunc(query.page) || 1, 1), Math.max(totalPages, 1));
  return {
    items: found.slice((page - 1) * pageSize, page * pageSize),
    total,
    page,
    pageSize,
    totalPages,
  };
}

/** How many kept ideas are archived, for "every idea is archived" as the library says it. */
export const archivedLocalCount = (ideas: IdeaWithReferences[]) =>
  ideas.filter((idea) => idea.archivedAt).length;
