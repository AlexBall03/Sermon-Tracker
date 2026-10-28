import type { saveOutlineDocument } from "../actions";
import { readStatus, sermonDocumentHref } from "../read-route";
import type { DocumentReadResult } from "../reader";
import {
  readOutcome,
  saveOutcome,
  unansweredOutcome,
  type DocumentReadOutcome,
  type DocumentSaveOutcome,
  type DocumentSaveRequest,
} from "../saving";

/*
 * How the save coordinator reaches the server (A2.3B.2A): two calls, each
 * answering with the outcomes of saving.ts, never throwing. The coordinator
 * knows only this type, so it imports no Server Action and runs in a test
 * with a stand-in.
 *
 * `documentTransport` is the real one (A2.3B.2D). A save is the
 * `saveOutlineDocument` Server Action, passed in as an argument (the import
 * above is of its type only), so this module does not import the
 * `"use server"` module. A read is a plain GET of `/api/sermon-documents/…`:
 * Next.js dispatches a client's Server Actions one at a time, so a read sent
 * as one would wait behind a save still pending, which is exactly when the
 * coordinator needs it.
 */

export type DocumentTransport = {
  /** Sends one save. Never rejects: no answer is `unansweredOutcome`. */
  save(request: DocumentSaveRequest): Promise<DocumentSaveOutcome>;
  /** Reads what the server holds. Never rejects. */
  read(outlineId: string): Promise<DocumentReadOutcome>;
};

export type TransportDependencies = {
  save: typeof saveOutlineDocument;
  /** The browser's own by default; a test passes one. */
  fetch?: typeof fetch;
};

/** Whether `value` looks like an action's answer at all; anything else is no answer. */
const answered = (value: unknown): value is { ok: boolean } =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  typeof (value as { ok?: unknown }).ok === "boolean";

const revisionLike = (value: unknown) =>
  value === undefined || (Number.isSafeInteger(value) && (value as number) >= 0);

/**
 * Whether a read's answer is one the route gives: a body of the shape its
 * status says. Anything else (a proxy's page, a redirect followed to HTML,
 * a status and body that disagree) is no answer, never evidence.
 */
function readAnswer(status: number, body: unknown): DocumentReadResult | null {
  if (!answered(body)) return null;
  const result = body as DocumentReadResult & Record<string, unknown>;
  if (!revisionLike(result.revision)) return null;
  switch (status) {
    case readStatus.found:
      return result.ok === true &&
        typeof result.content === "object" &&
        result.content !== null &&
        !Array.isArray(result.content) &&
        Number.isSafeInteger(result.revision)
        ? result
        : null;
    case readStatus.invalid:
    case readStatus.missing:
    case readStatus.unreadable:
    case readStatus.failed: {
      const code = ({ 400: "invalid", 404: "missing", 409: "unreadable", 503: "failed" } as const)[
        status
      ];
      return result.ok === false && result.code === code ? result : null;
    }
    case readStatus.unauthorized:
    case 403:
      // `authorize`'s refusal: no code at all.
      return result.ok === false && result.code === undefined ? result : null;
    default:
      return null;
  }
}

/**
 * The transport. A save that throws (the network, a 413, a crash) or answers
 * with something that is not an answer is `failed` and `uncertain`: the
 * server may have saved it. A read that cannot be sent or understood is
 * `failed`. Neither has a timeout, a retry, or an abort here: the coordinator
 * stops waiting after `networkRecoveryTiming` (A2.3B.2C), drops a late
 * answer, and schedules any next attempt itself. A Server Action cannot be
 * cancelled, and stopping to wait proves nothing about what the server wrote.
 */
export function documentTransport({
  save,
  fetch: send = (...args) => globalThis.fetch(...args),
}: TransportDependencies): DocumentTransport {
  return {
    async save(request) {
      let result: unknown;
      try {
        result = await save(request.outlineId, request.content, request.expectedRevision);
      } catch {
        return unansweredOutcome(request.sequence);
      }
      if (!answered(result)) return unansweredOutcome(request.sequence);
      return saveOutcome(request.sequence, result as Awaited<ReturnType<typeof save>>);
    },
    async read(outlineId) {
      try {
        const response = await send(sermonDocumentHref(outlineId), {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
          redirect: "error",
          headers: { Accept: "application/json" },
        });
        if (!/^application\/json\b/i.test(response.headers.get("content-type") ?? "")) {
          return { kind: "failed" };
        }
        const result = readAnswer(response.status, await response.json());
        return result ? readOutcome(result) : { kind: "failed" };
      } catch {
        return { kind: "failed" };
      }
    },
  };
}
