import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { cacheLife } from "next/cache";

import { getDb } from "@/db";
import { scripturePsalmTitles, scriptureVerses } from "@/db/schema";
import type { Database } from "@/db/types";
import { psalmsBook, versesIn } from "./books";
import type { TranslationId } from "./translations";

/*
 * Nothing here decides who may read which translation: these read whatever
 * they are asked for. The callers ask features/preferences first, which is
 * where an administrator's switch is applied.
 */

/** The verses of one chapter in one translation, in order: index 0 is verse 1. */
export async function readChapter(
  db: Database,
  translation: TranslationId,
  book: number,
  chapter: number,
): Promise<string[]> {
  const rows = await db
    .select({ text: scriptureVerses.text })
    .from(scriptureVerses)
    .where(
      and(
        eq(scriptureVerses.translation, translation),
        eq(scriptureVerses.book, book),
        eq(scriptureVerses.chapter, chapter),
      ),
    )
    .orderBy(asc(scriptureVerses.verse));
  // An unloaded or half-loaded Bible must be an error, never a short chapter.
  if (rows.length === 0 || rows.length !== versesIn(book, chapter)) {
    throw new Error(
      `Bible text is unavailable for ${translation}, book ${book}, chapter ${chapter}.`,
    );
  }
  return rows.map((row) => row.text);
}

/**
 * A chapter of the Bible in one translation. The text is the same for
 * everyone and never changes, so this is the one cached read in the
 * application; nothing about the caller is involved. A failure throws and is
 * not cached.
 */
export async function getChapter(
  translation: TranslationId,
  book: number,
  chapter: number,
): Promise<string[]> {
  "use cache";
  cacheLife("max");
  return readChapter(getDb(), translation, book, chapter);
}

/** Every psalm title of one translation, by psalm number. A psalm without one is absent. */
export async function readPsalmTitles(
  db: Database,
  translation: TranslationId,
): Promise<Record<number, string>> {
  const rows = await db
    .select({ psalm: scripturePsalmTitles.psalm, text: scripturePsalmTitles.text })
    .from(scripturePsalmTitles)
    .where(eq(scripturePsalmTitles.translation, translation));
  // An unloaded table must be an error, never "no psalm has a title".
  if (rows.length === 0) throw new Error(`The psalm titles are unavailable for ${translation}.`);
  return Object.fromEntries(rows.map((row) => [row.psalm, row.text]));
}

/**
 * The titles of the Psalms in one translation, all of them: there are few,
 * and they change as little as the text does. Cached as `getChapter` is; a
 * failure throws and is not cached.
 */
export async function getPsalmTitles(translation: TranslationId): Promise<Record<number, string>> {
  "use cache";
  cacheLife("max");
  return readPsalmTitles(getDb(), translation);
}

/**
 * The title printed above verse 1 of a chapter, or null when it has none. Only
 * psalms have them, and they are no part of any verse.
 */
export async function getChapterTitle(
  translation: TranslationId,
  book: number,
  chapter: number,
): Promise<string | null> {
  if (book !== psalmsBook) return null;
  return (await getPsalmTitles(translation))[chapter] ?? null;
}
