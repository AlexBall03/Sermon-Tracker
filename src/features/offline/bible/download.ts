import { psalmsBook } from "@/features/scripture/books";
import type { TranslationId } from "@/features/scripture/translations";
import { openOfflineDb, type OfflineDb } from "../db";
import type { BibleDataset, DownloadError, StoredChapter } from "../model";
import { isQuotaError } from "../storage";
import {
  committedEditions,
  editionVersion,
  packageParts,
  validatePart,
  type PackageRange,
} from "./package";

/*
 * Keeping a whole translation on this device, and letting it go.
 *
 * A translation is written beside whatever edition the device already has,
 * under its own version, a part at a time; each part's chapters and the note
 * that the part is done are one transaction, so an interrupted download goes
 * on from the first part not done. Nothing written is read until every part
 * is in and the whole text, read back from the device, has the committed
 * checksums. Only then does it become the edition that is read, and the one
 * before it is deleted. A download that fails at any point leaves the edition
 * already kept exactly as it was.
 */

export type DownloadOptions = {
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
  /** Counts as one of the few automatic attempts (see auto.ts). */
  automatic?: boolean;
  /** For tests: where the parts come from, and what they must add up to. */
  fetchPart?: (translation: TranslationId, part: number, signal?: AbortSignal) => Promise<unknown>;
  edition?: { text: string; titles: string };
};

export type DownloadOutcome = "complete" | "busy" | "aborted" | { error: DownloadError };

class DownloadFailure extends Error {
  constructor(readonly reason: DownloadError) {
    super(reason);
  }
}

/** Fetches one part. A refusal is "unavailable"; no answer at all is "network". */
async function fetchPackagePart(translation: TranslationId, part: number, signal?: AbortSignal) {
  let response: Response;
  try {
    response = await fetch(`/api/bible/package/${translation}/${part}`, {
      headers: { Accept: "application/json" },
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new DownloadFailure("network");
  }
  if (response.status === 401 || response.status === 403 || response.status === 404) {
    throw new DownloadFailure("unavailable");
  }
  if (!response.ok) throw new DownloadFailure("network");
  try {
    return await response.json();
  } catch {
    throw new DownloadFailure("network");
  }
}

async function sha256(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const chapterRange = (translation: TranslationId, version: string) =>
  IDBKeyRange.bound([translation, version, 0, 0], [translation, version, Infinity, Infinity]);

async function deleteEdition(db: OfflineDb, translation: TranslationId, version: string) {
  await db.delete("bibleChapters", chapterRange(translation, version));
}

/** Reads a staged edition back and checks it against the committed checksums. */
async function verify(
  db: OfflineDb,
  translation: TranslationId,
  version: string,
  edition: { text: string; titles: string },
  parts: readonly PackageRange[],
) {
  const chapters = await db.getAll("bibleChapters", chapterRange(translation, version));
  const lastBook = parts[parts.length - 1].last;
  const books: string[][][] = [];
  const titles: [number, string][] = [];
  for (let book = parts[0].first; book <= lastBook; book++) books.push([]);
  for (const chapter of chapters) {
    books[chapter.book - parts[0].first][chapter.chapter - 1] = chapter.verses;
    if (chapter.title !== null) titles.push([chapter.chapter, chapter.title]);
  }
  titles.sort((a, b) => a[0] - b[0]);
  const [text, titlesSum] = await Promise.all([
    sha256(JSON.stringify(books)),
    sha256(JSON.stringify(titles)),
  ]);
  return text === edition.text && titlesSum === edition.titles;
}

async function save(db: OfflineDb, record: BibleDataset) {
  await db.put("bibleDatasets", { ...record, updatedAt: Date.now() });
}

function fresh(translation: TranslationId): BibleDataset {
  return { translation, status: "idle", autoAttempts: 0, updatedAt: Date.now() };
}

async function run(translation: TranslationId, options: DownloadOptions): Promise<DownloadOutcome> {
  const edition = options.edition ?? committedEditions[translation];
  const parts = packageParts;
  const fetchPart = options.fetchPart ?? fetchPackagePart;
  const version = editionVersion(edition);
  const db = await openOfflineDb();

  let record = (await db.get("bibleDatasets", translation)) ?? fresh(translation);
  if (record.activeVersion === version) {
    if (record.status !== "idle" || record.staging) {
      record = { ...record, status: "idle", error: undefined, staging: undefined };
      await save(db, record);
    }
    return "complete";
  }

  // A different edition left half-written earlier is of no use now.
  if (record.staging && record.staging.version !== version) {
    await deleteEdition(db, translation, record.staging.version);
    record = { ...record, staging: undefined };
  }
  const staging = record.staging ?? { version, partsDone: [], bytes: 0 };
  if (options.automatic) {
    const attempts = record.autoVersion === version ? record.autoAttempts : 0;
    record = { ...record, autoVersion: version, autoAttempts: attempts + 1 };
  }
  record = { ...record, staging, status: "downloading", error: undefined };
  await save(db, record);

  const report = () => options.onProgress?.(staging.partsDone.length, parts.length);
  report();

  try {
    for (let part = 0; part < parts.length; part++) {
      if (staging.partsDone.includes(part)) continue;
      if (options.signal?.aborted) return "aborted";
      const received = await fetchPart(translation, part, options.signal);
      const checked = validatePart(received, translation, part);
      if (!checked || checked.version !== version) throw new DownloadFailure("integrity");

      const tx = db.transaction(["bibleChapters", "bibleDatasets"], "readwrite");
      const chapters = tx.objectStore("bibleChapters");
      const writes: Promise<unknown>[] = [];
      for (const { book, chapters: texts } of checked.books) {
        texts.forEach((verses, index) => {
          const chapter: StoredChapter = {
            translation,
            version,
            book,
            chapter: index + 1,
            verses,
            title: book === psalmsBook ? (checked.titles[String(index + 1)] ?? null) : null,
          };
          writes.push(chapters.put(chapter));
        });
      }
      staging.partsDone = [...staging.partsDone, part];
      staging.bytes += JSON.stringify(checked.books).length;
      record = { ...record, staging: { ...staging } };
      writes.push(tx.objectStore("bibleDatasets").put({ ...record, updatedAt: Date.now() }));
      await Promise.all([...writes, tx.done]);
      report();
    }

    if (!(await verify(db, translation, version, edition, parts))) {
      throw new DownloadFailure("integrity");
    }

    const previous = record.activeVersion;
    record = {
      ...record,
      activeVersion: version,
      activeBytes: staging.bytes,
      completedAt: Date.now(),
      staging: undefined,
      status: "idle",
      error: undefined,
      autoAttempts: 0,
    };
    await save(db, record);
    if (previous && previous !== version) await deleteEdition(db, translation, previous);
    return "complete";
  } catch (error) {
    if (options.signal?.aborted) {
      // Interrupted on purpose: what is written stays, and the next attempt goes on from it.
      await save(db, { ...record, status: "idle" }).catch(() => {});
      return "aborted";
    }
    const reason: DownloadError =
      error instanceof DownloadFailure ? error.reason : isQuotaError(error) ? "quota" : "storage";
    // Parts that fit together wrongly, or did not fit at all, are not kept to build on.
    const discard = reason === "integrity" || reason === "quota" || reason === "storage";
    if (discard) await deleteEdition(db, translation, version).catch(() => {});
    await save(db, {
      ...record,
      staging: discard ? undefined : { ...staging },
      status: "failed",
      error: reason,
    }).catch(() => {});
    return { error: reason };
  }
}

const running = new Map<TranslationId, Promise<DownloadOutcome>>();
const progress = new Map<TranslationId, number>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

/** Called whenever a download in this tab starts, moves on, or ends. */
export function onDownloadChange(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** How far a download in this tab has come, from 0 to 1; undefined when none is running. */
export function downloadProgress(translation: TranslationId): number | undefined {
  return progress.get(translation);
}

/**
 * Downloads a translation, or goes on with one begun before. One download of
 * a translation at a time: asked again in this tab, it answers with the one
 * already running; running in another tab, it answers "busy".
 */
export function downloadTranslation(
  translation: TranslationId,
  options: DownloadOptions = {},
): Promise<DownloadOutcome> {
  const existing = running.get(translation);
  if (existing) return existing;

  const go = async () => {
    progress.set(translation, 0);
    notify();
    try {
      return await run(translation, {
        ...options,
        onProgress: (done, total) => {
          progress.set(translation, total ? done / total : 0);
          notify();
          options.onProgress?.(done, total);
        },
      });
    } catch {
      // The database itself could not be opened or written.
      return { error: "storage" } as const;
    }
  };

  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  const task: Promise<DownloadOutcome> = (
    locks
      ? (locks.request(`st-bible-${translation}`, { ifAvailable: true }, (lock) =>
          lock ? go() : ("busy" as const),
        ) as Promise<DownloadOutcome>)
      : go()
  ).finally(() => {
    running.delete(translation);
    progress.delete(translation);
    notify();
  });
  running.set(translation, task);
  return task;
}

/**
 * Deletes a translation from this device: its text and its record, and
 * nothing else. Never an account's queued work.
 */
export async function removeTranslation(translation: TranslationId) {
  const db = await openOfflineDb();
  const tx = db.transaction(["bibleChapters", "bibleDatasets"], "readwrite");
  await tx
    .objectStore("bibleChapters")
    .delete(IDBKeyRange.bound([translation, "", 0, 0], [translation, "￿", Infinity, Infinity]));
  await tx.objectStore("bibleDatasets").delete(translation);
  await tx.done;
  notify();
}

/** Every translation this device has a record of. */
export async function listDatasets(): Promise<BibleDataset[]> {
  const db = await openOfflineDb();
  return db.getAll("bibleDatasets");
}

/** True when the translation is kept whole, in the edition this version of the application expects. */
export function isCurrent(record: BibleDataset | undefined, translation: TranslationId) {
  return record?.activeVersion === editionVersion(committedEditions[translation]);
}
