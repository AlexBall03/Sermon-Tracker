import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { cacheLife } from "next/cache";

import { getDb } from "@/db";
import { biblePsalmTitles, bibleVerses } from "@/db/schema";
import type { Database } from "@/db/types";
import { psalmsBook, versesIn } from "./books";

/** The verses of one chapter, in order: index 0 is verse 1. */
export async function readChapter(db: Database, book: number, chapter: number): Promise<string[]> {
  const rows = await db
    .select({ text: bibleVerses.text })
    .from(bibleVerses)
    .where(and(eq(bibleVerses.book, book), eq(bibleVerses.chapter, chapter)))
    .orderBy(asc(bibleVerses.verse));
  // An unloaded or half-loaded Bible must be an error, never a short chapter.
  if (rows.length === 0 || rows.length !== versesIn(book, chapter)) {
    throw new Error(`Bible text is unavailable for book ${book}, chapter ${chapter}.`);
  }
  return rows.map((row) => row.text);
}

/**
 * A chapter of the King James Bible. The text is the same for everyone and
 * never changes, so this is the one cached read in the application; nothing
 * about the caller is involved. A failure throws and is not cached.
 */
export async function getChapter(book: number, chapter: number): Promise<string[]> {
  "use cache";
  cacheLife("max");
  return readChapter(getDb(), book, chapter);
}

/** Every psalm title, by psalm number. A psalm without one is absent. */
export async function readPsalmTitles(db: Database): Promise<Record<number, string>> {
  const rows = await db
    .select({ psalm: biblePsalmTitles.psalm, text: biblePsalmTitles.text })
    .from(biblePsalmTitles);
  // An unloaded table must be an error, never "no psalm has a title".
  if (rows.length === 0) throw new Error("The psalm titles are unavailable.");
  return Object.fromEntries(rows.map((row) => [row.psalm, row.text]));
}

/**
 * The titles of the Psalms, all of them: there are few, and they change as
 * little as the text does. Cached as `getChapter` is; a failure throws and is
 * not cached.
 */
export async function getPsalmTitles(): Promise<Record<number, string>> {
  "use cache";
  cacheLife("max");
  return readPsalmTitles(getDb());
}

/**
 * The title printed above verse 1 of a chapter, or null when it has none. Only
 * psalms have them, and they are no part of any verse.
 */
export async function getChapterTitle(book: number, chapter: number): Promise<string | null> {
  if (book !== psalmsBook) return null;
  return (await getPsalmTitles())[chapter] ?? null;
}
