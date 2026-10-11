import { and, eq, inArray, or } from "drizzle-orm";

import { bibleHighlights } from "@/db/schema";
import type { Database } from "@/db/types";
import type { HighlightColor, TranslationId } from "./model";
import { normaliseVerses, type VerseRef } from "./verse-set";

type Reader = Pick<Database, "select">;

/*
 * As everywhere a person's own records are kept, every statement here has the
 * owner in its WHERE clause, and the owner comes from the caller's session.
 * The table's primary key begins with the owner, so one account's highlight
 * can never stand in for another's.
 *
 * A highlight is a verse and a color and nothing else. It is not attached to
 * a favorite and no favorite holds a copy of it.
 */

/** The verses, grouped by chapter, as one condition. */
function among(verses: readonly VerseRef[]) {
  const chapters = new Map<string, { book: number; chapter: number; verses: number[] }>();
  for (const { book, chapter, verse } of verses) {
    const key = `${book}.${chapter}`;
    const group = chapters.get(key) ?? { book, chapter, verses: [] };
    group.verses.push(verse);
    chapters.set(key, group);
  }
  return or(
    ...[...chapters.values()].map((group) =>
      and(
        eq(bibleHighlights.book, group.book),
        eq(bibleHighlights.chapter, group.chapter),
        inArray(bibleHighlights.verse, group.verses),
      ),
    ),
  );
}

/**
 * Gives every one of these verses the color, whatever it had before. It is
 * one statement, so the verses change together or not at all, and a verse
 * never holds two colors: the one it had is replaced.
 */
export async function setHighlights(
  db: Database,
  ownerId: string,
  translation: TranslationId,
  verses: readonly VerseRef[],
  color: HighlightColor,
): Promise<void> {
  const wanted = normaliseVerses(verses);
  if (wanted.length === 0) return;
  await db
    .insert(bibleHighlights)
    .values(wanted.map((verse) => ({ ...verse, ownerId, translation, color })))
    .onConflictDoUpdate({
      target: [
        bibleHighlights.ownerId,
        bibleHighlights.translation,
        bibleHighlights.book,
        bibleHighlights.chapter,
        bibleHighlights.verse,
      ],
      set: { color, updatedAt: new Date() },
    });
}

/** Takes the highlight off these verses. One that has none is left as it is. */
export async function clearHighlights(
  db: Database,
  ownerId: string,
  translation: TranslationId,
  verses: readonly VerseRef[],
): Promise<void> {
  const wanted = normaliseVerses(verses);
  if (wanted.length === 0) return;
  await db
    .delete(bibleHighlights)
    .where(
      and(
        eq(bibleHighlights.ownerId, ownerId),
        eq(bibleHighlights.translation, translation),
        among(wanted),
      ),
    );
}

/** The owner's highlights in one chapter: verse number to color. */
export async function highlightsInChapter(
  db: Reader,
  ownerId: string,
  translation: TranslationId,
  book: number,
  chapter: number,
): Promise<Record<number, HighlightColor>> {
  const rows = await db
    .select({ verse: bibleHighlights.verse, color: bibleHighlights.color })
    .from(bibleHighlights)
    .where(
      and(
        eq(bibleHighlights.ownerId, ownerId),
        eq(bibleHighlights.translation, translation),
        eq(bibleHighlights.book, book),
        eq(bibleHighlights.chapter, chapter),
      ),
    );
  return Object.fromEntries(rows.map((row) => [row.verse, row.color]));
}
