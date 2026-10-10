import "server-only";

import { and, asc, between, count, sql } from "drizzle-orm";

import { bibleVerses } from "@/db/schema";
import type { Database } from "@/db/types";
import {
  hitEnd,
  hitStart,
  scopeBooks,
  searchLimits,
  type SearchPage,
  type SearchScope,
} from "./search";

// Kept apart from passages.ts on purpose: that module holds the cached chapter
// read, and in development a route importing a module with a cached function
// was served a stale copy of it after an edit.

const headline = `StartSel=${hitStart}, StopSel=${hitEnd}, HighlightAll=true`;

/**
 * Verses matching a word search, in canonical order, a page at a time.
 * `tsquery` must come from `buildSearchQuery`, which admits only letters,
 * digits, and its own operators; it is still passed as a parameter.
 */
export async function searchVerses(
  db: Database,
  tsquery: string,
  scope: SearchScope,
  offset = 0,
  limit: number = searchLimits.pageSize,
): Promise<SearchPage> {
  const query = sql`to_tsquery('simple', ${tsquery})`;
  const [first, last] = scopeBooks(scope);
  // The same expression as the index, so the index is used.
  const matches = and(
    sql`to_tsvector('simple', ${bibleVerses.text}) @@ ${query}`,
    between(bibleVerses.book, first, last),
  );

  const [hits, [{ total }]] = await Promise.all([
    db
      .select({
        book: bibleVerses.book,
        chapter: bibleVerses.chapter,
        verse: bibleVerses.verse,
        text: sql<string>`ts_headline('simple', ${bibleVerses.text}, ${query}, ${headline})`,
      })
      .from(bibleVerses)
      .where(matches)
      .orderBy(asc(bibleVerses.book), asc(bibleVerses.chapter), asc(bibleVerses.verse))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(bibleVerses).where(matches),
  ]);
  return { total, hits };
}
