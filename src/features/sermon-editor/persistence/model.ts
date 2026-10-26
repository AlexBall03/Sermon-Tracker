import type { JSONContent } from "@tiptap/core";

import type { DocumentProblem } from "@/features/sermon-editor/document";

/*
 * What sermon document persistence (A2.1) promises: the limit, and the
 * outcomes of reading, creating, and saving. No database and no client code
 * here, so a caller in the browser may import the types.
 */

/**
 * The most a stored document may be, in UTF-8 bytes of its JSON. One place,
 * and not a CHECK in the table, so it can be changed without a migration.
 *
 * 512 KiB to begin with (the owner's decision, A2.1): measured, a typical
 * outline is about 36 KB and a very large one about 310 KB, and a Server
 * Action's body is refused over 1 MB by default. It is not a permanent limit
 * on what a sermon may hold; A2.3 reassesses it with real editing.
 */
export const documentLimits = { bytes: 512 * 1024 } as const;

const encoder = new TextEncoder();

/** The length of a string in UTF-8 bytes. */
export const utf8Bytes = (text: string) => encoder.encode(text).byteLength;

/** A document as it is stored and read back. */
export type StoredDocument = {
  outlineId: string;
  /** Canonical schema v4 JSON: what `restoreSermonDocument` accepted, as `doc.toJSON()` wrote it. */
  content: JSONContent;
  /** The revision to name in the next save. */
  revision: number;
  createdAt: Date;
  updatedAt: Date;
};

/** Why a document was not accepted. Nothing was written. */
export type DocumentRefusal =
  /** Not a sermon document, or one the schema refuses. Never repaired. */
  | { status: "invalid"; problems: DocumentProblem[] }
  /** Larger than `limit`, in UTF-8 bytes. Nothing was cut; the caller still has all of it. */
  | { status: "too_large"; bytes: number; limit: number };

export type GetDocumentOutcome =
  | { status: "found"; document: StoredDocument }
  /** Stored, but no longer accepted (a schema that has moved on). Returned as it is, never repaired. */
  | { status: "unreadable"; revision: number; problems: DocumentProblem[] }
  /** No document, no such outline, or another account's: the same answer. */
  | { status: "missing" };

export type CreateDocumentOutcome =
  | { status: "created"; document: StoredDocument }
  /** The outline has a document already. It was left exactly as it was. */
  | { status: "exists"; revision: number }
  /** No such outline among the owner's. */
  | { status: "missing" }
  | DocumentRefusal;

export type UpdateDocumentOutcome =
  | { status: "updated"; revision: number; updatedAt: Date }
  /** Saved by someone else since `expectedRevision`: nothing was written. `revision` is the current one. */
  | { status: "stale"; revision: number }
  /** No document for that outline among the owner's. */
  | { status: "missing" }
  | DocumentRefusal;

/**
 * Why an outline was not converted because doing so could change what it
 * says (A2.2). `code` is a `legacyToDocument` issue, or `not_lossless` when
 * the converted document, read back as entries, is not exactly the outline.
 * Codes, IDs, and field names only: never the outline's words.
 */
export type ConversionProblem = {
  code: string;
  entryId?: string;
  detail?: string;
};

export type ConvertOutlineOutcome =
  /** The outline's first document, made from its entries, at revision 0. It is now the outline's authority. */
  | { status: "converted"; document: StoredDocument }
  /** It had a document already, which was left exactly as it was. */
  | { status: "exists"; revision: number }
  /** It has a document that is no longer accepted. Left exactly as it was, never converted over. */
  | { status: "unreadable"; revision: number; problems: DocumentProblem[] }
  /** No such outline among the owner's. */
  | { status: "missing" }
  /** Converting it could lose or change something. It stays a legacy outline, untouched. */
  | { status: "unsafe"; problems: ConversionProblem[] }
  | DocumentRefusal;
