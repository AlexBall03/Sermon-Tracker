/*
 * Whether the browser says it has a network (A2.3B.2C), as the save
 * coordinator is told it. Injected, so the coordinator reads no `window` or
 * `navigator` and runs in a test with a stand-in; A3 wires the real signal.
 *
 * It is advice, never proof (as everywhere in this application): offline only
 * holds back requests that nothing is waiting on, and online only says when
 * to try again at once. A browser that says online may still reach no server,
 * so timeouts and the bounded retries stay in force either way.
 */

export type Connectivity = {
  /** What the browser says now. */
  online(): boolean;
  /**
   * Calls `listener` when that may have changed (repeated calls are fine).
   * Returns its unsubscribe, after which it is not called.
   */
  subscribe(listener: (online: boolean) => void): () => void;
};

/** The default: always online, never changing. */
export const alwaysOnline: Connectivity = {
  online: () => true,
  subscribe: () => () => {},
};
