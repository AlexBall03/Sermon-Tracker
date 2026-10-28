import type { DocumentReadResult } from "./reader";

/*
 * The HTTP contract of the authoritative read (A2.3B.2D), shared by the GET
 * Route Handler and the browser's transport so the two cannot drift. Pure:
 * no server code (the import above is of a type only), so the browser may
 * import it.
 */

/** The address of an outline's document read. The ID is encoded, never trusted to be safe. */
export const sermonDocumentHref = (outlineId: string) =>
  `/api/sermon-documents/${encodeURIComponent(outlineId)}`;

/**
 * The status each answer is sent with. A refused caller (no `code`) is 401
 * whether signed out or denied: `authorize` gives no reason to tell them
 * apart, and the other `/api` routes answer the same.
 */
export const readStatus = {
  found: 200,
  invalid: 400,
  missing: 404,
  unreadable: 409,
  unauthorized: 401,
  failed: 503,
} as const;

export function statusOf(result: DocumentReadResult): number {
  if (result.ok) return readStatus.found;
  return result.code ? readStatus[result.code] : readStatus.unauthorized;
}

/** Every answer of the read, success and failure alike: kept by no cache anywhere. */
export const readHeaders = { "Cache-Control": "private, no-store" } as const;
