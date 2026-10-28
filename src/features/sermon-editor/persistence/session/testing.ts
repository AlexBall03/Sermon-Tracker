import type { JSONContent } from "@tiptap/core";

import type { Connectivity } from "../autosave/connectivity";
import type { DocumentSource } from "../autosave/model";
import type { DocumentTransport } from "../autosave/transport";
import { canonicalDocument } from "../canonical";
import type { DocumentReadOutcome, DocumentSaveOutcome, DocumentSaveRequest } from "../saving";
import type { ChannelFactory, ChannelLike } from "./channel";
import type { IdentitySignal } from "./session";
import type { PageLifecycleTarget } from "./lifecycle";
import type { LockManagerLike } from "./ownership";

/*
 * Stand-ins for the browser in the editor session's tests (A2.3B.3): Web
 * Locks and BroadcastChannel shared by pretend tabs, a page's events, the
 * signed-in identity, and a server that writes only at the revision a save
 * names (as `updateDocument` does). Test code only.
 */

const abortError = () =>
  Object.assign(new Error("The request was aborted."), { name: "AbortError" });

type LockRequest = {
  tab: string;
  name: string;
  callback: (lock: unknown) => Promise<unknown>;
  resolve(value: unknown): void;
  reject(error: unknown): void;
  granted: boolean;
  dead: boolean;
};

/**
 * Web Locks as the browser keeps them: exclusive per name across every tab,
 * granted in order, a held lock freed when its callback settles or its tab
 * closes. With `manual`, grants wait for `grant()`, so a test can act just
 * before, during, and after one.
 */
export function fakeLocks({ manual = false }: { manual?: boolean } = {}) {
  const held = new Map<string, LockRequest>();
  const queues = new Map<string, LockRequest[]>();
  const scheduled: (() => void)[] = [];
  const schedule = (work: () => void) => {
    if (manual) scheduled.push(work);
    else queueMicrotask(work);
  };

  function finish(request: LockRequest, settle: () => void) {
    if (request.dead) return;
    if (held.get(request.name) === request) held.delete(request.name);
    settle();
    schedule(() => next(request.name));
  }

  function grant(request: LockRequest) {
    held.set(request.name, request);
    request.granted = true;
    let result: Promise<unknown>;
    try {
      result = Promise.resolve(request.callback({ name: request.name }));
    } catch (error) {
      result = Promise.reject(error);
    }
    result.then(
      (value) => finish(request, () => request.resolve(value)),
      (error) => finish(request, () => request.reject(error)),
    );
  }

  function next(name: string) {
    if (held.has(name)) return;
    const waiting = queues.get(name) ?? [];
    const first = waiting.shift();
    if (first) grant(first);
  }

  return {
    forTab(tab: string): LockManagerLike {
      return {
        request(name, options, callback) {
          return new Promise((resolve, reject) => {
            const request: LockRequest = {
              tab,
              name,
              callback,
              resolve,
              reject,
              granted: false,
              dead: false,
            };
            // As the browser does: `signal` with `ifAvailable` is refused.
            if (options.ifAvailable && options.signal) {
              reject(
                Object.assign(new Error("ifAvailable with signal"), { name: "NotSupportedError" }),
              );
              return;
            }
            if (options.signal?.aborted) {
              reject(abortError());
              return;
            }
            if (options.ifAvailable) {
              schedule(() => {
                if (held.has(name) || (queues.get(name)?.length ?? 0) > 0) {
                  Promise.resolve(callback(null)).then(resolve, reject);
                } else grant(request);
              });
              return;
            }
            const queue = queues.get(name) ?? [];
            queue.push(request);
            queues.set(name, queue);
            options.signal?.addEventListener("abort", () => {
              if (request.granted) return;
              const at = queue.indexOf(request);
              if (at >= 0) queue.splice(at, 1);
              reject(abortError());
            });
            schedule(() => next(name));
          });
        },
      };
    },
    /** Runs the grants waiting (manual mode); returns how many ran. */
    grant() {
      const work = scheduled.splice(0);
      for (const run of work) run();
      return work.length;
    },
    /** The tab holding `name`, or null. */
    holder(name: string) {
      return held.get(name)?.tab ?? null;
    },
    /** The tab ends: the browser frees its locks and forgets its requests, answering none. */
    closeTab(tab: string) {
      for (const [name, request] of [...held]) {
        if (request.tab !== tab) continue;
        request.dead = true;
        held.delete(name);
        schedule(() => next(name));
      }
      for (const queue of queues.values()) {
        for (let at = queue.length - 1; at >= 0; at -= 1) {
          if (queue[at].tab === tab) queue.splice(at, 1);
        }
      }
    },
  };
}

type FakeChannel = ChannelLike & { tab: string; closed: boolean };

/**
 * BroadcastChannel between pretend tabs: delivered to every other open
 * channel, never to the sender, asynchronously. A test can drop, duplicate,
 * delay, or hold messages and release them in any order.
 */
export function fakeBus() {
  const channels = new Set<FakeChannel & { listeners: Set<(event: { data: unknown }) => void> }>();
  const posted: unknown[] = [];
  const holding: (() => void)[] = [];
  const mode = { drop: false, duplicate: false, hold: false };

  function deliver(from: FakeChannel, message: unknown) {
    posted.push(message);
    if (mode.drop) return;
    for (const target of channels) {
      if (target === from || target.closed) continue;
      const send = () => {
        if (target.closed) return;
        for (const listener of [...target.listeners])
          listener({ data: JSON.parse(JSON.stringify(message)) as unknown });
      };
      const times = mode.duplicate ? 2 : 1;
      for (let i = 0; i < times; i += 1) {
        if (mode.hold) holding.push(send);
        else queueMicrotask(send);
      }
    }
  }

  return {
    mode,
    posted,
    factory(tab: string): ChannelFactory {
      return () => {
        const listeners = new Set<(event: { data: unknown }) => void>();
        const channel = {
          tab,
          closed: false,
          listeners,
          postMessage(message: unknown) {
            if (channel.closed) throw new Error("closed");
            deliver(channel, message);
          },
          close() {
            channel.closed = true;
            channels.delete(channel);
          },
          addEventListener: (_: "message", listener: (event: { data: unknown }) => void) =>
            listeners.add(listener),
          removeEventListener: (_: "message", listener: (event: { data: unknown }) => void) =>
            listeners.delete(listener),
        };
        channels.add(channel);
        return channel;
      };
    },
    /** Delivers what was held, oldest first or newest first. */
    release(order: "fifo" | "reverse" = "fifo") {
      const work = holding.splice(0);
      if (order === "reverse") work.reverse();
      for (const send of work) send();
    },
    /** Sends a raw message as if from another tab. */
    inject(message: unknown) {
      for (const target of channels) {
        if (target.closed) continue;
        for (const listener of [...target.listeners])
          listener({ data: JSON.parse(JSON.stringify(message)) as unknown });
      }
    },
    closeTab(tab: string) {
      for (const channel of [...channels]) if (channel.tab === tab) channel.close();
    },
  };
}

/** A page's visibility and transitions. */
export function fakePage() {
  const doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
  const win = new EventTarget();
  const transition = (type: "pagehide" | "pageshow", persisted: boolean) => {
    const event = new Event(type);
    Object.defineProperty(event, "persisted", { value: persisted });
    win.dispatchEvent(event);
  };
  return {
    target: { document: doc, window: win } as unknown as PageLifecycleTarget,
    hide() {
      doc.visibilityState = "hidden";
      doc.dispatchEvent(new Event("visibilitychange"));
    },
    show() {
      doc.visibilityState = "visible";
      doc.dispatchEvent(new Event("visibilitychange"));
    },
    pagehide: (persisted: boolean) => transition("pagehide", persisted),
    pageshow: (persisted: boolean) => transition("pageshow", persisted),
  };
}

/** Who is signed in. */
export function fakeIdentity(initial: string | null) {
  let current = initial;
  const listeners = new Set<() => void>();
  const signal: IdentitySignal = {
    current: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    signal,
    /** Changes it, telling the listeners unless `silent` (a tab that has not heard yet). */
    set(next: string | null, { silent = false } = {}) {
      current = next;
      if (!silent) for (const listener of [...listeners]) listener();
    },
  };
}

export function fakeLink(online = true) {
  let state = online;
  const listeners = new Set<(online: boolean) => void>();
  const connectivity: Connectivity = {
    online: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    connectivity,
    set(next: boolean) {
      state = next;
      for (const listener of [...listeners]) listener(next);
    },
  };
}

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function canonical(json: unknown): JSONContent {
  const result = canonicalDocument(json);
  if (!result.ok) throw new Error("not a canonical document");
  return result.content;
}

/**
 * The server: one document, its revision, and a conditional update. Saves
 * are answered at once unless held (`hold()`), when each is an attempt the
 * test commits, answers, or loses, in any order. `sent` records every save
 * request any tab made.
 */
export function fakeServer(initial: JSONContent, revision = 8) {
  const server = { content: canonical(initial), revision, writes: 0, gone: false };
  type Attempt = {
    request: DocumentSaveRequest;
    commit(): DocumentSaveOutcome;
    respond(outcome: DocumentSaveOutcome): void;
    lose(): void;
  };
  const attempts: Attempt[] = [];
  const sent: DocumentSaveRequest[] = [];
  let holdSaves = false;
  let readAnswer: DocumentReadOutcome | null = null;

  function commit(request: DocumentSaveRequest): DocumentSaveOutcome {
    const { sequence } = request;
    if (server.gone) return { kind: "conflict", sequence, code: "missing" };
    if (request.expectedRevision !== server.revision) {
      return { kind: "conflict", sequence, code: "stale", revision: server.revision };
    }
    const prepared = canonicalDocument(request.content);
    if (!prepared.ok) return { kind: "refused", sequence, code: "invalid" };
    server.content = prepared.content;
    server.revision += 1;
    server.writes += 1;
    return { kind: "confirmed", sequence, revision: server.revision };
  }

  /** A transport as one tab sees the server. */
  const transport = (): DocumentTransport => ({
    save(request) {
      sent.push(copy(request));
      if (!holdSaves) return Promise.resolve(commit(request));
      return new Promise((resolve, reject) => {
        attempts.push({
          request,
          commit: () => commit(request),
          respond: resolve,
          lose: () => reject(new TypeError("Failed to fetch")),
        });
      });
    },
    read: () =>
      Promise.resolve(
        readAnswer ??
          (server.gone
            ? { kind: "missing" }
            : { kind: "found", content: copy(server.content), revision: server.revision }),
      ),
  });

  return {
    server,
    attempts,
    sent,
    transport,
    hold() {
      holdSaves = true;
    },
    /** Every read answers this until `null`. */
    answerReads(answer: DocumentReadOutcome | null) {
      readAnswer = answer;
    },
    /** Someone else saves the document. */
    external(content: JSONContent) {
      server.content = canonical(content);
      server.revision += 1;
      server.writes += 1;
    },
  };
}

/** An editor as autosave reads it; `edit` is what the write guard would allow or refuse. */
export function fakeSource(initial: JSONContent) {
  let current = copy(initial);
  let change: (() => void) | null = null;
  let end: (() => void) | null = null;
  const source: DocumentSource = {
    subscribe(onChange, onEnd) {
      change = onChange;
      end = onEnd;
      return () => {
        change = null;
        end = null;
      };
    },
    read: () => copy(current),
  };
  return {
    source,
    edit(next: JSONContent) {
      current = copy(next);
      change?.();
    },
    destroy() {
      end?.();
    },
    get current() {
      return current;
    },
  };
}
