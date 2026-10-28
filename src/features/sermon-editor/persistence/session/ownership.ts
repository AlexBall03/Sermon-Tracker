/*
 * The editing lock (A2.3B.3): one Web Lock per account and outline
 * (`lockName`), held by at most one session in a browser profile. Exclusive
 * across tabs and within one tab alike. It says who may edit here, never
 * what the server holds: a lock that is free proves nothing about an earlier
 * session's save.
 *
 * - A held lock is a callback whose promise is resolved only by `release()`.
 *   The browser frees it by itself when the tab ends.
 * - Every request is cancellable. A grant that arrives after the request was
 *   abandoned (disposed, aborted, or answered already) is released at once and
 *   reported to no one, so a late grant never activates a session.
 * - Within one tab, a session that is ending registers when its lock (or its
 *   pending request) is really gone (`ReleaseRegistry`); the next session for
 *   the same lock waits for that first. React's Strict Mode mounts, unmounts,
 *   and mounts again; without this, the second mount would find its own
 *   predecessor still holding the lock. Each session only ever releases its
 *   own lock: an old session's cleanup can never free a newer one's.
 *
 * Only a lock manager is used; no `window` or `navigator` unless the default.
 */

export type LockManagerLike = {
  request(
    name: string,
    options: { ifAvailable?: boolean; signal?: AbortSignal },
    callback: (lock: unknown) => Promise<unknown>,
  ): Promise<unknown>;
};

/** Ends of locks in this tab still in progress, by name: what a new session waits for. */
export type ReleaseRegistry = Map<string, Promise<void>>;

/** The tab's own registry. A test gives each pretend tab its own. */
export const tabReleases: ReleaseRegistry = new Map();

export function browserLocks(): LockManagerLike | null {
  if (typeof navigator === "undefined" || !("locks" in navigator) || !navigator.locks) return null;
  return navigator.locks as unknown as LockManagerLike;
}

export type AcquireResult = "held" | "busy" | "aborted" | "unavailable";

export type Ownership = {
  readonly name: string;
  /** This session holds the lock now. */
  held(): boolean;
  /** Takes the lock only if it is free (`busy` otherwise). */
  tryAcquire(): Promise<AcquireResult>;
  /** Waits in line for the lock until it is granted or `signal` aborts. */
  waitFor(signal: AbortSignal): Promise<AcquireResult>;
  /** Called once if the browser takes a held lock away. */
  onLost(listener: () => void): void;
  /** Frees the lock if held; resolves when the browser has. Idempotent. */
  release(): Promise<void>;
  /**
   * Refuses every later request and abandons a pending one at once; frees a
   * held lock only once `after` has settled (the session's last local work),
   * and registers that end in this tab now, so a new session waits for it.
   * Idempotent.
   */
  dispose(after?: Promise<unknown>): Promise<void>;
};

const isAbort = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  (error as { name?: unknown }).name === "AbortError";

export function createOwnership({
  locks,
  name,
  releases = tabReleases,
}: {
  locks: LockManagerLike;
  name: string;
  releases?: ReleaseRegistry;
}): Ownership {
  let disposed = false;
  /** The request in progress (pending or held): its abort, and its promise. */
  let request: { abort: AbortController; done: Promise<void> } | null = null;
  let holding: { release: () => void } | null = null;
  let lostListener: (() => void) | null = null;
  let ending: Promise<void> | null = null;

  /** Registers `work` as this tab's end of the lock, until it settles. */
  function register(work: Promise<void>) {
    releases.set(name, work);
    void work.finally(() => {
      if (releases.get(name) === work) releases.delete(name);
    });
  }

  async function ask(ifAvailable: boolean, external?: AbortSignal): Promise<AcquireResult> {
    if (disposed) return "aborted";
    if (holding) return "held";
    if (request) return "busy";
    // A session of this tab that is ending goes first (Strict Mode, a quick remount).
    const before = releases.get(name);
    if (before) await before.catch(() => undefined);
    if (disposed) return "aborted";
    if (holding) return "held";
    if (request) return "busy";
    if (external?.aborted) return "aborted";

    const abort = new AbortController();
    const forward = () => abort.abort();
    external?.addEventListener("abort", forward, { once: true });

    let answer!: (result: AcquireResult) => void;
    const result = new Promise<AcquireResult>((resolve) => {
      answer = resolve;
    });
    let answered = false;
    const settle = (value: AcquireResult) => {
      if (answered) return;
      answered = true;
      external?.removeEventListener("abort", forward);
      answer(value);
    };
    let grantedHere = false;

    let promise: Promise<unknown>;
    try {
      // Web Locks refuse `signal` with `ifAvailable` (NotSupportedError): such a request is
      // answered at once, and a grant nobody wants any more is given back in the callback.
      promise = locks.request(
        name,
        ifAvailable ? { ifAvailable: true } : { signal: abort.signal },
        (lock) => {
          if (!lock) {
            settle("busy");
            return Promise.resolve();
          }
          // A grant nobody waits for any more is given straight back.
          if (disposed || abort.signal.aborted || answered) return Promise.resolve();
          grantedHere = true;
          return new Promise<void>((free) => {
            holding = { release: free };
            settle("held");
          });
        },
      );
    } catch {
      external?.removeEventListener("abort", forward);
      return "unavailable";
    }

    const done = promise.then(
      () => {
        if (grantedHere && holding) {
          // Released without `release()`: not something this module does.
          holding = null;
          lostListener?.();
        }
        settle("aborted");
      },
      (error: unknown) => {
        if (grantedHere) {
          // A held lock taken away (stolen, or the manager failed).
          const wasHeld = holding !== null;
          holding = null;
          if (wasHeld) lostListener?.();
          settle("aborted");
          return;
        }
        settle(isAbort(error) ? "aborted" : "unavailable");
      },
    );
    request = { abort, done };
    void done.finally(() => {
      if (request?.done === done) request = null;
    });
    return result;
  }

  async function release() {
    const current = request;
    if (holding) {
      const free = holding.release;
      holding = null;
      free();
    } else {
      current?.abort.abort();
    }
    if (current) await current.done;
  }

  return {
    name,
    held: () => holding !== null,
    tryAcquire: () => ask(true),
    waitFor: (signal) => ask(false, signal),
    onLost(listener) {
      lostListener = listener;
    },
    release() {
      const active = request !== null || holding !== null;
      const work = release();
      if (active) register(work);
      return work;
    },
    dispose(after) {
      if (ending) return ending;
      disposed = true;
      lostListener = null;
      // A request not yet granted is abandoned now; a grant arriving later is given straight back.
      if (!holding) request?.abort.abort();
      ending = Promise.resolve(after)
        .catch(() => undefined)
        .then(release);
      register(ending);
      return ending;
    },
  };
}
