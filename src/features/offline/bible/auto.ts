import type { TranslationId } from "@/features/scripture/translations";
import { openOfflineDb } from "../db";
import { readOfflineSettings } from "../settings";
import { requestPersistence } from "../storage";
import { downloadTranslation, isCurrent, type DownloadOutcome } from "./download";
import { committedEditions, editionVersion } from "./package";

/** Automatic tries of one edition before it waits to be asked (Settings' "Try again"). */
export const maxAutoAttempts = 3;

export type AutoOutcome = "off" | "save-data" | "current" | "waiting" | DownloadOutcome;

/**
 * Keeps the reading translation on this device without being asked, quietly:
 * not when this device's settings say not to, not on a connection that asks
 * to save data, not again once it is current, and not more than a few times
 * for the same edition when it keeps failing. A failure is shown in Settings
 * with a way to try again; it is never retried in a loop.
 */
export async function autoDownload(translation: TranslationId): Promise<AutoOutcome> {
  const settings = await readOfflineSettings();
  if (!settings.autoBible) return "off";
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (connection?.saveData) return "save-data";

  const db = await openOfflineDb();
  const record = await db.get("bibleDatasets", translation);
  if (isCurrent(record, translation)) return "current";
  const version = editionVersion(committedEditions[translation]);
  if (record?.autoVersion === version && record.autoAttempts >= maxAutoAttempts) return "waiting";

  void requestPersistence();
  return downloadTranslation(translation, { automatic: true });
}
