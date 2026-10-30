/*
 * Which points of a sermon document are folded, remembered on this device
 * (A3.1): a browser preference, never the document, the account, or the
 * server. One key per account and outline, so two accounts on one browser
 * never share folds. It is not the legacy editor's `outline-collapsed:<id>`:
 * that holds legacy entry IDs, which are not the document's point IDs.
 *
 * Storage that is missing, full, blocked, or holding something unreadable
 * means nothing is remembered; it never stops the editor. IDs that are no
 * longer points of the outline are ignored when read (`folding.ts`).
 */

const prefix = "sermon-document-folded:";

/** Kept for this page's life where the browser's storage cannot be used. */
const memory = new Map<string, readonly string[]>();

/** The key for one account's outline. */
export const foldKey = (owner: string, outlineId: string) => `${owner}:${outlineId}`;

const storageKey = (key: string) => `${prefix}${key}`;

export function readFolded(key: string): readonly string[] {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(storageKey(key));
  } catch {
    return memory.get(key) ?? [];
  }
  if (raw === null) return memory.get(key) ?? [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function storeFolded(key: string, ids: readonly string[]) {
  const unique = [...new Set(ids)];
  memory.set(key, unique);
  try {
    if (unique.length === 0) window.localStorage.removeItem(storageKey(key));
    else window.localStorage.setItem(storageKey(key), JSON.stringify(unique));
  } catch {
    // Kept in memory instead: folding is a convenience.
  }
}
