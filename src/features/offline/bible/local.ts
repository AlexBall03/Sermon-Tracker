import type { TranslationId } from "@/features/scripture/translations";
import { openOfflineDb } from "../db";

/**
 * A chapter of a translation kept whole on this device, or null: not kept,
 * only partly downloaded, or storage unavailable. Only the verified edition is
 * ever read (download.ts); a download in progress never is.
 */
export async function readLocalChapter(
  translation: TranslationId,
  book: number,
  chapter: number,
): Promise<{ verses: string[]; title: string | null } | null> {
  try {
    const db = await openOfflineDb();
    const record = await db.get("bibleDatasets", translation);
    if (!record?.activeVersion) return null;
    const stored = await db.get("bibleChapters", [
      translation,
      record.activeVersion,
      book,
      chapter,
    ]);
    return stored ? { verses: stored.verses, title: stored.title } : null;
  } catch {
    return null;
  }
}

/** The translations this device can read without a connection. */
export async function localTranslations(): Promise<TranslationId[]> {
  try {
    const db = await openOfflineDb();
    const records = await db.getAll("bibleDatasets");
    return records.filter((record) => record.activeVersion).map((record) => record.translation);
  } catch {
    return [];
  }
}
