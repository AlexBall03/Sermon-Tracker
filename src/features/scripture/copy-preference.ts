/**
 * What Ctrl or Command with C copies when verses are selected in the Bible
 * reader: their text, their reference, or a link to them. It is a preference
 * of this browser, kept in `localStorage` like the reader's other habits, and
 * chosen in Settings. The toolbar's three buttons always do what they say.
 */
export const copyKinds = ["text", "reference", "link"] as const;
export type CopyKind = (typeof copyKinds)[number];

export const defaultCopyKind: CopyKind = "text";
export const copyKindKey = "bible-copy";

export const copyKindLabels: Record<CopyKind, string> = {
  text: "Verse text",
  reference: "Reference",
  link: "Link",
};

const listeners = new Set<() => void>();

/** The stored choice, or the verse text when there is none or storage is unavailable. */
export function readCopyKind(): CopyKind {
  try {
    const stored = window.localStorage.getItem(copyKindKey);
    return copyKinds.includes(stored as CopyKind) ? (stored as CopyKind) : defaultCopyKind;
  } catch {
    return defaultCopyKind;
  }
}

/** Remembers the choice. */
export function storeCopyKind(kind: CopyKind) {
  try {
    window.localStorage.setItem(copyKindKey, kind);
  } catch {
    // Private browsing, or storage refused: the default stays in force.
  }
  listeners.forEach((notify) => notify());
}

/** For `useSyncExternalStore`: this tab's changes, and another tab's. */
export function subscribeCopyKind(notify: () => void) {
  listeners.add(notify);
  window.addEventListener("storage", notify);
  return () => {
    listeners.delete(notify);
    window.removeEventListener("storage", notify);
  };
}
