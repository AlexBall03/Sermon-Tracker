import type { JSONContent } from "@tiptap/core";

import { canonicalDocument } from "../canonical";
import type { JsonValue } from "../json";
import { unansweredOutcome, type DocumentSaveOutcome } from "../saving";
import type { AutosaveController, ClaimedSnapshot } from "./controller";
import {
  jsonEqual,
  serverSaveTiming,
  type NetworkBlockReason,
  type NetworkPhase,
  type NetworkState,
  type ServerSaveTiming,
} from "./model";
import type { DocumentTransport } from "./transport";

/*
 * The save coordinator (A2.3B.2A): sends one autosave controller's snapshots
 * to the server, through an injected `DocumentTransport`. No React, no
 * editor, no IndexedDB, no Server Action: the controller keeps every draft
 * operation, and this only times saves, claims, sends, and confirms.
 *
 * Its rules:
 * - Timers, never polling. A save is due 1.5 s after the last change and at
 *   most 10 s after the first unsent one (`serverSaveTiming`); typing never
 *   pushes the second back.
 * - Write ahead. A save starts with the controller's `flush()`, so the
 *   snapshot sent was first offered to IndexedDB (a failed draft write does
 *   not stop the save; the controller says the device holds nothing).
 * - One request. Nothing is sent while one is preparing, in flight, or not
 *   resolved; a save due meanwhile waits for it to settle.
 * - What is sent is the claimed snapshot: an immutable copy, so later edits
 *   are never part of it. Before sending, the server's own canonical function
 *   (`canonicalDocument`) is run on it: what it refuses is never sent, and
 *   what it gives is what the server will hold if the save is confirmed.
 * - A confirmation counts only for the sequence sent and only at the expected
 *   revision plus one (`updateDocument` moves it by exactly one). Anything
 *   else confirms nothing.
 * - Nothing whose outcome is unknown is sent again. No answer, or an answer
 *   that cannot be built on, holds the claim and stops every automatic save
 *   until A2.3B.2B reads the document and decides (`reconciling`). A
 *   definite refusal, conflict, or unauthorized account stops them too
 *   (`blocked`, holding no claim); a failure that wrote nothing waits for
 *   `retry()` (`failed`). There is no automatic retry here (A2.3B.2C).
 * - One coordinator per claim. A controller whose claim is still held (an
 *   earlier coordinator's unresolved save) is refused at creation.
 *
 * It logs nothing.
 */

/** Why a coordinator could not be made. */
export class SaveCoordinatorError extends Error {
  constructor(readonly kind: "disposed" | "claimed" | "revision" | "base") {
    super(`The save coordinator could not start (${kind}).`);
    this.name = "SaveCoordinatorError";
  }
}

/** The server's document as the editing session began: from `readOutlineDocument` or `getDocument`. */
export type AuthoritativeBase = { content: JSONContent; revision: number };

/** The save in flight or not resolved, whole: what B.2B compares a read with. */
export type Submission = {
  sequence: number;
  expectedRevision: number;
  bytes: number;
  /** Exactly what was sent. */
  content: JSONContent;
  /** Its canonical form: what the server holds if this save was taken. */
  predicted: JSONContent;
};

export type SaveCoordinatorOptions = {
  controller: AutosaveController;
  transport: DocumentTransport;
  /** The authoritative document; its revision must be the controller's. */
  base: AuthoritativeBase;
  timing?: Partial<ServerSaveTiming>;
};

export type SaveCoordinator = {
  getState(): NetworkState;
  /** Called with each new state until unsubscribed or disposed; never per keystroke. */
  subscribe(listener: (state: NetworkState) => void): () => void;
  /**
   * Saves now rather than when the timers say (for A2.3B.3's page lifecycle).
   * While a save runs, the next one is made due. Resolves once this save has
   * settled; never rejects.
   */
  saveNow(): Promise<NetworkState>;
  /** After `failed` only: one more attempt. Does nothing in any other phase. */
  retry(): Promise<NetworkState>;
  /** What the server is known to hold. */
  getBase(): AuthoritativeBase;
  getSubmission(): Submission | null;
  /**
   * Sends nothing more and cancels its timers. A request already sent may
   * still be taken by the server; if it is confirmed, the controller (the same
   * session) is told, and nothing is scheduled. Called by itself when the
   * controller is disposed.
   */
  dispose(): void;
};

/** How many times a save flushes and tries to claim when a draft write slipped in between. */
const claimAttempts = 3;

type Settled = Exclude<NetworkPhase, "scheduled" | "disposed">;

export function createSaveCoordinator(options: SaveCoordinatorOptions): SaveCoordinator {
  const { controller, transport } = options;
  const timing = { ...serverSaveTiming, ...options.timing };
  const opened = controller.getState();
  if (opened.disposed) throw new SaveCoordinatorError("disposed");
  // A claim still held is a save whose outcome is not known: starting again would forget it (A2.3B.2B reads first).
  if (opened.saving !== null) throw new SaveCoordinatorError("claimed");
  if (!Number.isSafeInteger(options.base.revision) || options.base.revision !== opened.revision) {
    throw new SaveCoordinatorError("revision");
  }
  // The server's document is one the core accepts; anything else is not a base.
  const canonicalBase = canonicalDocument(options.base.content);
  if (!canonicalBase.ok) throw new SaveCoordinatorError("base");

  let base: AuthoritativeBase = { content: options.base.content, revision: options.base.revision };
  let baseInfo: NetworkState["base"] = {
    revision: base.revision,
    provenance: "server",
    canonical: jsonEqual(canonicalBase.content as JsonValue, options.base.content as JsonValue),
  };

  let phase: Settled = "idle";
  let revision = base.revision;
  let confirmedSequence = opened.confirmedSequence;
  let submission: Submission | null = null;
  let due = false;
  let outcome: DocumentSaveOutcome | null = null;
  let block: NetworkState["block"] = null;
  let disposed = false;

  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let maxTimer: ReturnType<typeof setTimeout> | null = null;
  let running: Promise<void> | null = null;

  const listeners = new Set<(state: NetworkState) => void>();

  function getState(): NetworkState {
    return {
      phase: disposed
        ? "disposed"
        : phase === "idle" && (idleTimer || maxTimer)
          ? "scheduled"
          : phase,
      revision,
      base: { ...baseInfo },
      submission: submission && {
        sequence: submission.sequence,
        expectedRevision: submission.expectedRevision,
        bytes: submission.bytes,
      },
      confirmedSequence,
      due,
      outcome,
      block,
    };
  }

  function tell(state: NetworkState) {
    for (const listener of [...listeners]) {
      try {
        listener(state);
      } catch (error) {
        // A listener's failure is its own; it never stops the coordinator.
        queueMicrotask(() => {
          throw error;
        });
      }
    }
  }

  function publish() {
    if (disposed || listeners.size === 0) return;
    tell(getState());
  }

  function clearTimers() {
    if (idleTimer) clearTimeout(idleTimer);
    if (maxTimer) clearTimeout(maxTimer);
    idleTimer = null;
    maxTimer = null;
  }

  /** Whether changes may still schedule a save. Not once anything is unresolved, refused, or failed. */
  const schedulable = () =>
    !disposed && (phase === "idle" || phase === "preparing" || phase === "saving");

  function onChange() {
    if (!schedulable()) return;
    const armed = idleTimer !== null || maxTimer !== null;
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(onDue, timing.serverDebounceMs);
    maxTimer ??= setTimeout(onDue, timing.serverMaxWaitMs);
    if (!armed && phase === "idle") publish();
  }

  function onDue() {
    clearTimers();
    if (disposed) return;
    if (phase === "preparing" || phase === "saving") {
      // One request at a time: this one runs when the running one settles.
      due = true;
      publish();
      return;
    }
    if (phase === "idle") void run();
  }

  /** Arms the idle timer once, when work is waiting and nothing else will start a save. */
  function armIfWaiting() {
    if (!schedulable() || idleTimer || maxTimer) return;
    const state = controller.getState();
    if (state.disposed || state.refusal) return;
    if (state.changed || state.sequence > state.confirmedSequence) {
      idleTimer = setTimeout(onDue, timing.serverDebounceMs);
    }
  }

  function run(): Promise<void> {
    if (running) return running;
    running = save().finally(() => {
      running = null;
      if (disposed || phase !== "idle") return;
      if (due) {
        due = false;
        void run();
      } else {
        armIfWaiting();
      }
    });
    return running;
  }

  function stop(
    next: "reconciling" | "blocked" | "failed",
    reason: NetworkBlockReason | null,
    origin: "server" | "local",
  ) {
    clearTimers();
    due = false;
    phase = next;
    block = reason ? { reason, origin } : null;
    publish();
  }

  /** Flushes and claims, trying again only when a draft write slipped in between. */
  async function claim(): Promise<ClaimedSnapshot | null> {
    for (let attempt = 0; attempt < claimAttempts; attempt += 1) {
      const state = await controller.flush();
      if (disposed || phase !== "preparing") return null;
      if (state.disposed || state.refusal) return null;
      if (state.sequence <= state.confirmedSequence) return null;
      const claimed = controller.claimSave();
      if (claimed) return claimed;
      // Null with work waiting means a draft write began after the flush: flush again.
      const now = controller.getState();
      if (now.saving !== null || (!now.changed && now.local === "idle")) return null;
    }
    return null;
  }

  async function save(): Promise<void> {
    due = false;
    phase = "preparing";
    publish();

    const claimed = await claim();
    if (disposed) {
      if (claimed) controller.releaseSave(claimed.sequence);
      return;
    }
    if (!claimed) {
      phase = "idle";
      publish();
      return;
    }
    if (claimed.expectedRevision !== revision) {
      controller.releaseSave(claimed.sequence);
      stop("blocked", "revision_mismatch", "local");
      return;
    }
    // What the server would store for it, by the server's own function. What it refuses is never sent.
    const predicted = canonicalDocument(claimed.content);
    if (!predicted.ok) {
      controller.releaseSave(claimed.sequence);
      outcome =
        predicted.status === "invalid"
          ? {
              kind: "refused",
              sequence: claimed.sequence,
              code: "invalid",
              problems: predicted.problems,
            }
          : {
              kind: "refused",
              sequence: claimed.sequence,
              code: "too_large",
              bytes: predicted.bytes,
              limit: predicted.limit,
            };
      stop("blocked", "refused", "local");
      return;
    }

    const sent: Submission = {
      sequence: claimed.sequence,
      expectedRevision: claimed.expectedRevision,
      bytes: claimed.bytes,
      content: claimed.content,
      predicted: predicted.content,
    };
    submission = sent;
    phase = "saving";
    publish();

    let answer: DocumentSaveOutcome;
    try {
      answer = await transport.save({
        outlineId: controller.outlineId,
        content: sent.content,
        expectedRevision: sent.expectedRevision,
        sequence: sent.sequence,
      });
    } catch {
      answer = unansweredOutcome(sent.sequence);
    }
    settle(sent, answer);
  }

  /** What the answer to `sent` means. Only `sent`'s own answer can confirm anything. */
  function settle(sent: Submission, answer: DocumentSaveOutcome) {
    const own = typeof answer === "object" && answer !== null && answer.sequence === sent.sequence;
    outcome = own ? answer : unansweredOutcome(sent.sequence);
    if (!own) {
      // Not an answer to what was sent: the server may hold it. The claim is held.
      stop("reconciling", "uncertain", "server");
      return;
    }
    switch (answer.kind) {
      case "confirmed": {
        if (
          !Number.isSafeInteger(answer.revision) ||
          answer.revision !== sent.expectedRevision + 1
        ) {
          stop("reconciling", "unexpected_revision", "server");
          return;
        }
        if (!controller.confirmSave(sent.sequence, answer.revision)) {
          // The server wrote it, but it cannot be built on here: unresolved, never a refusal.
          stop("reconciling", "rejected_confirmation", "local");
          return;
        }
        revision = answer.revision;
        confirmedSequence = sent.sequence;
        base = { content: sent.predicted, revision: answer.revision };
        baseInfo = { revision: answer.revision, provenance: "confirmed", canonical: true };
        submission = null;
        block = null;
        phase = "idle";
        publish();
        return;
      }
      case "failed":
        if (answer.uncertain) {
          stop("reconciling", "uncertain", "server");
          return;
        }
        // The server's transaction wrote nothing: the same snapshot may be claimed again by `retry()`.
        controller.releaseSave(sent.sequence);
        submission = null;
        stop("failed", null, "server");
        return;
      // Each wrote nothing: the claim is released and no submission is left unresolved.
      // `outcome` keeps which one (stale or missing, invalid or too_large) for A2.3B.2B.
      case "conflict":
        controller.releaseSave(sent.sequence);
        submission = null;
        stop("blocked", "conflict", "server");
        return;
      case "refused":
        controller.releaseSave(sent.sequence);
        submission = null;
        stop("blocked", "refused", "server");
        return;
      case "unauthorized":
        controller.releaseSave(sent.sequence);
        submission = null;
        stop("blocked", "unauthorized", "server");
        return;
      default:
        stop("reconciling", "uncertain", "server");
    }
  }

  async function saveNow(): Promise<NetworkState> {
    if (disposed) return getState();
    if (phase === "preparing" || phase === "saving") {
      due = true;
      await running;
      return getState();
    }
    if (phase !== "idle") return getState();
    clearTimers();
    await run();
    return getState();
  }

  async function retry(): Promise<NetworkState> {
    if (disposed || phase !== "failed") return getState();
    phase = "idle";
    block = null;
    await run();
    return getState();
  }

  function dispose() {
    if (disposed) return;
    clearTimers();
    due = false;
    unsubscribeChanges();
    unsubscribeState();
    const state = { ...getState(), phase: "disposed" as const };
    disposed = true;
    // The last state is told once; nothing after it.
    tell(state);
    listeners.clear();
  }

  const unsubscribeChanges = controller.onDocumentChange(onChange);
  const unsubscribeState = controller.subscribe((state) => {
    if (state.disposed) dispose();
  });

  return {
    getState,
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    saveNow,
    retry,
    getBase: () => base,
    getSubmission: () => submission,
    dispose,
  };
}
