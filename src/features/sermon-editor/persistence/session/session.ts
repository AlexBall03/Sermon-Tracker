import { alwaysOnline, type Connectivity } from "../autosave/connectivity";
import {
  createAutosaveController,
  type AutosaveController,
  type DraftStorage,
} from "../autosave/controller";
import { createSaveCoordinator, type SaveCoordinator } from "../autosave/coordinator";
import {
  autosaveStatus,
  jsonEqual,
  type AutosaveTiming,
  type DocumentSource,
  type NetworkRecoveryTiming,
  type NetworkState,
  type ServerSaveTiming,
} from "../autosave/model";
import type { DocumentTransport } from "../autosave/transport";
import { canonicalDocument } from "../canonical";
import type { JsonValue } from "../json";
import { draftInputs } from "../recovery/model";
import { DraftStorageError, listDrafts } from "../recovery/store";
import { browserChannel, openOwnershipChannel, type ChannelFactory } from "./channel";
import { bindPageLifecycle, browserPage, type PageLifecycleTarget } from "./lifecycle";
import {
  isTerminal,
  lockName,
  ownershipTiming,
  type EditorSessionState,
  type OwnershipTiming,
  type VerifiedBase,
} from "./model";
import {
  browserLocks,
  createOwnership,
  type LockManagerLike,
  type Ownership,
  type ReleaseRegistry,
} from "./ownership";
import { assessRecovery } from "./recovery-gate";

/*
 * An editor session (A2.3B.3): one tab's right to edit and save one outline
 * for one account, around the autosave controller and save coordinator,
 * which it creates and ends and otherwise leaves exactly as they are.
 *
 * - Opening: take the outline's lock if it is free (`read_only` otherwise),
 *   read the server's document through the transport's GET, and check the
 *   device's drafts (`assessRecovery`). Only then `ready`; the host opens the
 *   editor from that `base` and calls `attach`, which starts autosave.
 * - Writing is allowed only while `canEdit()` (the editor's write guard asks
 *   it), and saving only while the session is `active` or `relinquishing`,
 *   holds the lock, and was opened for the account still signed in. The
 *   coordinator exists only then; the transport it is given refuses a save at
 *   any other moment as "not sent", and is never the way a save is stopped.
 * - Nothing is transferred between sessions. A claim is never adopted,
 *   resent, or released by another session; an earlier session's words cross
 *   only as its recovery draft, which the gate keeps from being edited over.
 * - Takeover is asked for, never taken: the editing tab keeps its newest words
 *   on the device (and saves them if it can) before it lets go; a tab that
 *   does not answer is never forced. A grant only starts verification.
 * - The end of a session, whatever the reason: no new request (the
 *   coordinator is disposed), the last snapshot taken and its IndexedDB work
 *   finished (the controller is disposed), and only then the lock released.
 *   A request already sent may still be answered; its answer reaches only
 *   the controller that sent it.
 * Browser APIs (Web Locks, BroadcastChannel, the page's events) are injected;
 * the defaults are the browser's. It logs nothing and sends no content
 * between tabs.
 */

/** Who is signed in, as the host knows it (A3: Clerk's user). Any change ends the session. */
export type IdentitySignal = {
  /** The signed-in identity now, or null when signed out. */
  current(): string | null;
  /** Calls `listener` when it may have changed. Returns its unsubscribe. */
  subscribe(listener: () => void): () => void;
};

export type EditorSessionOptions = {
  /** The application user ID (`users.id`): drafts, the lock, and the controller are scoped to it. */
  owner: string;
  outlineId: string;
  identity: IdentitySignal;
  /** The GET read (A2.3B.2D) and the save action: `documentTransport`. */
  transport: DocumentTransport;
  connectivity?: Connectivity;
  /** `navigator.locks` by default; null means none (the session is `unavailable`). */
  locks?: LockManagerLike | null;
  channel?: ChannelFactory;
  /** The page's events; `{ document, window }` by default, null for none. */
  page?: PageLifecycleTarget | null;
  /** This tab's registry of ending locks (tests give each pretend tab its own). */
  releases?: ReleaseRegistry;
  listDrafts?: typeof listDrafts;
  timing?: Partial<OwnershipTiming>;
  autosave?: {
    timing?: Partial<AutosaveTiming>;
    storage?: DraftStorage;
    server?: Partial<ServerSaveTiming>;
    recovery?: Partial<NetworkRecoveryTiming>;
  };
  newId?: () => string;
};

export type AttachResult =
  | { ok: true }
  | {
      ok: false;
      /**
       * `state`: not `ready`. `identity`: the account changed. `mismatch`: the
       * editor does not hold the verified base. `failed`: autosave would not start.
       */
      reason: "state" | "identity" | "mismatch" | "failed";
    };

export type SessionAutosave = { controller: AutosaveController; coordinator: SaveCoordinator };

export type EditorSession = {
  readonly owner: string;
  readonly outlineId: string;
  getState(): EditorSessionState;
  /** Called with each new state; the terminal one is the last. */
  subscribe(listener: (state: EditorSessionState) => void): () => void;
  /** Whether the editor may change the document now: for the write guard. */
  canEdit(): boolean;
  /** In `ready`, with the editor holding `base`: starts autosave and becomes `active`. */
  attach(source: DocumentSource): AttachResult;
  /** "Edit here", from `read_only`: asks the editing tab to hand over. */
  requestTakeover(): void;
  /** From `recovery_required` or `verification_failed`: reads and checks again. Never by itself. */
  recheck(): void;
  /** The controller and coordinator while `active` or `relinquishing`, for the indicator. */
  getAutosave(): SessionAutosave | null;
  /** Ends the session (idempotent). Resolves once the lock is released. */
  dispose(): Promise<void>;
};

const busyPhases = new Set<NetworkState["phase"]>(["preparing", "saving"]);

/** Resolves when the coordinator has no save being prepared or in flight, or after `ms`. */
function quiet(coordinator: SaveCoordinator, ms: number): Promise<void> {
  return new Promise((resolve) => {
    if (!busyPhases.has(coordinator.getState().phase) || ms <= 0) {
      resolve();
      return;
    }
    let unsubscribe: (() => void) | null = null;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      unsubscribe?.();
      resolve();
    };
    const timer = setTimeout(finish, ms);
    unsubscribe = coordinator.subscribe((state) => {
      if (!busyPhases.has(state.phase)) finish();
    });
    if (finished) unsubscribe();
  });
}

/** `promise`, or nothing after `ms`: a waiting limit, never an answer. */
function within(promise: Promise<unknown>, ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    void promise.then(
      () => {
        clearTimeout(timer);
        resolve();
      },
      () => {
        clearTimeout(timer);
        resolve();
      },
    );
  });
}

export function createEditorSession(options: EditorSessionOptions): EditorSession {
  const ownerCheck = draftInputs.owner.safeParse(options.owner);
  const outlineCheck = draftInputs.outlineId.safeParse(options.outlineId);
  if (!ownerCheck.success || !outlineCheck.success) throw new DraftStorageError("invalid");
  const owner = ownerCheck.data;
  const outlineId = outlineCheck.data;
  const timing = { ...ownershipTiming, ...options.timing };
  const { identity, transport } = options;
  const connectivity = options.connectivity ?? alwaysOnline;
  const list = options.listDrafts ?? listDrafts;
  const newId = options.newId ?? (() => crypto.randomUUID());

  let identityKey: string | null = null;
  try {
    identityKey = identity.current();
  } catch {
    identityKey = null;
  }
  const locks = options.locks === undefined ? browserLocks() : options.locks;
  const ownership: Ownership | null = locks
    ? createOwnership({ locks, name: lockName(owner, outlineId), releases: options.releases })
    : null;

  let state: EditorSessionState = { kind: "acquiring" };
  /** Raised on every change of course: an answer begun before it is not acted on. */
  let generation = 0;
  let base: VerifiedBase | null = null;
  let autosave: SessionAutosave | null = null;
  let takeover: {
    requestId: string;
    abort: AbortController;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;
  /** Takeover requests waiting for this tab's decision while it relinquishes. */
  let answers: string[] = [];
  let ending: Promise<void> | null = null;
  const listeners = new Set<(state: EditorSessionState) => void>();

  function publish() {
    for (const listener of [...listeners]) {
      try {
        listener(state);
      } catch (error) {
        queueMicrotask(() => {
          throw error;
        });
      }
    }
  }

  function set(next: EditorSessionState) {
    if (isTerminal(state)) return;
    state = next;
    publish();
  }

  function identityOk() {
    if (identityKey === null) return false;
    try {
      return identity.current() === identityKey;
    } catch {
      return false;
    }
  }

  const held = () => ownership?.held() === true;

  /** May a save be sent now: the only sessions that save, holding the lock, for the same account. */
  const mayWrite = () =>
    (state.kind === "active" || state.kind === "relinquishing") && held() && identityOk();

  /** The transport autosave is given: a save outside `mayWrite` is not sent, and said so. */
  const guarded: DocumentTransport = {
    save(request) {
      if (!mayWrite()) {
        return Promise.resolve({ kind: "failed", sequence: request.sequence, uncertain: false });
      }
      return transport.save(request);
    },
    read: (id) => transport.read(id),
  };

  // The ownership channel and the page's events.
  const channel = openOwnershipChannel({
    factory: options.channel ?? browserChannel,
    owner,
    outlineId,
    onRequest,
    onAnswer,
  });
  const page = options.page === undefined ? browserPage() : options.page;
  const unbindPage = page
    ? bindPageLifecycle(page, {
        hidden,
        visible: checkIdentity,
        pagehide: () => {
          // Hidden for good, or into the back-forward cache: a restored page cannot trust its base.
          if (!isTerminal(state)) void end({ kind: "lost", reason: "suspended" });
        },
        pageshow: checkIdentity,
      })
    : () => {};
  let unbindIdentity: () => void = () => {};
  try {
    unbindIdentity = identity.subscribe(checkIdentity);
  } catch {
    identityKey = null;
  }
  ownership?.onLost(() => {
    if (!isTerminal(state)) void end({ kind: "lost", reason: "lockLost" });
  });

  /**
   * The end of the session, in order: nothing new is sent (the coordinator is
   * disposed), the last snapshot is taken and every IndexedDB operation
   * decided so far finishes (the controller is disposed), and only then is
   * the lock released. Never awaited by the browser: a page that is frozen or
   * ended stops wherever it is, and the browser frees its lock.
   */
  function end(final: EditorSessionState): Promise<void> {
    if (ending) return ending;
    generation += 1;
    if (!isTerminal(state)) {
      state = final;
      publish();
    }
    listeners.clear();
    if (takeover) {
      clearTimeout(takeover.timer);
      takeover.abort.abort();
      takeover = null;
    }
    answers = [];
    unbindPage();
    unbindIdentity();
    channel.close();
    const current = autosave;
    autosave = null;
    current?.coordinator.dispose();
    const local = current ? current.controller.dispose() : Promise.resolve();
    ending = ownership ? ownership.dispose(local) : local;
    return ending;
  }

  function checkIdentity() {
    if (!isTerminal(state) && !identityOk()) void end({ kind: "identity_invalidated" });
  }

  async function open() {
    const gen = (generation += 1);
    const result = await ownership!.tryAcquire();
    if (gen !== generation) return;
    if (result === "held") return verify(gen);
    if (result === "busy") return set({ kind: "read_only", takeover: "available" });
    if (result === "unavailable") void end({ kind: "unavailable", reason: "failed" });
  }

  /** Both conditions, with the lock held: the server's document, then the device's drafts. */
  async function verify(gen: number) {
    set({ kind: "verifying" });
    if (!identityOk()) return void end({ kind: "identity_invalidated" });
    const read = await transport.read(outlineId).catch(() => ({ kind: "failed" as const }));
    if (gen !== generation || isTerminal(state)) return;
    if (read.kind !== "found") {
      const reason =
        read.kind === "failed" ? (connectivity.online() ? "failed" : "offline") : read.kind;
      return set({ kind: "verification_failed", reason });
    }
    if (
      !canonicalDocument(read.content).ok ||
      !draftInputs.revision.safeParse(read.revision).success
    ) {
      return set({ kind: "verification_failed", reason: "unreadable" });
    }
    const verified: VerifiedBase = { content: read.content, revision: read.revision };
    const assessment = await assessRecovery({ owner, outlineId, base: read.content, list });
    if (gen !== generation || isTerminal(state)) return;
    if (!identityOk()) return void end({ kind: "identity_invalidated" });
    if (!held()) return void end({ kind: "lost", reason: "lockLost" });
    if (!assessment.clear) {
      const block =
        assessment.reason === "drafts"
          ? { reason: "drafts" as const, candidates: assessment.candidates }
          : { reason: "inspection_failed" as const, error: assessment.error };
      return set({ kind: "recovery_required", base: verified, ...block });
    }
    base = verified;
    set({ kind: "ready", base: verified });
  }

  function attach(source: DocumentSource): AttachResult {
    if (state.kind !== "ready" || !base) return { ok: false, reason: "state" };
    if (!identityOk()) {
      void end({ kind: "identity_invalidated" });
      return { ok: false, reason: "identity" };
    }
    if (!held()) {
      void end({ kind: "lost", reason: "lockLost" });
      return { ok: false, reason: "state" };
    }
    // The editor must hold what was verified: autosave's baseline is the editor's document.
    let opened;
    try {
      opened = canonicalDocument(source.read());
    } catch {
      return { ok: false, reason: "failed" };
    }
    const server = canonicalDocument(base.content);
    if (
      !opened.ok ||
      !server.ok ||
      !jsonEqual(opened.content as JsonValue, server.content as JsonValue)
    ) {
      return { ok: false, reason: "mismatch" };
    }
    let controller: AutosaveController | null = null;
    try {
      controller = createAutosaveController({
        owner,
        outlineId,
        revision: base.revision,
        source,
        timing: options.autosave?.timing,
        storage: options.autosave?.storage,
      });
      const coordinator = createSaveCoordinator({
        controller,
        transport: guarded,
        base,
        timing: options.autosave?.server,
        recovery: options.autosave?.recovery,
        connectivity,
      });
      autosave = { controller, coordinator };
    } catch {
      void controller?.dispose();
      return { ok: false, reason: "failed" };
    }
    set({ kind: "active", base });
    return { ok: true };
  }

  /**
   * A save the page's lifecycle asks for: only by an active session, for
   * the account still signed in, holding the lock, and only when no save is
   * being prepared, in flight, or unresolved. Never a second request.
   */
  function lifecycleSave() {
    if (state.kind !== "active" || !autosave) return;
    if (!identityOk()) return void end({ kind: "identity_invalidated" });
    if (!held()) return;
    const phase = autosave.coordinator.getState().phase;
    if (phase !== "idle" && phase !== "scheduled") return;
    void autosave.coordinator.saveNow();
  }

  function hidden() {
    if (state.kind !== "active" || !autosave) return;
    // Best effort: a hidden page may be frozen before IndexedDB answers.
    void autosave.controller.flush();
    lifecycleSave();
  }

  function requestTakeover() {
    if (state.kind !== "read_only" || !ownership) return;
    if (!identityOk()) return void end({ kind: "identity_invalidated" });
    const gen = (generation += 1);
    const requestId = newId();
    const abort = new AbortController();
    const timer = setTimeout(() => {
      // A waiting limit: the other tab may still be saving. Nothing is assumed of it.
      if (gen !== generation) return;
      generation += 1;
      takeover = null;
      abort.abort();
      set({ kind: "read_only", takeover: "unanswered" });
    }, timing.takeoverAnswerMs);
    takeover = { requestId, abort, timer };
    set({ kind: "takeover_pending" });
    channel.request(requestId);
    void ownership.waitFor(abort.signal).then(async (result) => {
      if (gen !== generation) {
        // Abandoned (timed out, declined, or ended) as it was granted: given straight back.
        if (result === "held" && !isTerminal(state)) await ownership.release();
        return;
      }
      clearTimeout(timer);
      takeover = null;
      // A grant proves only that no other tab here edits: verification decides the rest.
      if (result === "held") return verify(gen);
      if (result === "unavailable") return void end({ kind: "unavailable", reason: "failed" });
      generation += 1;
      set({ kind: "read_only", takeover: "unanswered" });
    });
  }

  function onAnswer(message: {
    requestId: string;
    answer: "releasing" | "declined";
    reason?: "unprotected" | "starting";
  }) {
    // Only a refusal changes anything: a release is learned from the lock itself.
    if (!takeover || takeover.requestId !== message.requestId || message.answer !== "declined")
      return;
    clearTimeout(takeover.timer);
    takeover.abort.abort();
    takeover = null;
    generation += 1;
    set({
      kind: "read_only",
      takeover: "declined",
      ...(message.reason ? { reason: message.reason } : {}),
    });
  }

  function onRequest(requestId: string) {
    switch (state.kind) {
      case "active":
        void relinquish(requestId);
        return;
      case "relinquishing":
        answers.push(requestId);
        return;
      case "ready":
      case "recovery_required":
      case "verification_failed":
        // Nothing edited here: nothing to keep before letting go.
        channel.answer(requestId, "releasing");
        void end({ kind: "lost", reason: "handedOff" });
        return;
      case "verifying":
        channel.answer(requestId, "declined", "starting");
        return;
      default:
        // Not holding the lock: not this session's to answer.
        return;
    }
  }

  /**
   * Hands over to another tab: editing stops at once; the newest words are
   * kept on the device, and saved if a save may start; the decision waits for
   * IndexedDB, never for a call merely made. Words not kept on the device
   * (storage failed, or content that cannot be stored) are not handed over:
   * the request is declined and this tab edits on. A save still unresolved
   * does not hold the handover: its draft stays on the device, its answer
   * still reaches this controller, and the other tab's gate keeps it from
   * being edited over.
   */
  async function relinquish(requestId: string) {
    const current = autosave;
    const opened = base;
    if (!current || !opened) return;
    const gen = generation;
    answers = [requestId];
    set({ kind: "relinquishing" });
    const live = () => gen === generation && state.kind === "relinquishing";
    const { controller, coordinator } = current;
    const started = Date.now();
    const left = () => timing.relinquishSaveMs - (Date.now() - started);

    await controller.flush();
    if (!live()) return;
    await quiet(coordinator, left());
    if (!live()) return;
    const phase = coordinator.getState().phase;
    if ((phase === "idle" || phase === "scheduled") && held() && identityOk()) {
      await within(coordinator.saveNow(), left());
      if (!live()) return;
    }
    // Every draft operation decided so far (the newest words, a confirmation) has finished.
    const local = await controller.flush();
    if (!live()) return;
    const waiting = answers;
    answers = [];
    const status = autosaveStatus(local);
    if (status === "unprotected" || status === "pending") {
      for (const id of waiting) channel.answer(id, "declined", "unprotected");
      if (!identityOk()) void end({ kind: "identity_invalidated" });
      else if (!held()) void end({ kind: "lost", reason: "lockLost" });
      else set({ kind: "active", base: opened });
      return;
    }
    for (const id of waiting) channel.answer(id, "releasing");
    await end({ kind: "lost", reason: "handedOff" });
  }

  function recheck() {
    if (state.kind !== "recovery_required" && state.kind !== "verification_failed") return;
    if (!held()) return void end({ kind: "lost", reason: "lockLost" });
    const gen = (generation += 1);
    void verify(gen);
  }

  if (identityKey === null) void end({ kind: "identity_invalidated" });
  else if (!ownership) void end({ kind: "unavailable", reason: "unsupported" });
  else void open();

  return {
    owner,
    outlineId,
    getState: () => state,
    subscribe(listener) {
      if (isTerminal(state)) return () => {};
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    canEdit: () => state.kind === "active" && held() && identityOk(),
    attach,
    requestTakeover,
    recheck,
    getAutosave: () => autosave,
    dispose: () => end({ kind: "disposed" }),
  };
}
