import type { RenameResult } from "@/features/ideas/actions";

/*
 * Saving a sermon's title from the sermon editor's header (A4.3). The title
 * is the idea's (`ideas.title`), so it is saved by the idea's own
 * revision-checked rename (`renameSermonTitle`), never with the document,
 * and never queued on the device (owner's decision: online only).
 *
 * The rules, the same as the document's saves follow (A2.3B.2):
 *
 * - **One request at a time, made against a known revision** (R0). The
 *   server writes it only while the idea is still at R0, so of two requests
 *   made against R0 at most one is ever written.
 * - **A lost answer is uncertain**, never a failure: a timeout, a thrown
 *   call, or the server's `failed` may each have been written. The request
 *   is then *held*: nothing different is sent while it might still land.
 * - **Reconciled by reading back** (`GET /api/ideas/<id>/heading`), once by
 *   itself and then only when the person asks:
 *     - at R0 + 1 with the title sent: it was written (saved);
 *     - past R0 otherwise: it can no longer be written (the server's check
 *       refuses it), so it is released, as a conflict unless the title is
 *       already the one sent;
 *     - still at R0: it may yet arrive, and stays held.
 * - **The only resend is the held request itself**, the same title against
 *   the same R0, and only on a press: whichever of the two arrives first is
 *   written, and the other is refused.
 * - **Newer words wait.** A title typed while a request is held or in flight
 *   is kept and sent only once that request is settled.
 * - **Nothing is ever written over a change made elsewhere** (`stale`): the
 *   person chooses to keep theirs (sent against the revision the idea has now)
 *   or to use the one saved.
 *
 * Nothing here is stored: a title not yet saved is lost if the page is closed
 * or reloaded, which the header says, and the leave guard asks first.
 */

export type Submission = { title: string; expectedRevision: number };
export type Confirmed = { title: string; revision: number };

export type TitleSaveState =
  | { kind: "idle" }
  | { kind: "saving"; held: Submission }
  | { kind: "saved" }
  /** The answer was lost: the request may or may not have been written. Held. */
  | { kind: "uncertain"; held: Submission; checking: boolean }
  /** Changed elsewhere since R0: nothing of ours was written. */
  | { kind: "conflict"; mine: string; server: Confirmed }
  /** Definitely not written, and not to be sent again as it is. */
  | { kind: "refused"; mine: string; reason: "invalid" | "missing" | "unauthorized" };

export type TitleSnapshot = {
  state: TitleSaveState;
  /** The title as the server last said it is. */
  confirmed: Confirmed;
  /** A newer title typed while a request was held or in flight, waiting to be sent. */
  waiting: string | null;
};

export type HeadingRead =
  | { kind: "found"; title: string; revision: number }
  | { kind: "missing" }
  | { kind: "unauthorized" }
  | { kind: "failed" };

export type TitleTransport = {
  rename: (submission: Submission) => Promise<RenameResult>;
  read: () => Promise<HeadingRead>;
};

/** How long an answer is waited for before it counts as lost (the document's own limits). */
export const titleTiming = { saveMs: 15_000, readMs: 10_000 };

type Timers = {
  set: (run: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
};

const browserTimers: Timers = {
  set: (run, ms) => setTimeout(run, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

const timeout = Symbol("timeout");

export function createTitleSaver(
  start: Confirmed,
  transport: TitleTransport,
  timers: Timers = browserTimers,
) {
  let snapshot: TitleSnapshot = { state: { kind: "idle" }, confirmed: start, waiting: null };
  const listeners = new Set<() => void>();
  /** Every request and read is tagged; an answer to one that is no longer current is dropped. */
  let token = 0;
  let disposed = false;

  const set = (next: Partial<TitleSnapshot>) => {
    snapshot = { ...snapshot, ...next };
    for (const listener of listeners) listener();
  };

  function limited<T>(work: Promise<T>, ms: number): Promise<T | typeof timeout> {
    return new Promise((resolve, reject) => {
      const handle = timers.set(() => resolve(timeout), ms);
      work.then(
        (value) => {
          timers.clear(handle);
          resolve(value);
        },
        (error) => {
          timers.clear(handle);
          reject(error);
        },
      );
    });
  }

  /** The request settled: the idea now has this title. Sends what was waiting, if anything. */
  function settle(confirmed: Confirmed) {
    const waiting = snapshot.waiting;
    set({ confirmed, waiting: null, state: { kind: "saved" } });
    if (waiting !== null && waiting !== confirmed.title) send(waiting);
  }

  /** Nothing of ours was written, and the idea is now `server`. */
  function release(held: Submission, server: Confirmed) {
    const mine = snapshot.waiting ?? held.title;
    if (server.title === mine) {
      set({ confirmed: server, waiting: null, state: { kind: "saved" } });
      return;
    }
    set({ confirmed: server, waiting: null, state: { kind: "conflict", mine, server } });
  }

  function send(title: string, against = snapshot.confirmed.revision) {
    const held: Submission = { title, expectedRevision: against };
    transmit(held);
  }

  function transmit(held: Submission) {
    if (disposed) return;
    const mine = (token += 1);
    set({ state: { kind: "saving", held } });
    limited(transport.rename(held), titleTiming.saveMs).then(
      (answer) => {
        if (mine !== token || disposed) return;
        if (answer === timeout) return lost(held);
        switch (answer.code) {
          case "renamed":
          case "unchanged":
            return settle({ title: answer.title, revision: answer.revision });
          case "stale":
            // The server refused it: nothing was written. Ours already, if the title is the same.
            if (answer.title === held.title) {
              return settle({ title: answer.title, revision: answer.revision });
            }
            return release(held, { title: answer.title, revision: answer.revision });
          case "missing":
          case "invalid":
          case "unauthorized":
            return set({
              waiting: null,
              state: { kind: "refused", mine: snapshot.waiting ?? held.title, reason: answer.code },
            });
          case "failed":
            // The statement may have committed.
            return lost(held);
        }
      },
      () => {
        if (mine === token && !disposed) lost(held);
      },
    );
  }

  /** No answer we can trust: held, and read back once. */
  function lost(held: Submission) {
    set({ state: { kind: "uncertain", held, checking: false } });
    check();
  }

  /** Reads the title back to settle a held request. Never sends anything. */
  function check() {
    const state = snapshot.state;
    if (state.kind !== "uncertain" || state.checking || disposed) return;
    const held = state.held;
    const mine = (token += 1);
    set({ state: { kind: "uncertain", held, checking: true } });
    limited(transport.read(), titleTiming.readMs).then(
      (read) => {
        if (mine !== token || disposed) return;
        if (read === timeout || read.kind === "failed") {
          return set({ state: { kind: "uncertain", held, checking: false } });
        }
        if (read.kind === "missing") {
          return set({ state: { kind: "refused", mine: held.title, reason: "missing" } });
        }
        if (read.kind === "unauthorized") {
          // Still held: it may yet have been written, and a sign-in does not change that.
          return set({ state: { kind: "uncertain", held, checking: false } });
        }
        const server = { title: read.title, revision: read.revision };
        if (read.revision === held.expectedRevision + 1 && read.title === held.title) {
          return settle(server);
        }
        if (read.revision > held.expectedRevision) return release(held, server);
        // Still at R0 (or, impossibly, before it): the request may still arrive.
        set({ state: { kind: "uncertain", held, checking: false } });
      },
      () => {
        if (mine === token && !disposed) {
          set({ state: { kind: "uncertain", held, checking: false } });
        }
      },
    );
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** What the header shows: the newest words not yet saved, else the saved title. */
    shown(): string {
      const { state, waiting, confirmed } = snapshot;
      if (waiting !== null) return waiting;
      if (state.kind === "saving" || state.kind === "uncertain") return state.held.title;
      if (state.kind === "conflict" || state.kind === "refused") return state.mine;
      return confirmed.title;
    },
    /** Whether words are here that the server has not been shown to have. */
    holdsWork(): boolean {
      const { state, waiting } = snapshot;
      return (
        waiting !== null ||
        state.kind === "saving" ||
        state.kind === "uncertain" ||
        state.kind === "conflict" ||
        (state.kind === "refused" && state.reason !== "missing")
      );
    },
    /** A new title, from the person. Sent now, or kept until the request before it is settled. */
    commit(title: string) {
      if (disposed) return;
      const state = snapshot.state;
      if (state.kind === "saving" || state.kind === "uncertain") {
        set({ waiting: title === state.held.title ? null : title });
        return;
      }
      if (state.kind === "conflict") {
        // Still not sent: the idea changed elsewhere, and only "Keep mine" sends over it.
        set({ state: { ...state, mine: title } });
        return;
      }
      if (title === snapshot.confirmed.title) {
        set({ state: { kind: "idle" } });
        return;
      }
      send(title);
    },
    /** "Try again": the held request itself, the same title against the same revision. */
    retry() {
      const state = snapshot.state;
      if (state.kind === "uncertain" && !state.checking) transmit(state.held);
    },
    /** "Check again": reads the title back. */
    check,
    /** "Keep mine": sent over the change made elsewhere, against the revision the idea has now. */
    keepMine() {
      const state = snapshot.state;
      if (state.kind === "conflict") send(state.mine, state.server.revision);
    },
    /** "Use theirs": the saved title is shown, and mine is dropped. */
    useTheirs() {
      if (snapshot.state.kind === "conflict") set({ state: { kind: "idle" }, waiting: null });
    },
    /** A refused title is put back to the saved one (Escape, or a fresh start). */
    dismiss() {
      if (snapshot.state.kind === "refused" || snapshot.state.kind === "saved") {
        set({ state: { kind: "idle" } });
      }
    },
    /** The page says the idea is now this (a newer copy), taken only while nothing is held. */
    observe(server: Confirmed) {
      if (server.revision <= snapshot.confirmed.revision) return;
      const state = snapshot.state;
      if (state.kind === "idle" || state.kind === "saved") set({ confirmed: server });
    },
    dispose() {
      disposed = true;
      listeners.clear();
    },
  };
}

export type TitleSaver = ReturnType<typeof createTitleSaver>;

/** Reads the title back through the plain GET route (never a Server Action: it would queue). */
export async function readHeading(ideaId: string): Promise<HeadingRead> {
  const response = await fetch(`/api/ideas/${encodeURIComponent(ideaId)}/heading`, {
    cache: "no-store",
    credentials: "same-origin",
  });
  if (response.status === 404) return { kind: "missing" };
  if (response.status === 401) return { kind: "unauthorized" };
  if (!response.ok) return { kind: "failed" };
  const body = (await response.json().catch(() => null)) as {
    title?: unknown;
    revision?: unknown;
  } | null;
  if (typeof body?.title !== "string" || !Number.isInteger(body.revision))
    return { kind: "failed" };
  return { kind: "found", title: body.title, revision: body.revision as number };
}
