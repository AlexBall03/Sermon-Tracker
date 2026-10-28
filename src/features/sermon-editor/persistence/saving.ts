import type { JSONContent } from "@tiptap/core";

import type { DocumentProblem } from "@/features/sermon-editor/document";
import type { DocumentActionResult } from "./actions";
import type { DocumentReadResult } from "./reader";
import { toPlainJson, type JsonProblem } from "./json";
import { documentLimits, utf8Bytes } from "./model";

/*
 * What a save of a sermon document is, and what came of it (A2.3A): the
 * contract the autosave controller (A2.3B) consumes. Pure: no React, no
 * IndexedDB, no server code, so the browser may import it.
 *
 * A save is the whole document, sent through `saveOutlineDocument` and made
 * against `expectedRevision`. The PostgreSQL revision is the only concurrency
 * control; `sequence` only names which of the client's snapshots was sent, so
 * an answer can be matched to the work it confirms (recovery/store.ts).
 */

export type DocumentSaveRequest = {
  outlineId: string;
  /** A plain copy (`prepareSave`), never the editor's own JSON. */
  content: JSONContent;
  /** The revision last confirmed or read: the server writes nothing if it has moved. */
  expectedRevision: number;
  /** The client's local sequence of `content`. Never sent; matched to the answer. */
  sequence: number;
};

export type DocumentSaveOutcome =
  /** The server holds exactly this snapshot, at `revision`. */
  | { kind: "confirmed"; sequence: number; revision: number }
  /**
   * The server's document is not the one this was made against: saved since
   * (`stale`, with the current revision) or gone (`missing`). Nothing was
   * written. Read it again; never overwrite, never merge by itself.
   */
  | { kind: "conflict"; sequence: number; code: "stale" | "missing"; revision?: number }
  /** The server will not take this document as it is. Nothing was written; keep all of it. */
  | {
      kind: "refused";
      sequence: number;
      code: "invalid" | "too_large";
      problems?: DocumentProblem[];
      bytes?: number;
      limit?: number;
    }
  /** The session ended or the account may not save. Nothing was written; keep the draft. */
  | { kind: "unauthorized"; sequence: number }
  /**
   * Not saved as far as is known. `uncertain` when no answer came (the network,
   * a 413, a crash) or the server's own save failed (its statement may have
   * committed before the connection dropped, A2.3B.2B.1): the server may have
   * saved it, so the next answer to read is the document itself. Otherwise
   * (never from `saveOutcome` since A2.3B.2B.1) nothing was written.
   */
  | { kind: "failed"; sequence: number; uncertain: boolean };

export type PreparedSave =
  /** The plain copy to send, and its size in UTF-8 bytes of JSON. */
  | { ok: true; content: JSONContent; bytes: number }
  /** Over `documentLimits`. Never sent; keep all of it. */
  | { ok: false; reason: "too_large"; bytes: number; limit: number }
  /**
   * Holds something JSON would change or PostgreSQL cannot store
   * (`not_json`, `unstorable_text`, with its path). Never sent; keep all of
   * it. The server refuses the same thing as `invalid`.
   */
  | { ok: false; reason: "unsafe"; problem: JsonProblem };

/**
 * Prepares a snapshot to be sent (A2.3A.1): its strict plain copy
 * (`toPlainJson`), or why it is not sent. The editor's JSON has attributes
 * with no prototype, which a Server Action refuses to encode; the copy gives
 * every object `Object.prototype` and changes nothing else. A document over
 * the limit is never sent: the server would refuse it, and much larger the
 * framework would refuse the request first, which would look like a failure
 * worth retrying.
 */
export function prepareSave(content: JSONContent): PreparedSave {
  const prepared = prepareSnapshot(content);
  if (prepared.ok || prepared.reason === "unsafe") return prepared;
  return { ok: false, reason: "too_large", bytes: prepared.bytes, limit: prepared.limit };
}

/**
 * `prepareSave`, keeping the plain copy of a document over the limit too
 * (A2.3B.1): the autosave controller keeps such a document on the device,
 * where words are never refused, and never sends it.
 */
export type PreparedSnapshot =
  | Extract<PreparedSave, { ok: true }>
  | (Extract<PreparedSave, { reason: "too_large" }> & { content: JSONContent })
  | Extract<PreparedSave, { reason: "unsafe" }>;

export function prepareSnapshot(content: JSONContent): PreparedSnapshot {
  const plain = toPlainJson(content);
  if (!plain.ok) return { ok: false, reason: "unsafe", problem: plain.problem };
  const copy = plain.value as JSONContent;
  const bytes = utf8Bytes(JSON.stringify(copy));
  const limit = documentLimits.bytes;
  if (bytes > limit) return { ok: false, reason: "too_large", bytes, limit, content: copy };
  return { ok: true, content: copy, bytes };
}

/** What `saveOutlineDocument`'s answer means for the snapshot `sequence`. */
export function saveOutcome(sequence: number, result: DocumentActionResult): DocumentSaveOutcome {
  if (result.ok) {
    // An answer of success without a revision cannot be built on: read the document.
    return typeof result.revision === "number"
      ? { kind: "confirmed", sequence, revision: result.revision }
      : { kind: "failed", sequence, uncertain: true };
  }
  switch (result.code) {
    case "stale":
    case "missing":
      return { kind: "conflict", sequence, code: result.code, revision: result.revision };
    case "invalid":
      return { kind: "refused", sequence, code: "invalid", problems: result.problems };
    case "too_large":
      return {
        kind: "refused",
        sequence,
        code: "too_large",
        bytes: result.bytes,
        limit: result.limit,
      };
    case "failed":
      // A caught database error (A2.3B.2B.1): the statement may have committed before the
      // connection dropped, so the server may hold it. Read the document; never send again blindly.
      return { kind: "failed", sequence, uncertain: true };
    case undefined:
      // `authorize` refused: its answer carries no code.
      return { kind: "unauthorized", sequence };
    default:
      // A code a save never gives: assume nothing about what the server holds.
      return { kind: "failed", sequence, uncertain: true };
  }
}

/** The outcome when the action threw or gave no answer. */
export const unansweredOutcome = (sequence: number): DocumentSaveOutcome => ({
  kind: "failed",
  sequence,
  uncertain: true,
});

/**
 * What the server holds, as `readOutlineDocument` answered (A2.3A.1): for the
 * controller to compare with the snapshot it sent when a save got no answer.
 * Reading never changes anything, so every outcome may be asked again.
 */
export type DocumentReadOutcome =
  /** The canonical document, as a plain copy, and the revision the next save names. */
  | { kind: "found"; content: JSONContent; revision: number }
  /** No document for that outline among the account's (or an ID that names none). */
  | { kind: "missing" }
  /** Stored but no longer accepted. Never saved over blindly (A3). */
  | { kind: "unreadable"; revision?: number }
  /** The session ended or the account may not read. */
  | { kind: "unauthorized" }
  /** Not read this time: try again later. */
  | { kind: "failed" };

/** What `readOutlineDocument`'s answer means. */
export function readOutcome(result: DocumentReadResult): DocumentReadOutcome {
  if (result.ok) {
    return result.content && typeof result.revision === "number"
      ? { kind: "found", content: result.content, revision: result.revision }
      : { kind: "failed" };
  }
  switch (result.code) {
    case "missing":
    case "invalid":
      return { kind: "missing" };
    case "unreadable":
      return { kind: "unreadable", revision: result.revision };
    case undefined:
      return { kind: "unauthorized" };
    default:
      return { kind: "failed" };
  }
}
