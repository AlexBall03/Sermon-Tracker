/**
 * Which points of an outline are folded shut. It is a preference of this
 * browser, kept in `localStorage` by outline, as the library's card or list
 * view is: how someone likes to look at an outline is not part of the outline,
 * and is never saved to the account.
 */
const key = (outlineId: string) => `outline-collapsed:${outlineId}`;

const none: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();
/** The last value read for each outline, so the same stored text is the same set. */
const cache = new Map<string, { raw: string | null; ids: ReadonlySet<string> }>();
/** What a browser that refuses storage holds for this page. */
const memory = new Map<string, string>();

function stored(outlineId: string): string | null {
  try {
    return window.localStorage.getItem(key(outlineId));
  } catch {
    return memory.get(outlineId) ?? null;
  }
}

/** The folded points of an outline. The same set is returned until it changes. */
export function readCollapsed(outlineId: string): ReadonlySet<string> {
  const raw = stored(outlineId);
  const held = cache.get(outlineId);
  if (held && held.raw === raw) return held.ids;
  let ids = none;
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) ids = new Set(parsed.filter((id) => typeof id === "string"));
    } catch {
      // Not ours, or damaged: nothing is folded.
    }
  }
  cache.set(outlineId, { raw, ids });
  return ids;
}

/** Remembers which points are folded. None is remembered as nothing at all. */
export function storeCollapsed(outlineId: string, ids: Iterable<string>) {
  const list = [...ids];
  const raw = list.length > 0 ? JSON.stringify(list) : null;
  try {
    if (raw) window.localStorage.setItem(key(outlineId), raw);
    else window.localStorage.removeItem(key(outlineId));
  } catch {
    // Private browsing, or storage refused: the choice lasts for this page.
    if (raw) memory.set(outlineId, raw);
    else memory.delete(outlineId);
  }
  listeners.forEach((notify) => notify());
}

/** For `useSyncExternalStore`: this tab's changes, and another tab's. */
export function subscribeCollapsed(notify: () => void) {
  listeners.add(notify);
  window.addEventListener("storage", notify);
  return () => {
    listeners.delete(notify);
    window.removeEventListener("storage", notify);
  };
}

/** What the server renders, and the browser until it has read its own: nothing folded. */
export const nothingCollapsed = () => none;
