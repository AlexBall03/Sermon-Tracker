import { searchTerms } from "@/features/ideas/library-query";
import { outlinePageSize, type OutlineSort } from "@/features/outlines/model";
import type { OutlinePage, OutlineSummary } from "@/features/outlines/outlines";
import type { OutlinesQuery } from "@/features/outlines/outlines-query";
import type { OfflineOutline } from "@/features/sync/outlines";

/*
 * The overview of outlines answered from the device's copy (Phase 5D.2), as
 * `listOutlines` answers it from the database: the outlines of sermons that
 * are filed as sermons and not archived, every word of `q` in the sermon's
 * title, in the same orders, a page at a time. Keep the two alike; the
 * parity test holds them to the same answers.
 *
 * As for ideas (search.ts there), text is compared in lowercase by
 * JavaScript, which can differ from PostgreSQL's collation for some
 * non-ASCII titles.
 */

/** A kept outline as the overview's cards show one. */
export function asOutlineSummary(outline: OfflineOutline): OutlineSummary {
  return {
    id: outline.id,
    sermonId: outline.sermonId,
    numbering: outline.numbering,
    revision: outline.revision,
    createdAt: new Date(outline.createdAt),
    updatedAt: new Date(outline.updatedAt),
    sermon: {
      id: outline.sermon.id,
      title: outline.sermon.title,
      kind: outline.sermon.kind,
      status: outline.sermon.status,
      archivedAt: outline.sermon.archivedAt ? new Date(outline.sermon.archivedAt) : null,
    },
    entryCount: outline.entries.length,
  };
}

const byId = (a: OutlineSummary, b: OutlineSummary) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const time = (date: Date) => date.getTime();

const orders: Record<OutlineSort, (a: OutlineSummary, b: OutlineSummary) => number> = {
  "updated-desc": (a, b) => time(b.updatedAt) - time(a.updatedAt) || byId(b, a),
  "updated-asc": (a, b) => time(a.updatedAt) - time(b.updatedAt) || byId(a, b),
  "title-asc": (a, b) =>
    byText(a.sermon.title.toLowerCase(), b.sermon.title.toLowerCase()) || byId(a, b),
  "title-desc": (a, b) =>
    byText(b.sermon.title.toLowerCase(), a.sermon.title.toLowerCase()) || byId(b, a),
  "created-desc": (a, b) => time(b.createdAt) - time(a.createdAt) || byId(b, a),
};

export function searchLocalOutlines(
  outlines: readonly OfflineOutline[],
  query: OutlinesQuery,
  pageSize = outlinePageSize,
): OutlinePage {
  const terms = searchTerms(query.q).map((term) => term.toLowerCase());
  const matching = outlines
    .filter(
      (outline) =>
        outline.sermon.kind === "sermon" &&
        !outline.sermon.archivedAt &&
        terms.every((term) => outline.sermon.title.toLowerCase().includes(term)),
    )
    .map(asOutlineSummary)
    .sort(orders[query.sort] ?? orders["updated-desc"]);
  const total = matching.length;
  const totalPages = Math.ceil(total / pageSize);
  const page = Math.min(Math.max(Math.trunc(query.page) || 1, 1), Math.max(totalPages, 1));
  return {
    items: matching.slice((page - 1) * pageSize, page * pageSize),
    total,
    page,
    pageSize,
    totalPages,
  };
}
