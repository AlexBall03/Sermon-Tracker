import type { JSONContent } from "@tiptap/core";

import type { DocumentProblem } from "@/features/sermon-editor/document";
import type { DocumentActionResult } from "./actions";
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
   * a 413, a crash): the server may have saved it, so the next answer to read
   * is the document itself. Otherwise the server's transaction failed and
   * wrote nothing.
   */
  | { kind: "failed"; sequence: number; uncertain: boolean };

/**
 * A plain JSON copy of a document, as a save sends it. The editor's JSON
 * (ProseMirror's `toJSON`) gives attributes with no prototype, which a Server
 * Action refuses to encode; this also drops anything JSON cannot carry.
 */
export const plainDocument = (content: JSONContent): JSONContent =>
  JSON.parse(JSON.stringify(content)) as JSONContent;

/**
 * Prepares a snapshot to be sent: its plain copy, or a refusal when it is over
 * `documentLimits` in UTF-8 bytes. A document over the limit is never sent:
 * the server would refuse it, and much larger the framework would refuse the
 * request before it, which would look like a failure worth retrying.
 */
export function prepareSave(
  content: JSONContent,
): { ok: true; content: JSONContent; bytes: number } | { ok: false; bytes: number; limit: number } {
  const text = JSON.stringify(content);
  const bytes = utf8Bytes(text);
  const limit = documentLimits.bytes;
  if (bytes > limit) return { ok: false, bytes, limit };
  return { ok: true, content: JSON.parse(text) as JSONContent, bytes };
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
      return { kind: "failed", sequence, uncertain: false };
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
