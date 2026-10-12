import "server-only";

import { and, asc, between, count, eq, sql } from "drizzle-orm";

import { scriptureVerses } from "@/db/schema";
import type { Database } from "@/db/types";
import {
  accentFold,
  hitEnd,
  hitStart,
  scopeBooks,
  searchLimits,
  type SearchPage,
  type SearchScope,
} from "./search";
import type { TranslationId } from "./translations";

// Kept apart from passages.ts on purpose: that module holds the cached chapter
// read, and in development a route importing a module with a cached function
// was served a stale copy of it after an edit.

const headline = `StartSel=${hitStart}, StopSel=${hitEnd}, HighlightAll=true`;

/** The verse's text with accented vowels made plain: the expression the index is built on. */
const folded = sql`translate(${scriptureVerses.text}, ${sql.raw(`'${accentFold.from}', '${accentFold.to}'`)})`;

/**
 * Puts the marks the search made in the folded text onto the verse as it is
 * written. Folding swaps one letter for one letter, so apart from the marks
 * the two run letter for letter, and the accents come back.
 */
export function restoreHit(text: string, marked: string): string {
  let restored = "";
  let at = 0;
  for (let index = 0; index < marked.length;) {
    const mark = [hitStart, hitEnd].find((candidate) => marked.startsWith(candidate, index));
    if (mark) {
      restored += mark;
      index += mark.length;
    } else {
      restored += text[at++] ?? "";
      index += 1;
    }
  }
  // Anything out of step means the marks cannot be trusted: show the verse unmarked.
  return at === text.length ? restored : text;
}

/**
 * Verses of one translation matching a word search, in canonical order, a
 * page at a time. `tsquery` must come from `buildSearchQuery`, which admits
 * only letters, digits, and its own operators; it is still passed as a
 * parameter.
 */
export async function searchVerses(
  db: Database,
  translation: TranslationId,
  tsquery: string,
  scope: SearchScope,
  offset = 0,
  limit: number = searchLimits.pageSize,
): Promise<SearchPage> {
  const query = sql`to_tsquery('simple', ${tsquery})`;
  const [first, last] = scopeBooks(scope);
  // The same expression as the index, so the index is used.
  const matches = and(
    eq(scriptureVerses.translation, translation),
    sql`to_tsvector('simple', ${folded}) @@ ${query}`,
    between(scriptureVerses.book, first, last),
  );

  const [hits, [{ total }]] = await Promise.all([
    db
      .select({
        book: scriptureVerses.book,
        chapter: scriptureVerses.chapter,
        verse: scriptureVerses.verse,
        text: scriptureVerses.text,
        marked: sql<string>`ts_headline('simple', ${folded}, ${query}, ${headline})`,
      })
      .from(scriptureVerses)
      .where(matches)
      .orderBy(asc(scriptureVerses.book), asc(scriptureVerses.chapter), asc(scriptureVerses.verse))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(scriptureVerses).where(matches),
  ]);
  return {
    total,
    hits: hits.map(({ marked, text, ...place }) => ({ ...place, text: restoreHit(text, marked) })),
  };
}
