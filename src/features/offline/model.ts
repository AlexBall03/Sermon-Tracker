import type { TranslationId } from "@/features/scripture/translations";
import type { SyncConflict } from "@/features/sync/model";

/*
 * What this device keeps for working offline, in IndexedDB (db.ts). Plain
 * types and values with no browser or server code.
 *
 * Two kinds of thing are kept, and never mixed:
 *
 * - Reference data, the same for everyone: the Bible's text. It belongs to
 *   no account, and any account on the device may read it.
 * - An account's own data: its queued changes (`MutationRecord`) and, from
 *   Phase 5D, copies of its ideas and outlines (`AccountRecord`). Every one
 *   carries its owner, the application's user ID (`users.id`), and is only
 *   ever read for that owner.
 *
 * IndexedDB is neither encrypted nor behind sign-in: anyone using the device
 * as this browser profile can read it. So only what must be there is kept,
 * and an account's data is never shown to another account.
 */

/** A translation as this device holds it. */
export type BibleDataset = {
  translation: TranslationId;
  /** The edition that is whole, verified, and read. Absent until one is. */
  activeVersion?: string;
  /** Roughly what the active edition takes up, in bytes of text. */
  activeBytes?: number;
  completedAt?: number;
  /**
   * An edition being downloaded beside the active one: the parts already
   * written. Never read until it is verified and made active.
   */
  staging?: { version: string; partsDone: number[]; bytes: number };
  status: "idle" | "downloading" | "failed";
  error?: DownloadError;
  /** Automatic tries for `autoVersion`; automatic downloading stops after a few. */
  autoAttempts: number;
  autoVersion?: string;
  updatedAt: number;
};

export type DownloadError = "network" | "quota" | "integrity" | "unavailable" | "storage";

/** One chapter of one edition. `title` is a psalm's title, never part of a verse. */
export type StoredChapter = {
  translation: TranslationId;
  version: string;
  book: number;
  chapter: number;
  verses: string[];
  title: string | null;
};

/**
 * Where a queued change stands. `pending` waits its turn (after
 * `nextAttemptAt`, when set); `sending` is on its way, and one the next run
 * finds so was interrupted and is sent again; `failed` stopped trying by itself
 * and waits for the person; `conflict` disagrees with the server and waits for
 * the person to choose. `done` is no longer written: an acknowledged change is
 * removed.
 */
export type MutationStatus = "pending" | "sending" | "failed" | "conflict" | "done";

/** Why a change could not be sent; it decides whether to try again. */
export type MutationErrorKind = "network" | "auth" | "validation" | "conflict" | "server";

/**
 * One change made on this device and not yet acknowledged by the server.
 * Phase 5B writes only `idea.create` (a quick capture made while the server
 * could not be reached); the sync engine (sync/engine.ts) sends them.
 *
 * `opId` is made on the device once and never changes, so sending it twice is
 * one change. `entityId` is the ID the thing will have on the server: for an
 * idea it is the idea's own ID, which `createIdea` accepts and saves only
 * once. `payload` is the action's input as validated when it was made, in the
 * shape of `schemaVersion`.
 */
export type MutationRecord = {
  opId: string;
  owner: string;
  type: MutationType;
  entityType: "idea";
  entityId: string;
  payload: unknown;
  schemaVersion: number;
  createdAt: number;
  attempts: number;
  lastAttemptAt?: number;
  status: MutationStatus;
  error?: { kind: MutationErrorKind; message?: string };
  /** The revision the change was made against, for detecting a conflict. */
  baseRevision?: number;
  /** Not to be sent by itself before this time: the backoff after a passing failure. */
  nextAttemptAt?: number;
  /** Passing failures since the person last asked; sending by itself stops at `maxAutoAttempts`. */
  autoAttempts?: number;
  /** What the server disagreed with, while `status` is `conflict`. */
  conflict?: SyncConflict;
};

export type MutationType = "idea.create";

/** The schema version of each type's payload, written on every record. */
export const mutationSchemaVersions: Record<MutationType, number> = { "idea.create": 1 };

/** An account's own copy of something it owns (Phase 5D). Nothing writes one yet. */
export type AccountRecord = {
  owner: string;
  kind: string;
  id: string;
  data: unknown;
  updatedAt: number;
};

/** This device's offline choices. They are the device's, never the account's. */
export type OfflineSettings = {
  /** Keep a quick capture on the device when the server cannot be reached. */
  captureOffline: boolean;
  /** Keep the reading translation downloaded by itself. */
  autoBible: boolean;
};

export const defaultOfflineSettings: OfflineSettings = { captureOffline: true, autoBible: true };
