/**
 * How the library is drawn: cards, or compact rows. It is a preference of
 * this browser, kept in `localStorage`, and never part of the library's URL:
 * a shared link should not change how someone else likes to read.
 *
 * The choice in force is one attribute on <html>, `data-library-view`, which
 * the `list-view:` variant in globals.css reads. The results are one piece of
 * markup either way, so nothing re-renders and nothing can mismatch at
 * hydration.
 */
export const libraryViews = ["cards", "list"] as const;
export type LibraryView = (typeof libraryViews)[number];

export const defaultLibraryView: LibraryView = "cards";
export const libraryViewKey = "library-view";

const listeners = new Set<() => void>();

/** The stored preference, or cards when there is none or storage is unavailable. */
export function readLibraryView(): LibraryView {
  try {
    const stored = window.localStorage.getItem(libraryViewKey);
    return libraryViews.includes(stored as LibraryView)
      ? (stored as LibraryView)
      : defaultLibraryView;
  } catch {
    return defaultLibraryView;
  }
}

/** Puts the preference in force on the page. Safe to call again and again. */
export function applyLibraryView(view: LibraryView = readLibraryView()) {
  document.documentElement.dataset.libraryView = view;
}

/** Remembers the choice and applies it. */
export function storeLibraryView(view: LibraryView) {
  try {
    window.localStorage.setItem(libraryViewKey, view);
  } catch {
    // Private browsing, or storage refused: the choice lasts for this page.
  }
  applyLibraryView(view);
  listeners.forEach((notify) => notify());
}

/** For `useSyncExternalStore`: this tab's changes, and another tab's. */
export function subscribeLibraryView(notify: () => void) {
  listeners.add(notify);
  window.addEventListener("storage", notify);
  return () => {
    listeners.delete(notify);
    window.removeEventListener("storage", notify);
  };
}

/** Runs before the first paint, from the server's HTML (see `LibraryViewScript`). */
export const libraryViewScript = `(function(){try{var v=localStorage.getItem("${libraryViewKey}");if(v==="list"||v==="cards")document.documentElement.dataset.libraryView=v}catch(e){}})()`;
