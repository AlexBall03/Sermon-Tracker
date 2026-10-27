import type { JSONContent } from "@tiptap/core";

import type { JsonValue } from "../json";
import { draftInputs } from "../recovery/model";
import {
  confirmDraft,
  DraftStorageError,
  writeDraft,
  type DraftStorageErrorKind,
} from "../recovery/store";
import { prepareSnapshot } from "../saving";
import {
  autosaveTiming,
  jsonEqual,
  type AutosaveRefusal,
  type AutosaveState,
  type AutosaveTiming,
  type DocumentSource,
} from "./model";

/*
 * The autosave controller (A2.3B.1): one account, one outline, one editor
 * session. It notices changes through a `DocumentSource`, takes a whole
 * snapshot only at a boundary (`autosaveTiming`), and keeps the newest
 * meaningful one as this session's recovery draft (recovery/store.ts). No
 * React, no editor, no network: the save coordinator (coordinator.ts,
 * A2.3B.2A) sends saves through `claimSave` and `confirmSave`, timed by
 * `onDocumentChange`; A3 attaches it to the editor (editor-adapter.ts).
 *
 * Its rules, from the A2.3A review:
 * - One queue. Every draft operation runs on one promise chain, in the order
 *   the controller decides on it; each catches its own failure, so one
 *   failure never stops the next.
 * - One pending write. At most one snapshot waits to be written, always the
 *   newest; a newer one takes its place.
 * - Write ahead. A snapshot can be claimed for a save only once its draft
 *   write has finished (or failed), so its confirmation is queued after it.
 * - A watermark. A confirmation raises `confirmedSequence` before anything is
 *   queued, and a waiting write at or below it is dropped, so a late write
 *   never makes again a draft the server's confirmation cleared.
 * - Nothing is said to be kept before IndexedDB says so.
 *
 * It logs nothing: errors carry kinds and paths, never words.
 */

/** The two draft operations the controller uses; the real store unless a test gives others. */
export type DraftStorage = {
  writeDraft: typeof writeDraft;
  confirmDraft: typeof confirmDraft;
};

/** A snapshot claimed for a save (A2.3B.2): send `content` against `expectedRevision`. */
export type ClaimedSnapshot = {
  sequence: number;
  /** The plain copy (`prepareSnapshot`), ready to send. */
  content: JSONContent;
  bytes: number;
  expectedRevision: number;
};

export type AutosaveController = {
  readonly owner: string;
  readonly outlineId: string;
  /** This session's draft: a UUID made by the controller, never given and never changed. */
  readonly draftId: string;
  getState(): AutosaveState;
  /** Called with each new state until unsubscribed or disposed; never per keystroke. */
  subscribe(listener: (state: AutosaveState) => void): () => void;
  /**
   * Called for every change the source reports, until unsubscribed or
   * disposed (A2.3B.2A): the save coordinator's timers. Carries nothing; the
   * document is read only at a snapshot boundary.
   */
  onDocumentChange(listener: () => void): () => void;
  /**
   * Takes a snapshot now if anything changed, and resolves once every draft
   * operation decided so far has finished, with the state then. Whether the
   * content was kept is in that state (`localSequence`, `storageError`);
   * nothing is reported kept before its write finished.
   */
  flush(): Promise<AutosaveState>;
  /** After a failed write: writes the newest snapshot again, then flushes. The only retry besides a new snapshot. */
  retry(): Promise<AutosaveState>;
  /**
   * For A2.3B.2's saves. The newest snapshot, if it may be sent now: nothing
   * else claimed (one save in flight), not yet confirmed, not the opened
   * document, not too large, and its draft write finished or failed. Null
   * otherwise.
   */
  claimSave(): ClaimedSnapshot | null;
  /**
   * For A2.3B.2's saves: the server holds the claimed snapshot `sequence` at
   * `revision`. Accepted only for the snapshot claimed (false otherwise), so
   * nothing can confirm work that was never sent.
   */
  confirmSave(sequence: number, revision: number): boolean;
  /** For A2.3B.2's saves: the claimed snapshot was not confirmed; it may be claimed again. */
  releaseSave(sequence: number): boolean;
  /**
   * Stops watching: takes a last snapshot of unkept changes, cancels the
   * timers, and publishes nothing more. Draft operations already decided
   * still run (they hold the newest words; a draft left behind is a recovery
   * candidate, never a loss). Resolves when they have; never rejects. Called
   * by itself when the source ends (the editor is destroyed).
   */
  dispose(): Promise<void>;
};

export type AutosaveOptions = {
  /** The application user ID (`users.id`): the draft's scope. */
  owner: string;
  outlineId: string;
  /** The document revision the editor opened. */
  revision: number;
  /** An editor that holds an accepted document (`editorSource`). */
  source: DocumentSource;
  timing?: Partial<AutosaveTiming>;
  storage?: DraftStorage;
};

type Snapshot = {
  sequence: number;
  /** Null only for an opened document that is not plain JSON: anything after it is new. */
  content: JSONContent | null;
  bytes: number;
  refusal: AutosaveRefusal | null;
};

function parsed<T>(
  schema: { safeParse(value: unknown): { success: boolean; data?: T } },
  value: unknown,
): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new DraftStorageError("invalid");
  return result.data as T;
}

/** Makes a controller for an editor that holds an accepted document. Throws `DraftStorageError("invalid")` for a bad owner, outline, or revision. */
export function createAutosaveController(options: AutosaveOptions): AutosaveController {
  const owner = parsed<string>(draftInputs.owner, options.owner);
  const outlineId = parsed<string>(draftInputs.outlineId, options.outlineId);
  const draftId = parsed<string>(draftInputs.draftId, crypto.randomUUID());
  let revision = parsed<number>(draftInputs.revision, options.revision);
  const timing = { ...autosaveTiming, ...options.timing };
  const storage = options.storage ?? { writeDraft, confirmDraft };
  const { source } = options;

  // The document as attached is snapshot 0: never written, only compared with.
  let latest = snapshotOf(0, source.read());
  let refusal: AutosaveRefusal | null = latest.refusal;
  let changed = false;
  let localSequence = 0;
  let confirmedSequence = 0;
  let storageError: DraftStorageErrorKind | null = null;
  let saving: number | null = null;
  let disposed = false;

  let debounce: ReturnType<typeof setTimeout> | null = null;
  let maxWait: ReturnType<typeof setTimeout> | null = null;

  let chain: Promise<void> = Promise.resolve();
  let operations = 0;
  let pendingWrite: Snapshot | null = null;
  let drainQueued = false;
  let writeRunning = false;

  const listeners = new Set<(state: AutosaveState) => void>();
  const changeListeners = new Set<() => void>();

  function snapshotOf(sequence: number, json: JSONContent): Snapshot {
    const prepared = prepareSnapshot(json);
    if (prepared.ok)
      return { sequence, content: prepared.content, bytes: prepared.bytes, refusal: null };
    if (prepared.reason === "too_large") {
      const { bytes, limit } = prepared;
      return {
        sequence,
        content: prepared.content,
        bytes,
        refusal: { reason: "too_large", bytes, limit },
      };
    }
    return {
      sequence,
      content: null,
      bytes: 0,
      refusal: { reason: "unsafe", problem: prepared.problem },
    };
  }

  function getState(): AutosaveState {
    return {
      changed,
      sequence: latest.sequence,
      localSequence,
      confirmedSequence,
      revision,
      local: debounce || maxWait ? "scheduled" : operations > 0 ? "writing" : "idle",
      storageError,
      refusal,
      saving,
      disposed,
    };
  }

  function publish() {
    if (disposed || listeners.size === 0) return;
    const state = getState();
    for (const listener of [...listeners]) {
      try {
        listener(state);
      } catch (error) {
        // A listener's failure is its own; it never stops the controller.
        queueMicrotask(() => {
          throw error;
        });
      }
    }
  }

  function clearTimers() {
    if (debounce) clearTimeout(debounce);
    if (maxWait) clearTimeout(maxWait);
    debounce = null;
    maxWait = null;
  }

  /** Runs `operation` after every operation queued before it. Never rejects. */
  function enqueue(operation: () => Promise<void>): Promise<void> {
    operations += 1;
    const run = chain.then(async () => {
      try {
        await operation();
      } catch {
        // Each operation records its own failure; the queue goes on.
      } finally {
        operations -= 1;
        publish();
      }
    });
    chain = run;
    return run;
  }

  async function drain() {
    drainQueued = false;
    const snapshot = pendingWrite;
    pendingWrite = null;
    // At or below the watermark, the server has it: writing it would make a cleared draft again.
    if (!snapshot?.content || snapshot.sequence <= confirmedSequence) return;
    writeRunning = true;
    publish();
    try {
      await storage.writeDraft(owner, {
        outlineId,
        draftId,
        content: snapshot.content,
        sequence: snapshot.sequence,
        baseRevision: revision,
      });
      // "superseded" means this session's draft already holds a later snapshot: kept either way.
      localSequence = Math.max(localSequence, snapshot.sequence);
      storageError = null;
    } catch (error) {
      storageError = error instanceof DraftStorageError ? error.kind : "failed";
    } finally {
      writeRunning = false;
    }
  }

  function queueWrite(snapshot: Snapshot) {
    pendingWrite = snapshot;
    if (drainQueued) return;
    drainQueued = true;
    void enqueue(drain);
  }

  /** The snapshot boundary: read the document, and keep it if it says something new. */
  function capture() {
    clearTimers();
    if (!changed) return;
    let json: JSONContent;
    try {
      json = source.read();
    } catch {
      // The source is gone: these changes stay counted as not kept.
      publish();
      return;
    }
    changed = false;
    const next = snapshotOf(latest.sequence + 1, json);
    if (!next.content) {
      // Not plain JSON: kept nowhere but the editor, and said so. The next change tries again.
      refusal = next.refusal;
    } else if (
      latest.content &&
      jsonEqual(next.content as JsonValue, latest.content as JsonValue)
    ) {
      // The same as the newest snapshot (an edit undone, a change to nothing): nothing new to keep.
      refusal = latest.refusal;
    } else {
      latest = next;
      refusal = next.refusal;
      queueWrite(next);
    }
    publish();
  }

  function onChange() {
    if (disposed) return;
    const first = !changed;
    changed = true;
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(capture, timing.localDebounceMs);
    maxWait ??= setTimeout(capture, timing.localMaxWaitMs);
    if (first) publish();
    for (const listener of [...changeListeners]) {
      try {
        listener();
      } catch (error) {
        queueMicrotask(() => {
          throw error;
        });
      }
    }
  }

  const unsubscribe = source.subscribe(onChange, () => {
    void dispose();
  });

  async function flush() {
    if (!disposed) capture();
    await chain;
    return getState();
  }

  function retry() {
    const unkept = latest.sequence > Math.max(localSequence, confirmedSequence);
    if (!disposed && storageError && unkept) queueWrite(latest);
    return flush();
  }

  function claimSave(): ClaimedSnapshot | null {
    if (disposed || saving !== null || !latest.content) return null;
    if (latest.sequence === 0 || latest.sequence <= confirmedSequence) return null;
    if (latest.refusal) return null;
    // Write ahead: its draft write has settled, so a confirmation is queued after it.
    if (pendingWrite || writeRunning) return null;
    saving = latest.sequence;
    publish();
    return {
      sequence: latest.sequence,
      content: latest.content,
      bytes: latest.bytes,
      expectedRevision: revision,
    };
  }

  function confirmSave(sequence: number, confirmedRevision: number): boolean {
    if (saving === null || sequence !== saving) return false;
    if (
      !draftInputs.revision.safeParse(confirmedRevision).success ||
      confirmedRevision < revision
    ) {
      return false;
    }
    saving = null;
    // The watermark first, so no write still waiting can make the cleared draft again.
    confirmedSequence = sequence;
    revision = confirmedRevision;
    localSequence = Math.max(localSequence, sequence);
    if (pendingWrite && pendingWrite.sequence <= sequence) pendingWrite = null;
    void enqueue(async () => {
      try {
        await storage.confirmDraft(owner, {
          outlineId,
          draftId,
          sequence,
          revision: confirmedRevision,
        });
      } catch {
        // The draft stays, holding what the server has: a candidate recovery finds equal and discards.
      }
    });
    publish();
    return true;
  }

  function releaseSave(sequence: number): boolean {
    if (saving === null || sequence !== saving) return false;
    saving = null;
    publish();
    return true;
  }

  function dispose(): Promise<void> {
    if (disposed) return chain;
    unsubscribe();
    capture();
    disposed = true;
    clearTimers();
    // The last state is told once; nothing after it.
    const state = getState();
    for (const listener of [...listeners]) {
      try {
        listener(state);
      } catch (error) {
        queueMicrotask(() => {
          throw error;
        });
      }
    }
    listeners.clear();
    changeListeners.clear();
    return chain;
  }

  return {
    owner,
    outlineId,
    draftId,
    getState,
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    onDocumentChange(listener) {
      if (disposed) return () => {};
      changeListeners.add(listener);
      return () => {
        changeListeners.delete(listener);
      };
    },
    flush,
    retry,
    claimSave,
    confirmSave,
    releaseSave,
    dispose,
  };
}
