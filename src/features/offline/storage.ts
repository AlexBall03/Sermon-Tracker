/*
 * What the browser says about its storage. Every figure is the browser's own
 * estimate, and some browsers give none: callers say "about" and cope with
 * nothing.
 */

export type StorageEstimate = { usage: number; quota: number } | null;

export async function estimateStorage(): Promise<StorageEstimate> {
  try {
    const estimate = await navigator.storage?.estimate?.();
    if (!estimate || typeof estimate.quota !== "number") return null;
    return { usage: estimate.usage ?? 0, quota: estimate.quota };
  } catch {
    return null;
  }
}

/**
 * Asks the browser not to clear this site's storage when space runs low. The
 * browser may say no, or not ask the person; either way nothing is lost by
 * asking.
 */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (await navigator.storage?.persisted?.()) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

/** True for the browser's "out of space" error, however it is wrapped. */
export function isQuotaError(error: unknown): boolean {
  for (let current = error; current; current = (current as { cause?: unknown }).cause) {
    const name = (current as { name?: unknown }).name;
    if (name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED") return true;
    if (!(current instanceof Object) || !("cause" in current)) break;
  }
  return false;
}

/** A byte count for people, in the interface's language. */
export function formatBytes(bytes: number, locale: string): string {
  const units = ["byte", "kilobyte", "megabyte", "gigabyte"] as const;
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit++;
  }
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit: units[unit],
    unitDisplay: "short",
    maximumFractionDigits: value < 10 && unit > 0 ? 1 : 0,
  }).format(value);
}
