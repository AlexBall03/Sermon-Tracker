import type { Connectivity } from "../persistence/autosave/connectivity";
import type { IdentitySignal } from "../persistence/session/session";

/*
 * The browser's two signals for an editor session (A3): who is signed in, from
 * Clerk, and whether the browser says it is online. Both are advice the
 * session checks against; neither authorizes anything (the server does).
 */

/**
 * An identity a React component feeds: `set` is called with Clerk's user ID
 * on each render, and listeners hear only real changes. Null is signed out.
 */
export function identitySignal(initial: string | null): IdentitySignal & {
  set(next: string | null): void;
} {
  let current = initial;
  const listeners = new Set<() => void>();
  return {
    current: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(next) {
      if (next === current) return;
      current = next;
      for (const listener of [...listeners]) listener();
    },
  };
}

/**
 * The browser's `online` and `offline` events (A2.3B.2C, wired in A3).
 * `navigator.onLine` is advice: offline holds new requests back and cancels
 * nothing, and a device wrongly saying offline keeps the words on the device.
 */
export function browserConnectivity(target: Window = window): Connectivity {
  return {
    online: () => target.navigator.onLine !== false,
    subscribe(listener) {
      const online = () => listener(true);
      const offline = () => listener(false);
      target.addEventListener("online", online);
      target.addEventListener("offline", offline);
      return () => {
        target.removeEventListener("online", online);
        target.removeEventListener("offline", offline);
      };
    },
  };
}
