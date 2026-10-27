import type { JSONContent } from "@tiptap/core";

import type { JsonProblem, JsonValue } from "../json";
import type { DraftStorageErrorKind } from "../recovery/store";

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
  if (current && state.sequence > 0 && state.confirmedSequence === state.sequence) return "saved";
  if (state.refusal?.reason === "unsafe") return "unprotected";
  const kept = current && state.localSequence >= state.sequence;
  if (!kept) return state.storageError ? "unprotected" : "pending";
  if (state.refusal?.reason === "too_large") return "attention";
  return state.sequence === 0 ? "unchanged" : "local";
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
