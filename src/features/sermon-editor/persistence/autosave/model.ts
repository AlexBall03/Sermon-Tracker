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
  /**
   * The latest refusal of a claimed snapshot written to this session's draft
   * (`refuseSave`, A2.3B.2B.3): `pending` while queued or running, then what
   * IndexedDB said. Metadata only: the content's own durability is
   * `localSequence` and `storageError`, which this never changes.
   */
  refusalRecord: RefusalRecord | null;
  disposed: boolean;
};

/** A refusal the coordinator knows for certain, as `refuseSave` takes it. */
export type SaveRefusal = {
  code: "stale" | "missing" | "invalid" | "too_large";
  revision?: number;
};

export type RefusalRecord = SaveRefusal & {
  sequence: number;
  /** `ignored`: the draft does not hold that snapshot (its write failed) or it was confirmed. */
  status: "pending" | "recorded" | "ignored" | "failed";
  error?: DraftStorageErrorKind;
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
 * How long the coordinator waits for an answer, and how it tries again
 * (A2.3B.2C, the owner's decisions). A timeout means the browser stopped
 * waiting, never that the server did nothing: a save that times out is
 * `uncertain` and read back, a read that times out is a failed read.
 *
 * After a read that failed (or one that found the base still there once the
 * conditional retry was spent), and after a definite `failed` save, the next
 * attempt is made automatically after 1, 2, 4, 8, then 16 s
 * (`retryBaseMs · 2ⁿ`, never more than `retryMaxDelayMs`): `maxRetries`
 * attempts, not counting the first. Then it stops (`exhausted`) until
 * `recover()`. Never a write that could repeat an unresolved one.
 */
export const networkRecoveryTiming = {
  saveTimeoutMs: 15_000,
  readTimeoutMs: 10_000,
  retryBaseMs: 1_000,
  retryMaxDelayMs: 30_000,
  maxRetries: 5,
};
export type NetworkRecoveryTiming = typeof networkRecoveryTiming;

/** The longest delay between automatic attempts that may be configured. */
export const maxRetryDelayMs = 30_000;

/**
 * The timing with `overrides` that make sense: a time must be a positive
 * finite number (the delay at most `maxRetryDelayMs`), `maxRetries` a whole
 * number from 0. Anything else keeps the default.
 */
export function recoveryTiming(
  overrides: Partial<NetworkRecoveryTiming> = {},
): NetworkRecoveryTiming {
  const time = (value: number | undefined, fallback: number) =>
    typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
  const retries = overrides.maxRetries;
  return {
    saveTimeoutMs: time(overrides.saveTimeoutMs, networkRecoveryTiming.saveTimeoutMs),
    readTimeoutMs: time(overrides.readTimeoutMs, networkRecoveryTiming.readTimeoutMs),
    retryBaseMs: time(overrides.retryBaseMs, networkRecoveryTiming.retryBaseMs),
    retryMaxDelayMs: Math.min(
      time(overrides.retryMaxDelayMs, networkRecoveryTiming.retryMaxDelayMs),
      maxRetryDelayMs,
    ),
    maxRetries:
      typeof retries === "number" && Number.isSafeInteger(retries) && retries >= 0
        ? retries
        : networkRecoveryTiming.maxRetries,
  };
}

/** The delay before automatic attempt `retry` (0 for the first): 1, 2, 4, 8, 16 s by default. */
export function retryDelay(timing: NetworkRecoveryTiming, retry: number): number {
  return Math.min(timing.retryBaseMs * 2 ** retry, timing.retryMaxDelayMs);
}

/**
 * Where the save coordinator stands:
 * - `idle`: nothing due. `scheduled`: a save is due when a timer fires.
 * - `preparing`: taking and claiming a snapshot. `saving`: one request in flight.
 * - `reconciling`: a request whose outcome is not known (no answer, or an
 *   answer that cannot be built on, a confirmation included). Its claim and
 *   `submission` are held. Nothing more is sent. The document is read once
 *   on entering it, and again only by `reconcile()` (A2.3B.2B.1); what the
 *   read showed is `reconciliation`.
 * - `blocked`: the server, or the check before sending, said no for certain
 *   (a conflict, a refusal, an account that may not save), or a read showed
 *   the request can no longer be written (a conflict). No claim or
 *   `submission` is held, but for one case: an account found unauthorized by
 *   a read or a retry, whose request may still have been written, holds both.
 *   `block.reason` with `outcome` and `reconciliation` says which. Only a
 *   `refused` block is left by an edit (A2.3B.2B.3): a newer snapshot that is
 *   not the refused content is sent as usual. Every other block is final.
 * - `failed`: the transport said for certain that nothing was written (no
 *   server answer says so since A2.3B.2B.1). Sent again by the bounded
 *   automatic retries (`recovery`, A2.3B.2C), then only by `retry()` or
 *   `recover()`.
 * - `disposed`: sends nothing more.
 * While `reconciling`, reads that failed (or found the base still there
 * once the conditional retry was spent) are made again by the same bounded
 * retries; see `NetworkRecovery`.
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

/**
 * How a document read back compares with a document the browser knows
 * (A2.3B.2B.1): `exact` (`jsonEqual`), `normalized` (equal once the browser's
 * `canonicalDocument` is run on what was read: the same document in another
 * representation), `different`, or `unknown` (the browser's core refuses what
 * was read, so it cannot say: a server on a newer schema).
 */
export type ReconciliationMatch = "exact" | "normalized" | "different" | "unknown";

/**
 * What a read of the document showed about an unresolved save (A2.3B.2B.1).
 * R0 is the revision the save was made against. The request can still be
 * written only while the server's revision is R0 or below, so:
 * - `saved`: at R0 + 1, with the content sent, and settled: the controller
 *   took it (`confirmSave`), the claim is gone, and the phase has left
 *   `reconciling`. Which request wrote it is not known, so this is never a
 *   `confirmed` outcome.
 * - `unsettled`: the same evidence as `saved` (the server holds what was
 *   sent at R0 + 1), but the controller would not take the settlement. Not
 *   saved: still `reconciling`, the submission held, nothing advanced, and
 *   `block.reason` is `rejected_confirmation`.
 * - `unchanged`: at R0, with the base it was made against: not written yet,
 *   and it still may be. Held, and the one conditional retry (A2.3B.2B.2) is
 *   sent if it has not been. `equivalent` when what was sent says what the
 *   base says.
 * - `unverifiable`: at R0 + 1 in a form the browser's core refuses. Held.
 * - `diverged`: at R0 with other content, or below R0. Held: the request may
 *   still be written.
 * - `conflict`: past R0 and not `saved` (another revision, or more than one).
 *   It can no longer be written: released, `blocked`.
 * - `missing`, `unreadable`, `unauthorized`, `failed`: as the read answered.
 *   `missing`, and `unreadable` past R0, are released and `blocked`;
 *   `unauthorized` is `blocked` holding the claim; the rest are held.
 * Holds no content.
 */
export type Reconciliation = {
  /** The submission the read was for. */
  sequence: number;
  result:
    | "saved"
    | "unsettled"
    | "unchanged"
    | "unverifiable"
    | "diverged"
    | "conflict"
    | "missing"
    | "unreadable"
    | "unauthorized"
    | "failed";
  /** The revision read, when the answer had a valid one. */
  revision: number | null;
  /** How what was read compares with what was sent (its canonical prediction). */
  submitted: ReconciliationMatch | null;
  /** How what was read compares with the base the save was made against. */
  base: ReconciliationMatch | null;
  /** What was sent says what that base says. */
  equivalent: boolean;
};

export type NetworkState = {
  phase: NetworkPhase;
  /** The document revision the next save names: the base's. */
  revision: number;
  /**
   * What the server is known to hold. `server`: read from the server, as
   * given at creation or by a reconciliation that settled a save.
   * `confirmed`: the canonical form of a confirmed save, as predicted in the
   * browser with the server's own function. `canonical`: whether that content
   * was already in the browser's canonical form.
   */
  base: { revision: number; provenance: "server" | "confirmed"; canonical: boolean };
  /**
   * The save in flight or not resolved (content through `getSubmission`): set
   * exactly while its claim is held. `attempts`: requests sent for it; 2 once
   * its one conditional retry (A2.3B.2B.2) was sent.
   */
  submission: {
    sequence: number;
    expectedRevision: number;
    bytes: number;
    attempts: number;
  } | null;
  /** The newest sequence this coordinator saw confirmed. */
  confirmedSequence: number;
  /** A save fell due while one was running; it runs when that one settles. */
  due: boolean;
  /** The last answer to a save, or the refusal foreseen before sending. Never set by a read. */
  outcome: DocumentSaveOutcome | null;
  /**
   * Why it stopped. While a save is held `reconciling`, this stays the reason
   * it was first held; what a read showed since is `reconciliation`.
   */
  block: { reason: NetworkBlockReason; origin: "server" | "local" } | null;
  /** A read of the document is in flight (A2.3B.2B.1). At most one, and never with a retry. */
  reading: boolean;
  /** The conditional retry is in flight (A2.3B.2B.2). Never with a read. */
  retrying: boolean;
  /** What the latest read for the current or last submission showed; cleared when a new one is sent. */
  reconciliation: Reconciliation | null;
  /** What the connectivity said last (A2.3B.2C): advice, never proof that the server is reached. */
  online: boolean;
  /** A save fell due while offline: sent once the connectivity says online. */
  waiting: boolean;
  /** The automatic retries of the current failure (A2.3B.2C), or null when there is none. */
  recovery: NetworkRecovery | null;
};

/**
 * One episode of automatic retries (A2.3B.2C): for a held save (`read`: only
 * reads, never a write; the save's one conditional retry is governed apart and
 * never restored), or for a definite `failed` save (`save`). It ends when the
 * save is settled, released, or blocked.
 * - `scheduled`: the next attempt waits `delayMs`.
 * - `offline`: the next attempt waits for the connectivity to say online.
 * - `running`: an attempt is in flight.
 * - `exhausted`: `retries` reached `limit`; nothing more by itself, until
 *   `recover()` starts a new bounded cycle. The claim and the draft are kept.
 * `retries` counts the automatic attempts made, never the first one.
 */
export type NetworkRecovery = {
  kind: "read" | "save";
  retries: number;
  limit: number;
  status: "scheduled" | "offline" | "running" | "exhausted";
  delayMs: number | null;
};

/**
 * The local status with the server's in it (A2.3B.2A), for A3's indicator:
 * - `saved`: the server confirmed exactly the current content.
 * - `saving`: a request is being prepared or is in flight (the current content may be newer).
 * - `waiting`: a save is scheduled.
 * - `unresolved`: a request's outcome is not known; nothing is sent until it is.
 * - `blocked`: the server will not take a save for now (see `block`).
 * - `failed`: a save failed and wrote nothing; tried again by itself (`recovery`).
 * - `stalled` (A2.3B.2C): the automatic retries are spent, for a held save or
 *   a failed one; nothing more is tried until `recover()`. The claim and the
 *   draft are kept.
 * - `offline` (A2.3B.2C): a save is waiting for the connectivity to say online.
 * - `disposed`: the coordinator sends nothing more.
 * - otherwise the local status (`unprotected`, `attention`, `unchanged`,
 *   `pending`, `local`), which never claims the server has anything.
 * A3 reads `online`, `recovery`, `reconciliation`, and `block` for detail.
 */
export type ServerSaveStatus =
  | "saved"
  | "saving"
  | "waiting"
  | "unresolved"
  | "blocked"
  | "failed"
  | "stalled"
  | "offline"
  | "disposed"
  | Exclude<AutosaveStatus, "saved">;

export function serverSaveStatus(local: AutosaveState, network: NetworkState): ServerSaveStatus {
  if (network.phase === "disposed") return "disposed";
  // A refused block with a newer snapshot due is waiting to be sent, not stopped (A2.3B.2C).
  const resuming =
    network.phase === "blocked" && network.block?.reason === "refused" && network.waiting;
  if (network.phase === "blocked" && !resuming) return "blocked";
  if (network.recovery?.status === "exhausted") return "stalled";
  if (network.phase === "reconciling") return "unresolved";
  if (network.phase === "failed") return "failed";
  const status = autosaveStatus(local);
  if (status === "saved" || status === "unprotected" || status === "attention") return status;
  if (status === "unchanged") return status;
  if (!network.online && network.phase !== "saving" && network.phase !== "preparing") {
    return "offline";
  }
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
