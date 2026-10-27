import type { readOutlineDocument, saveOutlineDocument } from "../actions";
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
 * `actionTransport` is the real one. It takes the actions as arguments (the
 * import above is of their types only), so this module does not import the
 * `"use server"` module either; A3 passes `saveOutlineDocument` and
 * `readOutlineDocument`.
 */

export type DocumentTransport = {
  /** Sends one save. Never rejects: no answer is `unansweredOutcome`. */
  save(request: DocumentSaveRequest): Promise<DocumentSaveOutcome>;
  /** Reads what the server holds. Never rejects. Not used before A2.3B.2B's reconciliation. */
  read(outlineId: string): Promise<DocumentReadOutcome>;
};

export type DocumentActions = {
  save: typeof saveOutlineDocument;
  read: typeof readOutlineDocument;
};

/** Whether `value` looks like an action's answer at all; anything else is no answer. */
const answered = (value: unknown): value is { ok: boolean } =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { ok?: unknown }).ok === "boolean";

/**
 * The transport over the Server Actions. A throw (the network, a 413, a
 * crash) or something that is not an answer is `failed` and `uncertain`: the
 * server may have saved it. No timeout here; a request that never settles
 * keeps the coordinator `saving`, which sends nothing more (A2.3B.2C).
 */
export function actionTransport(actions: DocumentActions): DocumentTransport {
  return {
    async save(request) {
      let result: unknown;
      try {
        result = await actions.save(request.outlineId, request.content, request.expectedRevision);
      } catch {
        return unansweredOutcome(request.sequence);
      }
      if (!answered(result)) return unansweredOutcome(request.sequence);
      return saveOutcome(
        request.sequence,
        result as Awaited<ReturnType<typeof saveOutlineDocument>>,
      );
    },
    async read(outlineId) {
      let result: unknown;
      try {
        result = await actions.read(outlineId);
      } catch {
        return { kind: "failed" };
      }
      if (!answered(result)) return { kind: "failed" };
      return readOutcome(result as Awaited<ReturnType<typeof readOutlineDocument>>);
    },
  };
}
