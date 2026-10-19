import { minRefreshMs, type NotificationSummary } from "./model";

/*
 * When the bell asks the server again: one mechanism for every trigger, with
 * no React in it. Three kinds of ask:
 *
 * - `routine` (mount, the fallback interval, the tab shown again, focus, the
 *   bell coming on screen): at most one per `minRefreshMs`, unless one is owed.
 * - `event` (the network back, the service worker saying a push arrived) and
 *   `explicit` (the panel opened, a notification marked read): not throttled.
 *
 * Nothing is asked while the bell is off screen, its tab is hidden, or the
 * browser says it is offline (`canAsk`); an event or explicit ask refused
 * that way is owed, and the next routine ask makes it. Two asks never run at
 * once: a routine ask during one is dropped, any other is owed and made once
 * the current one settles. `invalidate()` (around a read-state write) makes
 * any answer started before it be thrown away, so an older answer can never
 * put back what the person just read. A failure is reported once and not
 * retried; the next trigger asks again.
 */

export type RefreshMode = "routine" | "event" | "explicit";

export type RefreshResult = { ok: true; data: NotificationSummary } | { ok: false };

export type RefresherOptions = {
  fetchSummary: (signal: AbortSignal) => Promise<NotificationSummary>;
  apply: (result: RefreshResult) => void;
  canAsk: () => boolean;
  now?: () => number;
};

export function createRefresher({
  fetchSummary,
  apply,
  canAsk,
  now = () => Date.now(),
}: RefresherOptions) {
  let disposed = false;
  let inFlight: AbortController | null = null;
  let lastStarted = Number.NEGATIVE_INFINITY;
  let owed = false;
  let epoch = 0;

  function refresh(mode: RefreshMode): void {
    if (disposed) return;
    if (inFlight) {
      if (mode !== "routine") owed = true;
      return;
    }
    if (!canAsk()) {
      if (mode !== "routine") owed = true;
      return;
    }
    if (mode === "routine" && !owed && now() - lastStarted < minRefreshMs) return;
    void run();
  }

  async function run() {
    const controller = new AbortController();
    inFlight = controller;
    owed = false;
    lastStarted = now();
    const startedAt = epoch;
    let result: RefreshResult;
    try {
      result = { ok: true, data: await fetchSummary(controller.signal) };
    } catch {
      result = { ok: false };
    }
    if (disposed || inFlight !== controller) return;
    inFlight = null;
    if (startedAt === epoch) apply(result);
    else owed = true;
    if (owed) refresh("event");
  }

  return {
    refresh,
    /** Throws away any answer already on its way; call before and after a read-state write. */
    invalidate() {
      epoch += 1;
    },
    dispose() {
      disposed = true;
      inFlight?.abort();
      inFlight = null;
    },
  };
}

export type Refresher = ReturnType<typeof createRefresher>;
