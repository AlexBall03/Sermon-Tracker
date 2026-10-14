import {
  openDB,
  type DBSchema,
  type IDBPDatabase,
  type IDBPTransaction,
  type StoreNames,
} from "idb";

import type { TranslationId } from "@/features/scripture/translations";
import type {
  AccountRecord,
  BibleDataset,
  MutationRecord,
  MutationStatus,
  StoredChapter,
} from "./model";

/*
 * The device's offline database. One database, opened once per page, and
 * changed only by adding a step to `migrations`: the browser runs every step
 * from the version it has to the latest, in order, inside one upgrade. Never
 * change or remove a step that has shipped.
 *
 * A newer version of the application, open in another tab, asks to upgrade by
 * closing every older connection: this one closes when asked and is opened
 * again on its next use, so an upgrade is never left waiting.
 */

export const dbName = "sermon-tracker";

export interface OfflineSchema extends DBSchema {
  /** Small values under a name: the active account, the device's settings. */
  meta: { key: string; value: unknown };
  bibleDatasets: { key: TranslationId; value: BibleDataset };
  /** `[translation, version, book, chapter]`. */
  bibleChapters: { key: [TranslationId, string, number, number]; value: StoredChapter };
  mutations: {
    key: string;
    value: MutationRecord;
    indexes: { owner: string; ownerStatus: [string, MutationStatus] };
  };
  /** `[owner, kind, id]`: an account's own copies (Phase 5D.1, ideas/store.ts). */
  accountData: {
    key: [string, string, string];
    value: AccountRecord;
    indexes: { owner: string; ownerKind: [string, string] };
  };
}

export type OfflineDb = IDBPDatabase<OfflineSchema>;
type Upgrade = IDBPTransaction<OfflineSchema, StoreNames<OfflineSchema>[], "versionchange">;

/** Each step takes the database one version on. Index 0 makes version 1. */
export const migrations: ((db: OfflineDb, tx: Upgrade) => void)[] = [
  (db) => {
    db.createObjectStore("meta");
    db.createObjectStore("bibleDatasets", { keyPath: "translation" });
    db.createObjectStore("bibleChapters", {
      keyPath: ["translation", "version", "book", "chapter"],
    });
    const mutations = db.createObjectStore("mutations", { keyPath: "opId" });
    mutations.createIndex("owner", "owner");
    mutations.createIndex("ownerStatus", ["owner", "status"]);
    const accountData = db.createObjectStore("accountData", { keyPath: ["owner", "kind", "id"] });
    accountData.createIndex("owner", "owner");
  },
  // Phase 5D.1: an account's copies of one kind, read without the rest.
  (_db, tx) => {
    tx.objectStore("accountData").createIndex("ownerKind", ["owner", "kind"]);
  },
];

export const dbVersion = migrations.length;

/** IndexedDB is missing or refused (a private window, blocked site data). */
export class OfflineStorageUnavailable extends Error {
  constructor(cause?: unknown) {
    super("Offline storage is unavailable on this device.", { cause });
    this.name = "OfflineStorageUnavailable";
  }
}

let opening: Promise<OfflineDb> | null = null;

/** The database, opened (and upgraded) on first use. */
export function openOfflineDb(): Promise<OfflineDb> {
  if (opening) return opening;
  if (typeof indexedDB === "undefined") return Promise.reject(new OfflineStorageUnavailable());
  const attempt = openDB<OfflineSchema>(dbName, migrations.length, {
    upgrade(db, oldVersion, _newVersion, tx) {
      for (let step = oldVersion; step < migrations.length; step++) migrations[step](db, tx);
    },
    blocking() {
      // A newer version wants the database: let it, and open again when next asked.
      void attempt.then((db) => db.close());
      opening = null;
    },
    terminated() {
      // The browser closed it (storage cleared, for one): open again when next asked.
      opening = null;
    },
  }).catch((error: unknown) => {
    opening = null;
    throw new OfflineStorageUnavailable(error);
  });
  opening = attempt;
  return attempt;
}

/** For tests: close the connection so the next use opens it again. */
export async function closeOfflineDb() {
  const current = opening;
  opening = null;
  if (current) (await current.catch(() => null))?.close();
}
