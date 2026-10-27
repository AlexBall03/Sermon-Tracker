import type { JSONContent } from "@tiptap/core";

import type { JsonProblem, JsonValue } from "../json";
import type { DraftStorageErrorKind } from "../recovery/store";
import type { DocumentSaveOutcome } from "../saving";

/*
 * The autosave controller's contract (A2.3B.1): its timing, what it reads
 * the document through, the state it reports, and the one status that state
 * means. Pure: no React, no editor, no IndexedDB.
 */

/**
 * When the controller keeps a snapshot on the device. Engineering defaults,
 * not product rules. A snapshot is taken `localDebounceMs` after the last
 * change, and at most `localMaxWaitMs` after the first one not yet kept, so
 * continuous typing still puts its words on the device about every 2 seconds:
 * on a 3 MiB sermon, one whole-document copy and write each time. The
 * server's timing (1.5 s idle, 10 s at most) is A2.3B.2's.
 */
export const autosaveTiming = { localDebounceMs: 350, localMaxWaitMs: 2000 };
export type AutosaveTiming = typeof autosaveTiming;

/**
 * Where the document comes from: the editor, through `editorSource`
 * (editor-adapter.ts), or a stand-in in tests.
 */
export type DocumentSource = {
  /**
   * Calls `onChange` for every change that may alter the document (never for
   * selection, focus, or view state), and `onEnd` once when the source is
   * about to go, while it can still be read. Returns its unsubscribe, after
   * which neither is called.
   */
  subscribe(onChange: () => void, onEnd: () => void): () => void;
  /** The document now, as JSON. Called only when a snapshot is taken. Throws once the source is gone. */
  read(): JSONContent;
};

/** Why the current content cannot go to the server as it is. Its words stay in the editor. */
export type AutosaveRefusal =
  /** Over `documentLimits`: kept on this device, never sent. */
  | { reason: "too_large"; bytes: number; limit: number }
  /** Holds something JSON or `jsonb` would not keep exactly: not kept, not sent (no text in `problem`). */
  | { reason: "unsafe"; problem: JsonProblem };

export type AutosaveState = {
  /** The editor changed since the latest snapshot was taken. */
  changed: boolean;
  /** The latest meaningful snapshot of this session; 0 is the document as it was attached. */
  sequence: number;
  /** The highest sequence known kept: its draft write finished, or the server confirmed it. */
  localSequence: number;
  /** The highest sequence the server confirmed (only through `confirmSave`). */
  confirmedSequence: number;
  /** The document revision the next save names: the one opened, then each confirmed. */
  revision: number;
  /** `scheduled`: a snapshot is waiting on its timer. `writing`: a draft operation is queued or running. */
  local: "idle" | "scheduled" | "writing";
  /** The latest draft write failed and nothing newer has been kept since. */
  storageError: DraftStorageErrorKind | null;
  refusal: AutosaveRefusal | null;
  /** The snapshot claimed for a save (A2.3B.2): at most one. */
  saving: number | null;
  disposed: boolean;
};

/**
 * What the state means, as one answer:
 * - `saved`: the server confirmed exactly the current content.
 * - `unprotected`: the current content is not kept anywhere but the editor.
 * - `pending`: changes not yet kept on this device (a write is due or running).
 * - `attention`: kept on this device, but the server cannot take it (too large).
 *   A2.3B.2 adds conflicts here.
 * - `local`: kept on this device, not known to be on the server.
 * - `unchanged`: nothing changed since the document was opened.
 */
export type AutosaveStatus =
  "saved" | "unprotected" | "pending" | "attention" | "local" | "unchanged";

export function autosaveStatus(state: AutosaveState): AutosaveStatus {
  // An edit not yet taken as a snapshot is never counted as kept.
  const current = !state.changed;
  // Refused content is newer than any snapshot, confirmed or not (A2.3B.2A: it was said `saved`).
  if (state.refusal?.reason === "unsafe") return "unprotected";
  if (current && state.sequence > 0 && state.confirmedSequence === state.sequence) return "saved";
  const kept = current && state.localSequence >= state.sequence;
  if (!kept) return state.storageError ? "unprotected" : "pending";
  if (state.refusal?.reason === "too_large") return "attention";
  return state.sequence === 0 ? "unchanged" : "local";
}

/**
 * When the save coordinator (A2.3B.2A) sends the document to the server, kept
 * apart from the local timing above. A save is due `serverDebounceMs` after
 * the last change, and at most `serverMaxWaitMs` after the first change not
 * yet sent: continuous typing restarts the first and never the second, so it
 * still sends about every 10 s. One whole-document request each time, never
 * one per keystroke.
 */
export const serverSaveTiming = { serverDebounceMs: 1500, serverMaxWaitMs: 10_000 };
export type ServerSaveTiming = typeof serverSaveTiming;

/**
 * Where the save coordinator stands:
 * - `idle`: nothing due. `scheduled`: a save is due when a timer fires.
 * - `preparing`: taking and claiming a snapshot. `saving`: one request in flight.
 * - `reconciling`: a request whose outcome is not known (no answer, or an
 *   answer that cannot be built on, a confirmation included). Its claim and
 *   `submission` are held. Nothing more is sent until A2.3B.2B reads the
 *   document and decides.
 * - `blocked`: the server, or the check before sending, said no for certain
 *   (a conflict, a refusal, an account that may not save), so nothing of it
 *   was written: no claim or `submission` is held, and `block.reason` with
 *   `outcome` says which. Nothing more is sent, even after further edits;
 *   A2.3B.2B decides which of these an edit may clear.
 * - `failed`: the server's transaction failed and wrote nothing. Sent again
 *   only by `retry()` (A2.3B.2C adds bounded backoff).
 * - `disposed`: sends nothing more.
 */
export type NetworkPhase =
  "idle" | "scheduled" | "preparing" | "saving" | "reconciling" | "blocked" | "failed" | "disposed";

export type NetworkBlockReason =
  /** No answer, or one that is not an answer to what was sent. */
  | "uncertain"
  /** Success, with a revision other than the expected one plus one. */
  | "unexpected_revision"
  /** The document moved on since (`stale`) or is gone (`missing`). */
  | "conflict"
  /** Not a document the server takes (`invalid`, `too_large`), said by it or foreseen before sending. */
  | "refused"
  | "unauthorized"
  /** The controller would not confirm the sequence the server confirmed (`reconciling`: the server wrote it). */
  | "rejected_confirmation"
  /** The controller's revision is not the coordinator's. */
  | "revision_mismatch";

export type NetworkState = {
  phase: NetworkPhase;
  /** The document revision the next save names: the base's. */
  revision: number;
  /**
   * What the server is known to hold. `server`: as given at creation (read
   * from the server). `confirmed`: the canonical form of a confirmed save, as
   * predicted in the browser with the server's own function. `canonical`:
   * whether that content was already in canonical form when given.
   */
  base: { revision: number; provenance: "server" | "confirmed"; canonical: boolean };
  /** The save in flight or not resolved (content through `getSubmission`): set exactly while its claim is held. */
  submission: { sequence: number; expectedRevision: number; bytes: number } | null;
  /** The newest sequence this coordinator saw confirmed. */
  confirmedSequence: number;
  /** A save fell due while one was running; it runs when that one settles. */
  due: boolean;
  /** The last answer to a save, or the refusal foreseen before sending. */
  outcome: DocumentSaveOutcome | null;
  block: { reason: NetworkBlockReason; origin: "server" | "local" } | null;
};

/**
 * The local status with the server's in it (A2.3B.2A), for A3's indicator:
 * - `saved`: the server confirmed exactly the current content.
 * - `saving`: a request is being prepared or is in flight (the current content may be newer).
 * - `waiting`: a save is scheduled.
 * - `unresolved`: a request's outcome is not known; nothing is sent until it is.
 * - `blocked`: the server will not take a save for now (see `block`).
 * - `failed`: a save failed and wrote nothing; waiting for `retry()`.
 * - `disposed`: the coordinator sends nothing more.
 * - otherwise the local status (`unprotected`, `attention`, `unchanged`,
 *   `pending`, `local`), which never claims the server has anything.
 */
export type ServerSaveStatus =
  | "saved"
  | "saving"
  | "waiting"
  | "unresolved"
  | "blocked"
  | "failed"
  | "disposed"
  | Exclude<AutosaveStatus, "saved">;

export function serverSaveStatus(local: AutosaveState, network: NetworkState): ServerSaveStatus {
  if (network.phase === "disposed") return "disposed";
  if (network.phase === "reconciling") return "unresolved";
  if (network.phase === "blocked") return "blocked";
  if (network.phase === "failed") return "failed";
  const status = autosaveStatus(local);
  if (status === "saved" || status === "unprotected" || status === "attention") return status;
  if (status === "unchanged") return status;
  if (network.phase === "preparing" || network.phase === "saving") return "saving";
  if (network.phase === "scheduled") return "waiting";
  return status;
}

/**
 * Whether two JSON values say the same thing: same keys and values whatever
 * their order, arrays in order. Stops at the first difference. For the plain
 * copies `toPlainJson` makes; no identity or prototype is consulted.
 */
export function jsonEqual(a: JsonValue, b: JsonValue): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let index = 0; index < a.length; index += 1) {
      if (!jsonEqual(a[index], b[index])) return false;
    }
    return true;
  }
  if (Array.isArray(b)) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!jsonEqual(a[key], b[key])) return false;
  }
  return true;
}
