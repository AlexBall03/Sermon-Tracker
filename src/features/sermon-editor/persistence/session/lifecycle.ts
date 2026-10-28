/*
 * The page's lifecycle events as an editor session needs them (A2.3B.3):
 * hidden, visible, `pagehide`, and `pageshow`, through an injected target so
 * a test can drive them. No `beforeunload` (it keeps a page out of the
 * back-forward cache), and nothing here waits: a browser may freeze or end a
 * hidden page at any moment, so what a handler starts is best effort.
 */

type Events = {
  addEventListener(type: string, listener: (event: Event) => void): void;
  removeEventListener(type: string, listener: (event: Event) => void): void;
};

export type PageLifecycleTarget = {
  document: Events & { readonly visibilityState: string };
  window: Events;
};

export type PageLifecycleHandlers = {
  hidden(): void;
  visible(): void;
  /** `persisted`: the page may come back from the back-forward cache. */
  pagehide(persisted: boolean): void;
  pageshow(persisted: boolean): void;
};

export function browserPage(): PageLifecycleTarget | null {
  if (typeof window === "undefined" || typeof document === "undefined") return null;
  return { document, window };
}

const persisted = (event: Event) => (event as { persisted?: unknown }).persisted === true;

/** Listens until the returned function is called (idempotent). */
export function bindPageLifecycle(
  target: PageLifecycleTarget,
  handlers: PageLifecycleHandlers,
): () => void {
  let bound = true;
  const visibility = () => {
    if (!bound) return;
    if (target.document.visibilityState === "hidden") handlers.hidden();
    else handlers.visible();
  };
  const hide = (event: Event) => {
    if (bound) handlers.pagehide(persisted(event));
  };
  const show = (event: Event) => {
    if (bound) handlers.pageshow(persisted(event));
  };
  target.document.addEventListener("visibilitychange", visibility);
  target.window.addEventListener("pagehide", hide);
  target.window.addEventListener("pageshow", show);
  return () => {
    if (!bound) return;
    bound = false;
    target.document.removeEventListener("visibilitychange", visibility);
    target.window.removeEventListener("pagehide", hide);
    target.window.removeEventListener("pageshow", show);
  };
}
