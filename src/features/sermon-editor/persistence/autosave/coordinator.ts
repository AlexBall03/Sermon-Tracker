import type { JSONContent } from "@tiptap/core";

import { canonicalDocument } from "../canonical";
import type { JsonValue } from "../json";
import { unansweredOutcome, type DocumentReadOutcome, type DocumentSaveOutcome } from "../saving";
import { alwaysOnline, type Connectivity } from "./connectivity";
import type { AutosaveController, ClaimedSnapshot } from "./controller";
import {
  jsonEqual,
  recoveryTiming,
  retryDelay,
  serverSaveTiming,
  type NetworkRecovery,
  type NetworkRecoveryTiming,
  type NetworkBlockReason,
  type NetworkPhase,
  type NetworkState,
  type Reconciliation,
  type ReconciliationMatch,
  type SaveRefusal,
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
 *   (`reconciling`). A definite refusal, conflict, or unauthorized account
 *   stops them too (`blocked`, holding no claim); a failure that wrote
 *   nothing is `failed`, tried again by the bounded retries below.
 * - One coordinator per claim. A controller whose claim is still held (an
 *   earlier coordinator's unresolved save) is refused at creation.
 *
 * Reconciliation (A2.3B.2B.1): entering `reconciling` reads the document
 * once (`transport.read`), and `reconcile()` reads it again; one read at a
 * time, never on a timer, and never a write. What was read is compared, with
 * `canonicalDocument` and `jsonEqual`, with what was sent and with the base
 * it was made against (both kept in the `Submission`). The request can still
 * be written only while the server's revision is the one it named (R0) or
 * below (`updateDocument` writes only at R0, and revisions only rise), so:
 * - At R0 + 1 with what was sent: settled, through `confirmSave` (`saved`).
 *   If the controller will not take it, still held (`unsettled`).
 * - Past R0 otherwise, or the document gone: it can never be written.
 *   Released, `blocked` (`conflict`).
 * - At R0 or below, or anything not understood: held, still `reconciling`.
 *   That includes the base still there (`unchanged`), even when what was
 *   sent says the same: the request may still be written and move the
 *   revision.
 * - An account that may not read: `blocked`, the claim still held.
 * A read never moves `outcome`; what it showed is `reconciliation`.
 *
 * The conditional retry (A2.3B.2B.2): after a read finds `unchanged`, the
 * same submission is sent once more, by itself and at once (no timer): the
 * same content, the same sequence, against the same R0, under the same claim.
 * The server's `WHERE revision = R0` is what keeps the original and the retry
 * from both being written; nothing here stands in for it. A confirmation at
 * R0 + 1 settles it. Anything else (a `stale` answer included, which may be
 * the original's own write) is read back once, by the rules above; the
 * document gone releases it; an account that may not save stops it holding
 * the claim. One retry per submission, spent before it is sent and never
 * given back: at most one save, one read, one retry, and one read back.
 * Reads and the retry share one slot in flight.
 *
 * Network failures (A2.3B.2C):
 * - Timeouts. A save or the conditional retry not answered in 15 s is no
 *   answer (`uncertain`, read back); a read not answered in 10 s is a failed
 *   read. The browser only stops waiting: the request may still be written,
 *   and its late answer is dropped, never taken as evidence (the next read
 *   is). Once disposed, nothing times out: a late confirmation still reaches
 *   the same controller.
 * - Bounded retries. After a read that failed, or one that found the base
 *   still at R0 once the conditional retry was spent (the owner's decision),
 *   the document is read again after 1, 2, 4, 8, then 16 s; after a definite
 *   `failed` save, the save is tried again on the same schedule. One episode
 *   at a time, tied to the submission held (or to the failure), with one
 *   timer; five automatic attempts, never counting the first, then
 *   `exhausted` until `recover()`. Nothing else gives attempts back. These
 *   reads never write: the conditional retry stays once per submission.
 * - Connectivity (advice, never proof). Offline, a save that falls due waits
 *   (`waiting`), the next automatic attempt waits, and nothing in flight is
 *   cancelled; the controller keeps every snapshot on the device. Online
 *   again, one attempt is made at once, counted as usual; repeated events and
 *   events while something is in flight start nothing.
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
  /**
   * The document it was made against, at `expectedRevision`, in the
   * browser's canonical form: what the server still holds if it was not
   * taken. Taken when it was sent, never a later base.
   */
  base: AuthoritativeBase;
};

export type SaveCoordinatorOptions = {
  controller: AutosaveController;
  transport: DocumentTransport;
  /** The authoritative document; its revision must be the controller's. */
  base: AuthoritativeBase;
  timing?: Partial<ServerSaveTiming>;
  /** Timeouts and automatic retries (A2.3B.2C); `networkRecoveryTiming` by default. */
  recovery?: Partial<NetworkRecoveryTiming>;
  /** What the browser says of the network (A2.3B.2C); always online by default. */
  connectivity?: Connectivity;
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
  /**
   * After `failed` only: one more attempt now (a pending automatic one is
   * cancelled). Gives back no automatic attempts. Does nothing in any other
   * phase.
   */
  retry(): Promise<NetworkState>;
  /**
   * The person's way back (A2.3B.2C), for when automatic attempts are spent
   * (`recovery.status === "exhausted"`) or not to be waited for. While
   * `reconciling`: one read, exactly as `reconcile()` (never a write of its
   * own; the conditional retry follows only if it is not spent, and a spent
   * one is never given back). While `failed`: one save, as `retry()`. If the
   * automatic attempts were exhausted, a new bounded cycle follows it. A call
   * while a read or retry is in flight gets its promise. Anywhere else, or
   * once disposed, it does nothing. Keeps every claim. Never rejects. Never
   * call it from a state listener as a reaction to state.
   */
  recover(): Promise<NetworkState>;
  /**
   * While `reconciling` only: reads the document once and settles the save
   * if the read shows what became of it (A2.3B.2B.1). Never writes. A call
   * while a read is in flight gets that read's promise. Done by itself once
   * on entering `reconciling`; after that, only when called. If the read
   * finds the base still at R0 and the save's one conditional retry is not
   * spent, the retry is sent as part of the same call (A2.3B.2B.2). Resolves
   * with the state after the read (and that retry, with its read back); never
   * rejects. Does nothing in any other phase or once disposed. Never call it
   * from a state listener for every state: each answer is published, so that
   * would read again without pause.
   */
  reconcile(): Promise<NetworkState>;
  /**
   * The conditional retry (A2.3B.2B.2), at most once per save: only while
   * `reconciling`, after the latest read found the base the save was made
   * against still at R0 (`reconciliation.result === "unchanged"`). Sends
   * exactly what was sent, against the same revision, under the same claim;
   * anything but a confirmation is read back once. Sent by itself after such
   * a read, so callers rarely need it. A call while a read or retry is in
   * flight gets its promise; anywhere else it does nothing. Never rejects.
   */
  retryUnchanged(): Promise<NetworkState>;
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

const isObject = (value: unknown): value is JSONContent =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Compares a document read from the server with documents the browser knows:
 * as it was read, then in the browser's canonical form (computed once, and
 * only if needed). Never by string.
 */
function matcher(read: JSONContent) {
  let canonical: JSONContent | null | undefined;
  return (known: JSONContent): ReconciliationMatch => {
    if (jsonEqual(read as JsonValue, known as JsonValue)) return "exact";
    if (canonical === undefined) {
      const result = canonicalDocument(read);
      canonical = result.ok ? result.content : null;
    }
    if (canonical === null) return "unknown";
    return jsonEqual(canonical as JsonValue, known as JsonValue) ? "normalized" : "different";
  };
}

type Settled = Exclude<NetworkPhase, "scheduled" | "disposed">;

type Refusal = Extract<DocumentSaveOutcome, { kind: "refused" }>;

/**
 * One episode of automatic retries (A2.3B.2C). `key` is what it is for: the
 * held `Submission` (`read`), or the failure (`save`). `free`: the next
 * attempt is the first one, deferred while offline, and is not counted.
 */
type Episode = {
  kind: "read" | "save";
  key: object;
  retries: number;
  status: NetworkRecovery["status"];
  delayMs: number | null;
  timer: ReturnType<typeof setTimeout> | null;
  free: boolean;
};

export function createSaveCoordinator(options: SaveCoordinatorOptions): SaveCoordinator {
  const { controller, transport } = options;
  const timing = { ...serverSaveTiming, ...options.timing };
  const network = recoveryTiming(options.recovery);
  const connectivity = options.connectivity ?? alwaysOnline;
  const opened = controller.getState();
  if (opened.disposed) throw new SaveCoordinatorError("disposed");
  // A claim still held is a save whose outcome is not known: starting again would forget it (A2.3B.2B reads first).
  if (opened.saving !== null) throw new SaveCoordinatorError("claimed");
  if (!Number.isSafeInteger(options.base.revision) || options.base.revision !== opened.revision) {
    throw new SaveCoordinatorError("revision");
  }
  // The server's document is one the core accepts; anything else is not a base.
  const given = canonicalDocument(options.base.content);
  if (!given.ok) throw new SaveCoordinatorError("base");

  let base: AuthoritativeBase = { content: options.base.content, revision: options.base.revision };
  // The base in the browser's canonical form, at the same revision: what a read is compared with.
  let canonicalBase: JSONContent = given.content;
  let baseInfo: NetworkState["base"] = {
    revision: base.revision,
    provenance: "server",
    canonical: jsonEqual(given.content as JsonValue, options.base.content as JsonValue),
  };

  let phase: Settled = "idle";
  let revision = base.revision;
  let confirmedSequence = opened.confirmedSequence;
  let submission: Submission | null = null;
  let due = false;
  let outcome: DocumentSaveOutcome | null = null;
  let block: NetworkState["block"] = null;
  let reconciliation: Reconciliation | null = null;
  let disposed = false;

  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let maxTimer: ReturnType<typeof setTimeout> | null = null;
  let running: Promise<void> | null = null;
  /** The read or conditional retry in flight (A2.3B.2B.1–2): one at a time, never both. */
  let inFlight: Promise<NetworkState> | null = null;
  let readInFlight = false;
  let retryInFlight = false;
  /**
   * The submission whose one conditional retry was spent (A2.3B.2B.2),
   * compared by identity: the `Submission` object is the logical save, kept
   * through its retry. Set before anything is sent or told, and never reset.
   */
  let retried: Submission | null = null;
  /**
   * The last snapshot refused for certain (A2.3B.2B.3), and what was refused:
   * the canonical content the server refused (null when the check before
   * sending refused it), so that content is never sent again, whatever its
   * sequence. Cleared once a save is settled.
   */
  let refused: { sequence: number; predicted: JSONContent | null; outcome: Refusal } | null = null;

  /** The automatic retries of the current failure (A2.3B.2C): at most one, with at most one timer. */
  let episode: Episode | null = null;
  /** The timeouts of requests in flight; cleared on dispose, so a late answer is still awaited. */
  const timeouts = new Set<ReturnType<typeof setTimeout>>();
  let online = readOnline();
  /** A save fell due while offline. */
  let waitingForNetwork = false;

  const listeners = new Set<(state: NetworkState) => void>();

  function readOnline(): boolean {
    try {
      return connectivity.online() !== false;
    } catch {
      return true;
    }
  }

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
        attempts: retried === submission ? 2 : 1,
      },
      confirmedSequence,
      due,
      outcome,
      block,
      reading: readInFlight,
      retrying: retryInFlight,
      reconciliation: reconciliation && { ...reconciliation },
      online,
      waiting: waitingForNetwork,
      recovery: episode && {
        kind: episode.kind,
        retries: episode.retries,
        limit: network.maxRetries,
        status: episode.status,
        delayMs: episode.delayMs,
      },
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

  /**
   * A refusal a newer snapshot may clear (A2.3B.2B.3): nothing was written,
   * no claim or submission is held, and the base is still what the server
   * holds. Every other block is final.
   */
  const resumable = () =>
    !disposed && phase === "blocked" && block?.reason === "refused" && submission === null;

  /** Whether changes may still schedule a save. Not once anything is unresolved, failed, or blocked for good. */
  const schedulable = () =>
    !disposed && (phase === "idle" || phase === "preparing" || phase === "saving" || resumable());

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
    if (phase === "idle" || resumable()) startSave();
  }

  /** Starts a save, unless the connectivity says offline: then it waits for online. */
  function startSave() {
    if (!online) {
      if (!waitingForNetwork) {
        waitingForNetwork = true;
        publish();
      }
      return;
    }
    waitingForNetwork = false;
    void run();
  }

  /** Arms the idle timer once, when work is waiting and nothing else will start a save. */
  function armIfWaiting() {
    if (!schedulable() || idleTimer || maxTimer) return;
    const state = controller.getState();
    if (state.disposed || state.refusal) return;
    // After a refusal, only a snapshot newer than the refused one is work.
    const after = Math.max(state.confirmedSequence, refused?.sequence ?? 0);
    if (state.changed || state.sequence > after) {
      idleTimer = setTimeout(onDue, timing.serverDebounceMs);
    }
  }

  function run(): Promise<void> {
    if (running) return running;
    running = save().finally(() => {
      running = null;
      afterRecoveryWork();
      if (disposed || phase !== "idle") return;
      if (due) {
        due = false;
        startSave();
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
    // A block is not a network failure: nothing is retried from it.
    if (next === "blocked") endEpisode();
    publish();
  }

  /**
   * Refused for certain (A2.3B.2B.3): the claim is released and the refusal
   * queued into the draft (`refuseSave`), and the block waits for a newer
   * snapshot. One already waiting (made while this was in flight) is
   * scheduled now, since the timers were cleared.
   */
  function stopRefused(
    sequence: number,
    refusal: Refusal,
    predicted: JSONContent | null,
    origin: "server" | "local",
  ) {
    controller.refuseSave(sequence, { code: refusal.code });
    refused = { sequence, predicted, outcome: refusal };
    submission = null;
    stop("blocked", "refused", origin);
    armIfWaiting();
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
    // From a refusal (A2.3B.2B.3), a save that finds nothing newer goes back to it, never to idle.
    const resuming = resumable();
    due = false;
    // Whatever was waiting for online is this save now.
    waitingForNetwork = false;
    phase = "preparing";
    publish();

    const back = () => {
      phase = resuming ? "blocked" : "idle";
      endEpisode();
      publish();
    };
    const claimed = await claim();
    if (disposed) {
      if (claimed) controller.releaseSave(claimed.sequence);
      return;
    }
    if (!claimed) return back();
    if (refused && claimed.sequence <= refused.sequence) {
      // The refused snapshot itself (an edit back to it): never sent again.
      controller.releaseSave(claimed.sequence);
      return back();
    }
    if (claimed.expectedRevision !== revision) {
      controller.releaseSave(claimed.sequence);
      stop("blocked", "revision_mismatch", "local");
      return;
    }
    // What the server would store for it, by the server's own function. What it refuses is never sent.
    const predicted = canonicalDocument(claimed.content);
    if (!predicted.ok) {
      const refusal: Refusal =
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
      outcome = refusal;
      stopRefused(claimed.sequence, refusal, null, "local");
      return;
    }
    if (
      refused?.predicted &&
      jsonEqual(predicted.content as JsonValue, refused.predicted as JsonValue)
    ) {
      // The content the server refused, under a new sequence: foreseen, never sent again.
      const again: Refusal = { ...refused.outcome, sequence: claimed.sequence };
      outcome = again;
      stopRefused(claimed.sequence, again, refused.predicted, "local");
      return;
    }

    const sent: Submission = {
      sequence: claimed.sequence,
      expectedRevision: claimed.expectedRevision,
      bytes: claimed.bytes,
      content: claimed.content,
      predicted: predicted.content,
      base: { content: canonicalBase, revision },
    };
    submission = sent;
    retried = null;
    reconciliation = null;
    // Leaving a refusal: only now, with a request actually sent.
    block = null;
    phase = "saving";
    publish();

    // No answer in time is no answer: `uncertain`, read back, never sent again blindly.
    const answer = await timed(
      () =>
        transport.save({
          outlineId: controller.outlineId,
          content: sent.content,
          expectedRevision: sent.expectedRevision,
          sequence: sent.sequence,
        }),
      network.saveTimeoutMs,
      () => unansweredOutcome(sent.sequence),
    );
    settle(sent, answer);
    // Unknown: read once what the server holds (offline, once online again).
    // (`settle` moved the phase; TypeScript still narrows it to `saving`.)
    if (!disposed && (phase as Settled) === "reconciling") firstRead(sent);
  }

  /**
   * Waits for `start()`'s answer at most `ms` (A2.3B.2C), then answers
   * `fallback()`; a throw or a rejection is `fallback()` too. Never rejects.
   * The late answer is dropped: it never reaches the state. Once disposed,
   * there is no timeout, so a late answer is still what is given.
   */
  function timed<T>(start: () => Promise<T>, ms: number, fallback: () => T): Promise<T> {
    return new Promise<T>((resolve) => {
      let done = false;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const finish = (value: T) => {
        if (done) return;
        done = true;
        if (timer !== null) {
          clearTimeout(timer);
          timeouts.delete(timer);
        }
        resolve(value);
      };
      if (!disposed) {
        const armed = setTimeout(() => {
          timeouts.delete(armed);
          timer = null;
          finish(fallback());
        }, ms);
        timer = armed;
        timeouts.add(armed);
      }
      let pending: Promise<T>;
      try {
        pending = start();
      } catch {
        pending = Promise.resolve(fallback());
      }
      Promise.resolve(pending).then(finish, () => finish(fallback()));
    });
  }

  /** What the answer to `sent` means. Only `sent`'s own answer can confirm anything. */
  function settle(sent: Submission, answer: DocumentSaveOutcome) {
    const own = typeof answer === "object" && answer !== null && answer.sequence === sent.sequence;
    outcome = own ? answer : unansweredOutcome(sent.sequence);
    // A save's own retries (`failed`) go on only while it keeps failing for certain.
    if (episode?.kind === "save" && !(own && answer.kind === "failed" && !answer.uncertain)) {
      endEpisode();
    }
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
        settleConfirmed(sent, answer.revision);
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
      // `outcome` keeps which one (stale or missing, invalid or too_large). A first
      // attempt's `stale` is definite: nothing else of this session was unresolved.
      // Conflicts and refusals are recorded in the draft (A2.3B.2B.3).
      case "conflict":
        controller.refuseSave(sent.sequence, { code: answer.code, revision: answer.revision });
        submission = null;
        stop("blocked", "conflict", "server");
        return;
      case "refused":
        stopRefused(sent.sequence, answer, sent.predicted, "server");
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

  /**
   * Runs `work` as the one read or retry in flight. `inFlight` is set before
   * `work` begins, so anyone told of its state and asking again gets this
   * promise rather than a second request. `work` never rejects.
   */
  function single(work: () => Promise<void>): Promise<NetworkState> {
    let done!: (state: NetworkState) => void;
    const promise = new Promise<NetworkState>((resolve) => {
      done = resolve;
    });
    inFlight = promise;
    void work()
      .catch(() => undefined)
      .then(() => {
        if (inFlight === promise) inFlight = null;
        afterRecoveryWork();
        done(getState());
      });
    return promise;
  }

  function reconcile(): Promise<NetworkState> {
    if (inFlight) return inFlight;
    if (disposed || phase !== "reconciling" || submission === null) {
      return Promise.resolve(getState());
    }
    const held = submission;
    // Any read takes the place of the automatic one waiting (its count is kept).
    if (episode?.key === held) markRunning(episode);
    return single(async () => {
      await readBack(held);
      // The base is still at R0: the one conditional retry, if it has not been sent (A2.3B.2B.2).
      if (retryable(held)) await retryBack(held);
    });
  }

  async function readBack(held: Submission): Promise<void> {
    readInFlight = true;
    publish();
    // Always after a tick, even if the transport throws at once: `inFlight` is set by then.
    // No answer in time is a failed read, never a sign that the document is gone.
    const answer = await timed<DocumentReadOutcome>(
      () => Promise.resolve().then(() => transport.read(controller.outlineId)),
      network.readTimeoutMs,
      () => ({ kind: "failed" }),
    );
    readInFlight = false;
    // Only the submission read for is settled; nothing else can replace it while it is held.
    if (submission === held) classify(held, answer);
    else publish();
  }

  /**
   * Whether `held` may be sent once more (A2.3B.2B.2): still the save held,
   * still `reconciling`, its latest read found the base it was made against
   * at R0, and its one retry not yet spent.
   */
  function retryable(held: Submission): boolean {
    return (
      !disposed &&
      phase === "reconciling" &&
      submission === held &&
      retried !== held &&
      !readInFlight &&
      !retryInFlight &&
      reconciliation?.sequence === held.sequence &&
      reconciliation.result === "unchanged"
    );
  }

  function retryUnchanged(): Promise<NetworkState> {
    if (inFlight) return inFlight;
    if (submission === null || !retryable(submission)) return Promise.resolve(getState());
    const held = submission;
    return single(() => retryBack(held));
  }

  /**
   * The conditional retry: exactly what was sent, against the same revision,
   * under the same claim. `updateDocument` writes only at R0, so this and the
   * original request can never both be written. Anything short of a
   * confirmation is read back once; nothing here sends a third time.
   */
  async function retryBack(held: Submission): Promise<void> {
    retried = held;
    retryInFlight = true;
    publish();
    const answer = await timed(
      () =>
        Promise.resolve().then(() =>
          transport.save({
            outlineId: controller.outlineId,
            content: held.content,
            expectedRevision: held.expectedRevision,
            sequence: held.sequence,
          }),
        ),
      network.saveTimeoutMs,
      () => unansweredOutcome(held.sequence),
    );
    retryInFlight = false;
    if (submission !== held) {
      publish();
      return;
    }
    // `settleRetry` tells listeners of what it settles; a read back tells them as it starts.
    const readAgain = settleRetry(held, answer);
    if (readAgain && !disposed && phase === "reconciling" && submission === held) {
      await readBack(held);
    }
  }

  /**
   * What the retry's answer means; true when it must be read back. Only a
   * confirmation at R0 + 1 settles it. A `stale` answer is not a conflict:
   * the original request may be what moved the revision. A refusal says what
   * the server does now, not that the original can never be written. Released
   * only when the document is gone; an account that may not save stops it,
   * holding the claim.
   */
  function settleRetry(held: Submission, answer: DocumentSaveOutcome): boolean {
    const own = typeof answer === "object" && answer !== null && answer.sequence === held.sequence;
    outcome = own ? answer : unansweredOutcome(held.sequence);
    if (!own) return true;
    switch (answer.kind) {
      case "confirmed":
        if (
          !Number.isSafeInteger(answer.revision) ||
          answer.revision !== held.expectedRevision + 1
        ) {
          return true;
        }
        if (!controller.confirmSave(held.sequence, answer.revision)) {
          block = { reason: "rejected_confirmation", origin: "local" };
          return true;
        }
        settleConfirmed(held, answer.revision);
        armIfWaiting();
        return false;
      case "conflict":
        if (answer.code === "missing") {
          release(held, { code: "missing" });
          return false;
        }
        return true;
      case "unauthorized":
        stop("blocked", "unauthorized", "server");
        return false;
      default:
        return true;
    }
  }

  /** The server confirmed `sent` at `confirmed` (= R0 + 1) and the controller took it. */
  function settleConfirmed(sent: Submission, confirmed: number) {
    endEpisode();
    revision = confirmed;
    confirmedSequence = sent.sequence;
    base = { content: sent.predicted, revision: confirmed };
    canonicalBase = sent.predicted;
    baseInfo = { revision: confirmed, provenance: "confirmed", canonical: true };
    submission = null;
    refused = null;
    block = null;
    phase = "idle";
    publish();
  }

  /** What a read says of `held`; see the module comment. Never sends. */
  function classify(held: Submission, answer: DocumentReadOutcome) {
    const r0 = held.expectedRevision;
    const record = (result: Reconciliation["result"], found: Partial<Reconciliation> = {}) => {
      reconciliation = {
        sequence: held.sequence,
        result,
        revision: null,
        submitted: null,
        base: null,
        equivalent: jsonEqual(held.predicted as JsonValue, held.base.content as JsonValue),
        ...found,
      };
    };
    const kind = typeof answer === "object" && answer !== null ? answer.kind : undefined;

    switch (kind) {
      case "found": {
        const { content, revision: r1 } = answer as Extract<DocumentReadOutcome, { kind: "found" }>;
        if (!Number.isSafeInteger(r1) || r1 < 0 || !isObject(content)) {
          // Not an answer that can be built on.
          record("failed");
          return hold();
        }
        const match = matcher(content);
        if (r1 > r0) {
          const submitted = match(held.predicted);
          const same = submitted === "exact" || submitted === "normalized";
          if (r1 === r0 + 1 && same) {
            // The server holds what was sent. `saved` only once the controller takes it.
            if (!controller.confirmSave(held.sequence, r1)) {
              record("unsettled", { revision: r1, submitted });
              block = { reason: "rejected_confirmation", origin: "local" };
              return hold();
            }
            record("saved", { revision: r1, submitted });
            return settleSaved(held, r1, content, submitted);
          }
          if (r1 === r0 + 1 && submitted === "unknown") {
            record("unverifiable", { revision: r1, submitted });
            return hold();
          }
          // Moved on past what this request named: it can never be written now.
          record("conflict", { revision: r1, submitted });
          return release(held, { code: "stale", revision: r1 });
        }
        if (r1 === r0) {
          const submitted = match(held.predicted);
          const onBase = match(held.base.content);
          const unchanged = onBase === "exact" || onBase === "normalized";
          record(unchanged ? "unchanged" : "diverged", { revision: r1, submitted, base: onBase });
          return hold();
        }
        // Below the revision it was made against: never confirmed, never sent over.
        record("diverged", { revision: r1 });
        return hold();
      }
      case "missing":
        record("missing");
        return release(held, { code: "missing" });
      case "unreadable": {
        const { revision: stored } = answer as Extract<DocumentReadOutcome, { kind: "unreadable" }>;
        const r1 =
          Number.isSafeInteger(stored) && (stored as number) >= 0 ? (stored as number) : null;
        record("unreadable", { revision: r1 });
        return r1 !== null && r1 > r0 ? release(held, { code: "stale", revision: r1 }) : hold();
      }
      case "unauthorized":
        // The request may still have been written: the claim stays, and nothing more is asked.
        record("unauthorized");
        return stop("blocked", "unauthorized", "server");
      default:
        record("failed");
        return hold();
    }
  }

  /** Still unknown: the claim and submission stay, nothing is sent. */
  function hold() {
    publish();
  }

  /**
   * The request can never be written: the claim is released, the conflict
   * recorded in the draft (A2.3B.2B.3), and nothing more is sent.
   */
  function release(held: Submission, refusal: SaveRefusal) {
    controller.refuseSave(held.sequence, refusal);
    submission = null;
    stop("blocked", "conflict", "server");
  }

  /** The server holds what was sent, at R0 + 1, and the controller took it: the read is the new base. */
  function settleSaved(
    held: Submission,
    readRevision: number,
    content: JSONContent,
    submitted: ReconciliationMatch,
  ) {
    endEpisode();
    revision = readRevision;
    confirmedSequence = held.sequence;
    base = { content, revision: readRevision };
    // Equal to what was read, in the browser's canonical form.
    canonicalBase = held.predicted;
    baseInfo = { revision: readRevision, provenance: "server", canonical: submitted === "exact" };
    submission = null;
    refused = null;
    block = null;
    phase = "idle";
    publish();
    armIfWaiting();
  }

  async function saveNow(): Promise<NetworkState> {
    if (disposed) return getState();
    if (phase === "preparing" || phase === "saving") {
      due = true;
      await running;
      return getState();
    }
    if (phase !== "idle" && !resumable()) return getState();
    clearTimers();
    if (!online) {
      // Offline, it waits for online like a save that fell due.
      startSave();
      return getState();
    }
    waitingForNetwork = false;
    await run();
    return getState();
  }

  async function retry(): Promise<NetworkState> {
    if (disposed || phase !== "failed") return getState();
    if (episode?.kind === "save") markRunning(episode);
    phase = "idle";
    block = null;
    await run();
    return getState();
  }

  function recover(): Promise<NetworkState> {
    if (disposed || (phase !== "reconciling" && phase !== "failed")) {
      return Promise.resolve(getState());
    }
    // Only the person renews the automatic attempts, and only once they are spent.
    if (episode?.status === "exhausted") episode.retries = 0;
    return phase === "failed" ? retry() : reconcile();
  }

  // --- Automatic retries (A2.3B.2C) ---

  /** Ends the current episode and its timer. */
  function endEpisode() {
    if (!episode) return;
    if (episode.timer) clearTimeout(episode.timer);
    episode = null;
  }

  /** Marks `ep` as having an attempt in flight, cancelling its timer. Counts nothing. */
  function markRunning(ep: Episode) {
    if (ep.timer) clearTimeout(ep.timer);
    ep.timer = null;
    ep.status = "running";
    ep.delayMs = null;
    ep.free = false;
  }

  /** The episode for `key`, made if there is none or it was for something else. */
  function episodeFor(kind: Episode["kind"], key: object): Episode {
    if (episode && episode.kind === kind && episode.key === key) return episode;
    endEpisode();
    episode = { kind, key, retries: 0, status: "running", delayMs: null, timer: null, free: false };
    return episode;
  }

  /** The first read of a held save: now, or once online, uncounted. */
  function firstRead(held: Submission) {
    if (online) {
      void reconcile();
      return;
    }
    const ep = episodeFor("read", held);
    ep.free = true;
    ep.status = "offline";
    publish();
  }

  /**
   * Whether a held save is to be read again by itself: its latest read
   * failed, or found the base still at R0 once its conditional retry was
   * spent (the owner's decision). Nothing a read answered otherwise
   * (`diverged`, `unverifiable`, `unreadable`, `unsettled`): those wait for
   * a person.
   */
  function readAgain(held: Submission): boolean {
    if (reconciliation?.sequence !== held.sequence) return false;
    return (
      reconciliation.result === "failed" ||
      (reconciliation.result === "unchanged" && retried === held)
    );
  }

  /**
   * Once a read, a retry, or a save has settled with nothing else in flight:
   * arms the next automatic attempt if one is due, or ends the episode.
   */
  function afterRecoveryWork() {
    if (disposed || inFlight || running) return;
    const before = episode && { status: episode.status, retries: episode.retries };
    if (phase === "reconciling" && submission !== null) {
      // A first read still waiting for online stays waiting.
      if (episode?.key === submission && episode.free) return;
      if (readAgain(submission)) schedule(episodeFor("read", submission));
      else endEpisode();
    } else if (phase === "failed") {
      schedule(episode?.kind === "save" ? episode : episodeFor("save", {}));
    } else {
      endEpisode();
    }
    if (before?.status !== episode?.status || before?.retries !== episode?.retries) publish();
  }

  /** Arms the next attempt of `ep` after its attempt settled, unless none is left. */
  function schedule(ep: Episode) {
    // Only from an attempt that has just settled: never a second timer.
    if (ep.status !== "running") return;
    if (ep.retries >= network.maxRetries) {
      ep.status = "exhausted";
      return;
    }
    if (!online) {
      ep.status = "offline";
      return;
    }
    const delay = retryDelay(network, ep.retries);
    ep.status = "scheduled";
    ep.delayMs = delay;
    const timer = setTimeout(() => {
      if (ep.timer !== timer) return;
      ep.timer = null;
      if (disposed || episode !== ep) return;
      if (!online) {
        ep.status = "offline";
        ep.delayMs = null;
        publish();
        return;
      }
      attempt(ep);
    }, delay);
    ep.timer = timer;
  }

  /** One automatic attempt of `ep`, now: counted, unless it is the deferred first one. */
  function attempt(ep: Episode) {
    if (disposed || episode !== ep || inFlight || running) return;
    const free = ep.free;
    markRunning(ep);
    if (!free) ep.retries += 1;
    if (ep.kind === "read") {
      if (phase === "reconciling" && submission === ep.key) {
        void reconcile();
        return;
      }
    } else if (phase === "failed") {
      phase = "idle";
      block = null;
      void run();
      return;
    }
    endEpisode();
    publish();
  }

  /** What the connectivity said. The same news again changes nothing. */
  function onConnectivity(next: boolean) {
    if (disposed || next === online) return;
    online = next;
    if (!online) {
      // The next automatic attempt waits for online; nothing in flight is cancelled.
      if (episode?.status === "scheduled") {
        if (episode.timer) clearTimeout(episode.timer);
        episode.timer = null;
        episode.status = "offline";
        episode.delayMs = null;
      }
      publish();
      return;
    }
    // While something is in flight, it arms what follows when it settles.
    if (!inFlight && !running) {
      if (episode && (episode.status === "offline" || episode.status === "scheduled")) {
        attempt(episode);
        return;
      }
      if (waitingForNetwork && (phase === "idle" || resumable())) {
        startSave();
        return;
      }
    }
    publish();
  }

  function dispose() {
    if (disposed) return;
    clearTimers();
    due = false;
    // Nothing more is tried; a request in flight may still answer, and nothing follows it.
    endEpisode();
    // A request in flight is no longer timed out: its own answer, however late, is what counts.
    for (const timer of timeouts) clearTimeout(timer);
    timeouts.clear();
    unsubscribeConnectivity();
    unsubscribeChanges();
    unsubscribeState();
    const state = { ...getState(), phase: "disposed" as const };
    disposed = true;
    // The last state is told once; nothing after it.
    tell(state);
    listeners.clear();
  }

  // Connectivity first: if it throws, nothing is registered yet and its error is the caller's.
  const unsubscribeConnectivity = connectivity.subscribe((next) => onConnectivity(next !== false));
  let unsubscribeChanges = () => {};
  let unsubscribeState = () => {};
  try {
    unsubscribeChanges = controller.onDocumentChange(onChange);
    unsubscribeState = controller.subscribe((state) => {
      if (state.disposed) dispose();
    });
  } catch (error) {
    // A coordinator that was never made leaves nothing behind.
    unsubscribeChanges();
    unsubscribeConnectivity();
    clearTimers();
    throw error;
  }

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
    reconcile,
    retryUnchanged,
    recover,
    getBase: () => base,
    getSubmission: () => submission,
    dispose,
  };
}
