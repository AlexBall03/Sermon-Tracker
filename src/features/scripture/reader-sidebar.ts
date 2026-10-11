/**
 * Whether the Bible reader's navigation is shown beside the text or put away.
 * It is a preference of this browser, kept in `localStorage`, as the
 * library's view is: someone who reads with it closed wants it closed on the
 * next visit too, and it is no part of the address.
 *
 * The choice in force is one attribute on <html>, `data-bible-sidebar`, which
 * the `sidebar-closed:` variant in globals.css reads, so the server's HTML
 * needs no knowledge of it and nothing can mismatch at hydration.
 */
export const sidebarKey = "bible-sidebar";

const listeners = new Set<() => void>();

/** True unless this browser put the navigation away. */
export function readSidebarOpen(): boolean {
  try {
    return window.localStorage.getItem(sidebarKey) !== "closed";
  } catch {
    return true;
  }
}

/** Puts the preference in force on the page. Safe to call again and again. */
export function applySidebar(open: boolean = readSidebarOpen()) {
  document.documentElement.dataset.bibleSidebar = open ? "open" : "closed";
}

/** Remembers the choice and applies it. */
export function storeSidebarOpen(open: boolean) {
  try {
    window.localStorage.setItem(sidebarKey, open ? "open" : "closed");
  } catch {
    // Private browsing, or storage refused: the choice lasts for this page.
  }
  applySidebar(open);
  listeners.forEach((notify) => notify());
}

/** For `useSyncExternalStore`: this tab's changes, and another tab's. */
export function subscribeSidebar(notify: () => void) {
  listeners.add(notify);
  window.addEventListener("storage", notify);
  return () => {
    listeners.delete(notify);
    window.removeEventListener("storage", notify);
  };
}

/** Runs before the first paint, from the server's HTML (see `ReaderSidebarScript`). */
export const sidebarScript = `(function(){try{if(localStorage.getItem("${sidebarKey}")==="closed")document.documentElement.dataset.bibleSidebar="closed"}catch(e){}})()`;
